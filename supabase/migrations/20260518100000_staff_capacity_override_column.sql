-- ============================================================
-- Staff capacity override
--
-- Adds three columns to bookings:
--   staff_capacity_override     — client sets true to opt in
--   staff_capacity_override_by  — trigger fills from auth.uid()
--   staff_capacity_override_at  — trigger fills from now()
--
-- Patches validate_booking_capacity() to skip physical-capacity
-- RAISE EXCEPTIONs when (is_staff() AND staff_capacity_override).
-- Data-integrity checks ("Invalid slot") stay unconditional.
-- The trigger nulls _by/_at on rows where the override is not
-- honoured, so a non-staff client can't poison the audit columns.
-- ============================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS staff_capacity_override    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_capacity_override_by uuid        REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS staff_capacity_override_at timestamptz;

COMMENT ON COLUMN bookings.staff_capacity_override IS
  'True if a staff member explicitly overrode a physical-capacity rejection for this booking. Only honoured when is_staff() at insert/update time.';
COMMENT ON COLUMN bookings.staff_capacity_override_by IS
  'auth.users.id of the staff member who confirmed the override. Populated by the validate_booking_capacity trigger from auth.uid() when the override is honoured.';
COMMENT ON COLUMN bookings.staff_capacity_override_at IS
  'Timestamp the override was applied. Populated by the trigger from now().';

CREATE OR REPLACE FUNCTION validate_booking_capacity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_enforce      boolean;
  v_override     boolean;
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
  v_prev_slot    text;
  v_next_slot    text;
BEGIN
  SELECT COALESCE(sc.enforce_server_capacity, true)
    INTO v_enforce
    FROM salon_config sc
   LIMIT 1;

  IF NOT FOUND THEN
    v_enforce := true;
  END IF;

  -- Resolve & stamp the override before any capacity checks run.
  v_override := COALESCE(NEW.staff_capacity_override, false) AND is_staff();
  IF v_override THEN
    NEW.staff_capacity_override_by := auth.uid();
    NEW.staff_capacity_override_at := now();
  ELSE
    NEW.staff_capacity_override_by := NULL;
    NEW.staff_capacity_override_at := NULL;
  END IF;

  IF NOT v_enforce THEN
    RETURN NEW;
  END IF;

  v_slots := active_slots();

  IF TG_OP = 'UPDATE' THEN
    v_exclude_id := NEW.id;
  ELSE
    v_exclude_id := NULL;
  END IF;

  v_seats_used := ARRAY[]::integer[];
  FOR i IN 1..array_length(v_slots, 1) LOOP
    v_seats_used := v_seats_used || get_seats_used(NEW.booking_date, v_slots[i], v_exclude_id);
  END LOOP;

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

  v_max_seats := get_max_seats_for_slot(v_slot_index, v_seats_used);

  IF NEW.slot = '13:00' AND v_early_close THEN
    v_max_seats := 0;
  END IF;

  -- LARGE DOG RULES
  IF NEW.size = 'large' THEN

    -- Mid-morning block — approval gate (separate from capacity override).
    IF NOT is_large_dog_slot(NEW.slot) THEN
      IF NOT is_staff() THEN
        RAISE EXCEPTION 'Large dogs need approval for this slot (%)' , NEW.slot;
      END IF;
    END IF;

    -- 09:00 conditional
    IF NEW.slot = '09:00' THEN
      IF get_seats_used(NEW.booking_date, '08:30', v_exclude_id) > 0
         AND NOT v_override THEN
        RAISE EXCEPTION '09:00 large dog conditional: 08:30 must be empty';
      END IF;
      IF get_seats_used(NEW.booking_date, '10:00', v_exclude_id) > 1
         AND NOT v_override THEN
        RAISE EXCEPTION '09:00 large dog conditional: 10:00 must have 0-1 seats used';
      END IF;
    END IF;

    -- 12:00 conditional
    IF NEW.slot = '12:00' THEN
      IF get_seats_used(NEW.booking_date, '13:00', v_exclude_id) > 0
         AND NOT v_override THEN
        RAISE EXCEPTION '12:00 large dog requires 13:00 to be empty (early close)';
      END IF;
    END IF;

    -- 13:00 early close
    IF NEW.slot = '13:00' AND v_early_close AND NOT v_override THEN
      RAISE EXCEPTION '13:00 is closed — large dog at 12:00 triggered early close';
    END IF;

    v_can_share := large_dog_can_share(NEW.slot);

    -- Back-to-back full-takeover
    IF NOT v_can_share THEN
      IF v_slot_index > 1 THEN
        v_prev_slot := v_slots[v_slot_index - 1];
        IF is_large_dog_slot(v_prev_slot)
           AND NOT large_dog_can_share(v_prev_slot)
           AND has_large_dog(NEW.booking_date, v_prev_slot, v_exclude_id) THEN
          IF NOT (
            (v_prev_slot = '12:30' AND NEW.slot = '13:00') OR
            (v_prev_slot = '13:00' AND NEW.slot = '12:30')
          ) AND NOT v_override THEN
            RAISE EXCEPTION 'Back-to-back large dogs only allowed at 12:30 + 13:00';
          END IF;
        END IF;
      END IF;

      IF v_slot_index < array_length(v_slots, 1) THEN
        v_next_slot := v_slots[v_slot_index + 1];
        IF is_large_dog_slot(v_next_slot)
           AND NOT large_dog_can_share(v_next_slot)
           AND has_large_dog(NEW.booking_date, v_next_slot, v_exclude_id) THEN
          IF NOT (
            (NEW.slot = '12:30' AND v_next_slot = '13:00') OR
            (NEW.slot = '13:00' AND v_next_slot = '12:30')
          ) AND NOT v_override THEN
            RAISE EXCEPTION 'Back-to-back large dogs only allowed at 12:30 + 13:00';
          END IF;
        END IF;
      END IF;
    END IF;

    -- Shareable slot — second large dog blocked
    IF v_can_share AND v_has_large AND NOT v_override THEN
      RAISE EXCEPTION 'Only a small/medium dog can share this slot with a large dog';
    END IF;

    -- Full-takeover slot must be empty
    IF NOT v_can_share AND is_large_dog_slot(NEW.slot) AND v_used > 0 AND NOT v_override THEN
      RAISE EXCEPTION 'Large dog fills this slot — already has bookings';
    END IF;

    -- Full-takeover needs 2 seats but 2-2-1 caps at 1
    IF NOT v_can_share AND is_large_dog_slot(NEW.slot)
       AND v_seats_needed > v_max_seats AND NOT v_override THEN
      RAISE EXCEPTION 'Not enough capacity (2-2-1 rule)';
    END IF;

  END IF;

  -- GENERAL CHECKS (all sizes)
  IF (v_used + v_seats_needed) > v_max_seats AND NOT v_override THEN
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

  IF NEW.size <> 'large' AND v_has_large AND NOT v_override THEN
    IF is_large_dog_slot(NEW.slot) AND NOT large_dog_can_share(NEW.slot) THEN
      RAISE EXCEPTION 'Large dog fills this slot';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
