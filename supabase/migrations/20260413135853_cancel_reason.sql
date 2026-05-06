-- Add cancel_reason column to bookings for tracking why customers cancel
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancel_reason text;

-- Allow customers to update their own future bookings (for cancellation with reason)
-- They can only set status to 'Cancelled' and provide a cancel_reason
CREATE POLICY "customer_cancel_own_bookings_update" ON bookings
  FOR UPDATE TO authenticated
  USING (
    booking_date >= current_date
    AND EXISTS (
      SELECT 1 FROM dogs
      JOIN humans ON humans.id = dogs.human_id
      WHERE dogs.id = bookings.dog_id
      AND humans.customer_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    status = 'Cancelled'
    AND booking_date >= current_date
    AND EXISTS (
      SELECT 1 FROM dogs
      JOIN humans ON humans.id = dogs.human_id
      WHERE dogs.id = bookings.dog_id
      AND humans.customer_user_id = (SELECT auth.uid())
    )
  );
