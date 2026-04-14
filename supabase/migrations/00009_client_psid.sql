-- Add PSID (Platform-Specific ID) to clients for linking conversations to clients
ALTER TABLE clients ADD COLUMN psid text;
CREATE INDEX idx_clients_psid ON clients(psid);
