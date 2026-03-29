-- ============================================================
-- 006: Server-side capacity validation trigger
--
-- Replicates the client-side canBookSlot() logic from
-- src/engine/capacity.js as a BEFORE INSERT OR UPDATE trigger
-- on the bookings table. This is the safety net against
-- anyone bypassing the UI with a direct Supabase call.
-- ============================================================

-- 1. Safety flag — allows disabling server-side validation
ALTER TABLE salon_config
  ADD COLUMN IF NOT EXISTS enforce_server_capacity boolean DEFAULT true;

-- ============================================================
-- Active slots constant (used throughout)
-- ============================================================

CREATE OR REPLACE FUNCTION active_slots()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    '08:30','09:00','09:30','10:00','10:30',
    '11:00','11:30','12:00','12:30','13:00'
  ];
$$;

-- ============================================================
-- 2. get_seats_needed(size, slot)
--
-- Large dog seat cost depends on LARGE_DOG_SLOTS config:
--   08:30 = 1, 09:00 = 1, 12:00 = 1, 12:30 = 2, 13:00 = 2
--   All other slots (or no entry) = 2
-- Small/medium always = 1
-- ============================================================

CREATE OR REPLACE FUNCTION get_seats_needed(p_size text, p_slot text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_size <> 'large' THEN
    RETURN 1;
  END IF;

  -- Large dog seat costs from LARGE_DOG_SLOTS config
  CASE p_slot
    WHEN '08:30' THEN RETURN 1;
    WHEN '09:00' THEN RETURN 1;
    WHEN '12:00' THEN RETURN 1;
    WHEN '12:30' THEN RETURN 2;
    WHEN '13:00' THEN RETURN 2;
    ELSE RETURN 2;  -- no LARGE_DOG_SLOTS entry = 2 seats
  END CASE;
END;
$$;

-- ============================================================
-- 3. get_seats_used(booking_date, slot, exclude_id)
--
-- Counts total seats used by existing bookings in a slot,
-- optionally excluding a booking ID (for UPDATE operations).
-- ============================================================

CREATE OR REPLACE FUNCTION get_seats_used(
  p_date date,
  p_slot text,
  p_exclude_id uuid DEFAULT NULL
)
RETURNS integer LANGUAGE plpgsql STABLE AS $$
DECLARE
  total integer;
BEGIN
  SELECT COALESCE(SUM(get_seats_needed(b.size, b.slot)), 0)
    INTO total
    FROM bookings b
   WHERE b.booking_date = p_date
     AND b.slot = p_slot
     AND (p_exclude_id IS NULL OR b.id <> p_exclude_id);
  RETURN total;
END;
$$;

-- ============================================================
-- 4. has_large_dog(booking_date, slot, exclude_id)
-- ============================================================

CREATE OR REPLACE FUNCTION has_large_dog(
  p_date date,
  p_slot text,
  p_exclude_id uuid DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM bookings b
     WHERE b.booking_date = p_date
       AND b.slot = p_slot
       AND b.size = 'large'
       AND (p_exclude_id IS NULL OR b.id <> p_exclude_id)
  );
END;
$$;

-- ============================================================
-- 5. is_large_dog_slot(slot)
--
-- Returns true if the slot has a LARGE_DOG_SLOTS entry
-- (i.e. large dogs are pre-approved for this slot).
-- ============================================================

CREATE OR REPLACE FUNCTION is_large_dog_slot(p_slot text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_slot IN ('08:30','09:00','12:00','12:30','13:00');
$$;

-- ============================================================
-- 6. large_dog_can_share(slot)
--
-- Returns true if the LARGE_DOG_SLOTS entry has canShare=true.
-- 08:30, 09:00, 12:00 = true; 12:30, 13:00 = false
-- ============================================================

CREATE OR REPLACE FUNCTION large_dog_can_share(p_slot text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_slot IN ('08:30','09:00','12:00');
$$;

-- ============================================================
-- 7. get_max_seats_for_slot(slot_index, seats_used_array)
--
-- Implements the 2-2-1 rule. If any pair of adjacent slots
-- both have 2+ seats used, the slot between/around them
-- caps at 1 seat max.
--
-- seats_used_array: integer array indexed 1..10 matching
-- active_slots() order.
-- ============================================================

CREATE OR REPLACE FUNCTION get_max_seats_for_slot(
  p_slot_index integer,
  p_seats_used integer[]
)
RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  num_slots integer;
  prev_prev boolean;
  prev      boolean;
  nxt       boolean;
  nxt_nxt   boolean;
BEGIN
  num_slots := array_length(p_seats_used, 1);

  -- is_double: >= 2 seats used at given index
  prev_prev := (p_slot_index - 2 >= 1) AND (p_seats_used[p_slot_index - 2] >= 2);
  prev      := (p_slot_index - 1 >= 1) AND (p_seats_used[p_slot_index - 1] >= 2);
  nxt       := (p_slot_index + 1 <= num_slots) AND (p_seats_used[p_slot_index + 1] >= 2);
  nxt_nxt   := (p_slot_index + 2 <= num_slots) AND (p_seats_used[p_slot_index + 2] >= 2);

  -- Would creating a double here violate 2-2-1?
  IF (prev_prev AND prev) OR (prev AND nxt) OR (nxt AND nxt_nxt) THEN
    RETURN 1;
  END IF;

  RETURN 2;
END;
$$;

-- ============================================================
-- 8. validate_booking_capacity() — the main trigger function
--
-- Checks all capacity rules before allowing INSERT or UPDATE
-- on the bookings table. Mirrors canBookSlot() exactly.
-- ============================================================

CREATE OR REPLACE FUNCTION validate_booking_capacity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_enforce      boolean;
  v_slots        text[];
  v_exclude_id   uuid;
  v_seats_used   integer[];
  v_slot_index   integer;
  v_max_seats    integer;
  v_used         integer;
  v_seats_needed integer;
  v_early_close  boolean;
  v_has_large    boolean;
  v_can_share    boolean;
  i              integer;
  -- For back-to-back check
  v_prev_slot    text;
  v_next_slot    text;
BEGIN
  -- Check the safety flag
  SELECT COALESCE(sc.enforce_server_capacity, true)
    INTO v_enforce
    FROM salon_config sc
   LIMIT 1;

  -- If no config row exists, default to enforcing
  IF NOT FOUND THEN
    v_enforce := true;
  END IF;

  IF NOT v_enforce THEN
    RETURN NEW;
  END IF;

  v_slots := active_slots();

  -- For UPDATE, exclude the current booking from seat counts
  IF TG_OP = 'UPDATE' THEN
    v_exclude_id := NEW.id;
  ELSE
    v_exclude_id := NULL;
  END IF;

  -- Build seats-used array for all slots on this date
  v_seats_used := ARRAY[]::integer[];
  FOR i IN 1..array_length(v_slots, 1) LOOP
    v_seats_used := v_seats_used || get_seats_used(NEW.booking_date, v_slots[i], v_exclude_id);
  END LOOP;

  -- Find the index of the slot being booked
  v_slot_index := NULL;
  FOR i IN 1..array_length(v_slots, 1) LOOP
    IF v_slots[i] = NEW.slot THEN
      v_slot_index := i;
      EXIT;
    END IF;
  END LOOP;

  IF v_slot_index IS NULL THEN
    RAISE EXCEPTION 'Invalid slot: %', NEW.slot;
  END IF;

  v_seats_needed := get_seats_needed(NEW.size, NEW.slot);
  v_used := v_seats_used[v_slot_index];
  v_early_close := has_large_dog(NEW.booking_date, '12:00', v_exclude_id);
  v_has_large := has_large_dog(NEW.booking_date, NEW.slot, v_exclude_id);

  -- Calculate max seats (2-2-1 rule)
  v_max_seats := get_max_seats_for_slot(v_slot_index, v_seats_used);

  -- Early close: large dog at 12:00 kills 13:00 capacity
  IF NEW.slot = '13:00' AND v_early_close THEN
    v_max_seats := 0;
  END IF;

  -- ============================================================
  -- LARGE DOG RULES
  -- ============================================================
  IF NEW.size = 'large' THEN

    -- Rule 4: Mid-morning block (09:30-11:30) — no LARGE_DOG_SLOTS entry
    IF NOT is_large_dog_slot(NEW.slot) THEN
      RAISE EXCEPTION 'Large dogs need approval for this slot (%)' , NEW.slot;
    END IF;

    -- Rule 5: 09:00 conditional — 08:30 must be empty AND 10:00 <= 1
    IF NEW.slot = '09:00' THEN
      IF get_seats_used(NEW.booking_date, '08:30', v_exclude_id) > 0 THEN
        RAISE EXCEPTION '09:00 large dog conditional: 08:30 must be empty';
      END IF;
      IF get_seats_used(NEW.booking_date, '10:00', v_exclude_id) > 1 THEN
        RAISE EXCEPTION '09:00 large dog conditional: 10:00 must have 0-1 seats used';
      END IF;
    END IF;

    -- Rule 6: 12:00 conditional — 13:00 must be empty
    IF NEW.slot = '12:00' THEN
      IF get_seats_used(NEW.booking_date, '13:00', v_exclude_id) > 0 THEN
        RAISE EXCEPTION '12:00 large dog requires 13:00 to be empty (early close)';
      END IF;
    END IF;

    -- Rule 7: 13:00 early close — blocked if 12:00 has a large dog
    IF NEW.slot = '13:00' AND v_early_close THEN
      RAISE EXCEPTION '13:00 is closed — large dog at 12:00 triggered early close';
    END IF;

    v_can_share := large_dog_can_share(NEW.slot);

    -- Rule 10: Back-to-back full-takeover check
    -- Only applies to non-shareable slots (12:30, 13:00)
    IF NOT v_can_share THEN

      -- Check previous slot
      IF v_slot_index > 1 THEN
        v_prev_slot := v_slots[v_slot_index - 1];
        IF is_large_dog_slot(v_prev_slot)
           AND NOT large_dog_can_share(v_prev_slot)
           AND has_large_dog(NEW.booking_date, v_prev_slot, v_exclude_id) THEN
          -- Only 12:30 + 13:00 pair is allowed
          IF NOT (
            (v_prev_slot = '12:30' AND NEW.slot = '13:00') OR
            (v_prev_slot = '13:00' AND NEW.slot = '12:30')
          ) THEN
            RAISE EXCEPTION 'Back-to-back large dogs only allowed at 12:30 + 13:00';
          END IF;
        END IF;
      END IF;

      -- Check next slot
      IF v_slot_index < array_length(v_slots, 1) THEN
        v_next_slot := v_slots[v_slot_index + 1];
        IF is_large_dog_slot(v_next_slot)
           AND NOT large_dog_can_share(v_next_slot)
           AND has_large_dog(NEW.booking_date, v_next_slot, v_exclude_id) THEN
          IF NOT (
            (NEW.slot = '12:30' AND v_next_slot = '13:00') OR
            (NEW.slot = '13:00' AND v_next_slot = '12:30')
          ) THEN
            RAISE EXCEPTION 'Back-to-back large dogs only allowed at 12:30 + 13:00';
          END IF;
        END IF;
      END IF;
    END IF;

    -- Rule 8: Shareable slots — second large dog is blocked
    IF v_can_share AND v_has_large THEN
      RAISE EXCEPTION 'Only a small/medium dog can share this slot with a large dog';
    END IF;

    -- Rule 9: Full-takeover slots — must be empty
    IF NOT v_can_share AND v_used > 0 THEN
      RAISE EXCEPTION 'Large dog fills this slot — already has bookings';
    END IF;

    -- Rule 9 continued: Full-takeover needs 2 seats but 2-2-1 caps at 1
    IF NOT v_can_share AND v_seats_needed > v_max_seats THEN
      RAISE EXCEPTION 'Not enough capacity (2-2-1 rule)';
    END IF;

  END IF;

  -- ============================================================
  -- GENERAL CHECKS (all sizes)
  -- ============================================================

  -- Rule 11: seats_used + seats_needed must not exceed max_seats
  IF (v_used + v_seats_needed) > v_max_seats THEN
    IF NEW.size = 'large' THEN
      RAISE EXCEPTION 'Not enough capacity (2-2-1 rule)';
    ELSIF NEW.slot = '13:00' AND v_early_close THEN
      RAISE EXCEPTION '13:00 closed — early close from 12:00 large dog';
    ELSIF v_max_seats < 2 THEN
      RAISE EXCEPTION 'Capped at 1 (2-2-1 rule)';
    ELSE
      RAISE EXCEPTION 'Slot is full';
    END IF;
  END IF;

  -- Rule 12: Small/medium blocked by full-takeover large dog
  IF NEW.size <> 'large' AND v_has_large THEN
    IF is_large_dog_slot(NEW.slot) AND NOT large_dog_can_share(NEW.slot) THEN
      RAISE EXCEPTION 'Large dog fills this slot';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 9. The trigger definition
-- ============================================================

DROP TRIGGER IF EXISTS trg_validate_booking_capacity ON bookings;

CREATE TRIGGER trg_validate_booking_capacity
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION validate_booking_capacity();
