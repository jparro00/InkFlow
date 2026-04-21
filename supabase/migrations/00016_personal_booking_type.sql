-- Add "Personal" booking type + title column for non-client personal appointments
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_type_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_type_check
  CHECK (type IN ('Regular', 'Touch Up', 'Consultation', 'Full Day', 'Cover Up', 'Personal'));

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS title text;
