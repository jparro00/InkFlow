-- Add "Cover Up" as a valid booking type
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_type_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_type_check
  CHECK (type IN ('Regular', 'Touch Up', 'Consultation', 'Full Day', 'Cover Up'));
