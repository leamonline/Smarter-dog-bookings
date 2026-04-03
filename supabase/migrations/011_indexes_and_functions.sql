-- ============================================================
-- 011_indexes_and_functions.sql
-- Adds missing performance indexes, secures mutable search paths,
-- and patches RLS initplan issues by wrapping auth.uid()
-- ============================================================

-- 1. Covering indexes for Foreign Keys
CREATE INDEX IF NOT EXISTS idx_bookings_dog_id ON bookings(dog_id);
CREATE INDEX IF NOT EXISTS idx_bookings_pickup_by_id ON bookings(pickup_by_id);
CREATE INDEX IF NOT EXISTS idx_dogs_human_id ON dogs(human_id);
CREATE INDEX IF NOT EXISTS idx_human_trusted_contacts_trusted_id ON human_trusted_contacts(trusted_id);

-- 2. Secure mutable search paths on custom functions
DO $$
DECLARE
    func_rec record;
BEGIN
    FOR func_rec IN 
        SELECT oid::regprocedure AS func_signature 
        FROM pg_proc 
        WHERE proname IN (
            'update_modified_column',
            'large_dog_can_share',
            'get_max_seats_for_slot',
            'active_slots',
            'get_seats_needed',
            'get_seats_used',
            'has_large_dog',
            'is_large_dog_slot',
            'validate_booking_capacity',
            'notify_on_booking_insert',
            'notify_on_booking_delete'
        ) AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'ALTER FUNCTION ' || func_rec.func_signature || ' SET search_path = public';
    END LOOP;
END
$$;

-- 3. Fix auth.uid() INITPLAN performance warnings in RLS policies

-- staff_profiles
DROP POLICY IF EXISTS "Users can insert own profile" ON staff_profiles;
CREATE POLICY "Users can insert own profile" ON staff_profiles FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON staff_profiles;
CREATE POLICY "Users can update own profile" ON staff_profiles FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id AND role = (select sp.role from staff_profiles sp where sp.user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Owners can update any profile" ON staff_profiles;
CREATE POLICY "Owners can update any profile" ON staff_profiles FOR UPDATE TO authenticated USING (exists (select 1 from staff_profiles sp where sp.user_id = (select auth.uid()) and sp.role = 'owner')) WITH CHECK (exists (select 1 from staff_profiles sp where sp.user_id = (select auth.uid()) and sp.role = 'owner'));

-- humans
DROP POLICY IF EXISTS "customer_select_own_human" ON humans;
CREATE POLICY "customer_select_own_human" ON humans FOR SELECT TO authenticated USING (customer_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "customer_update_own_human" ON humans;
CREATE POLICY "customer_update_own_human" ON humans FOR UPDATE TO authenticated USING (customer_user_id = (select auth.uid())) WITH CHECK (customer_user_id = (select auth.uid()));

-- human_trusted_contacts
DROP POLICY IF EXISTS "customer_select_own_trusted_contacts" ON human_trusted_contacts;
CREATE POLICY "customer_select_own_trusted_contacts" ON human_trusted_contacts FOR SELECT TO authenticated USING (exists (select 1 from humans where humans.id = human_trusted_contacts.human_id and humans.customer_user_id = (select auth.uid())));

-- dogs
DROP POLICY IF EXISTS "customer_select_own_dogs" ON dogs;
CREATE POLICY "customer_select_own_dogs" ON dogs FOR SELECT TO authenticated USING (exists (select 1 from humans where humans.id = dogs.human_id and humans.customer_user_id = (select auth.uid())));

DROP POLICY IF EXISTS "customer_insert_own_dogs" ON dogs;
CREATE POLICY "customer_insert_own_dogs" ON dogs FOR INSERT TO authenticated WITH CHECK (exists (select 1 from humans where humans.id = dogs.human_id and humans.customer_user_id = (select auth.uid())));

-- bookings
DROP POLICY IF EXISTS "customer_select_own_bookings" ON bookings;
CREATE POLICY "customer_select_own_bookings" ON bookings FOR SELECT TO authenticated USING (exists (select 1 from dogs join humans on humans.id = dogs.human_id where dogs.id = bookings.dog_id and humans.customer_user_id = (select auth.uid())));

DROP POLICY IF EXISTS "customer_insert_own_bookings" ON bookings;
CREATE POLICY "customer_insert_own_bookings" ON bookings FOR INSERT TO authenticated WITH CHECK (exists (select 1 from dogs join humans on humans.id = dogs.human_id where dogs.id = bookings.dog_id and humans.customer_user_id = (select auth.uid())));

DROP POLICY IF EXISTS "customer_cancel_own_bookings" ON bookings;
CREATE POLICY "customer_cancel_own_bookings" ON bookings FOR DELETE TO authenticated USING (booking_date >= current_date and exists (select 1 from dogs join humans on humans.id = dogs.human_id where dogs.id = bookings.dog_id and humans.customer_user_id = (select auth.uid())));

-- salon_config
DROP POLICY IF EXISTS "owner_insert_salon_config" ON salon_config;
CREATE POLICY "owner_insert_salon_config" ON salon_config FOR INSERT TO authenticated WITH CHECK (exists (select 1 from staff_profiles where user_id = (select auth.uid()) and role = 'owner'));

DROP POLICY IF EXISTS "owner_update_salon_config" ON salon_config;
CREATE POLICY "owner_update_salon_config" ON salon_config FOR UPDATE TO authenticated USING (exists (select 1 from staff_profiles where user_id = (select auth.uid()) and role = 'owner')) WITH CHECK (exists (select 1 from staff_profiles where user_id = (select auth.uid()) and role = 'owner'));

DROP POLICY IF EXISTS "owner_delete_salon_config" ON salon_config;
CREATE POLICY "owner_delete_salon_config" ON salon_config FOR DELETE TO authenticated USING (exists (select 1 from staff_profiles where user_id = (select auth.uid()) and role = 'owner'));
