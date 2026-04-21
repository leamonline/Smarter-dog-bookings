-- Add a free-text relationship label to each trusted human pair
-- e.g. "husband", "dog walker", "neighbour"
ALTER TABLE human_trusted_contacts
  ADD COLUMN IF NOT EXISTS relationship TEXT;

COMMENT ON COLUMN human_trusted_contacts.relationship IS 'Free-text label describing the trusted person''s relationship to the owner (e.g. husband, dog walker, neighbour). One-way: each (human_id, trusted_id) row has its own label.';
