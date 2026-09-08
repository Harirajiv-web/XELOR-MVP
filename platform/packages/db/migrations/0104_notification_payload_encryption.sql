-- Invitation bearer links in live notifications are encrypted before persistence.
ALTER TABLE notification_outbox ADD COLUMN encrypted_payload text;
