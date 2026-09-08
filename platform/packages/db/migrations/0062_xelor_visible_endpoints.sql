-- Remove legacy prototype identifiers from values rendered in the XELOR UI.
-- Internal database, realm and package identifiers stay unchanged because they are
-- deployment contracts rather than customer-facing product copy.

UPDATE backup_job
SET
  target = replace(target, 'indcore-backups', 'xelor-backups'),
  updated_at = now()
WHERE target ILIKE '%indcore%';

UPDATE webhook_subscription
SET
  target_url = replace(target_url, '/indcore', '/xelor'),
  updated_at = now()
WHERE target_url ILIKE '%indcore%';

UPDATE credential
SET
  ciphertext_ref = replace(ciphertext_ref, '://indcore/', '://xelor/'),
  updated_at = now()
WHERE ciphertext_ref ILIKE '%indcore%';
