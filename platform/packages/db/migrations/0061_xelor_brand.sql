-- Refresh user-visible demo labels after the product became XELOR.
-- Internal package, realm and database identifiers remain stable compatibility contracts.

UPDATE licence_record
SET plan = CASE plan
  WHEN concat('IND', '-CORE Plant') THEN 'XELOR Plant'
  WHEN concat('IND', '-CORE Essentials') THEN 'XELOR Essentials'
  ELSE plan
END,
updated_at = now()
WHERE plan IN (concat('IND', '-CORE Plant'), concat('IND', '-CORE Essentials'));

UPDATE role
SET name = 'XELOR Administrator',
    updated_at = now()
WHERE code = 'demo_admin'
  AND name = concat('IND', '-CORE Administrator');
