BEGIN;

UPDATE conversations c
SET contact_id = keeper.id
FROM (
  SELECT DISTINCT ON (org_id, zalo_uid)
    id, org_id, zalo_uid
  FROM contacts
  WHERE zalo_uid IS NOT NULL
  ORDER BY org_id, zalo_uid, created_at ASC
) keeper
JOIN contacts dup ON dup.zalo_uid = keeper.zalo_uid
                  AND dup.org_id  = keeper.org_id
                  AND dup.id     != keeper.id
WHERE c.contact_id = dup.id;

UPDATE appointments a
SET contact_id = keeper.id
FROM (
  SELECT DISTINCT ON (org_id, zalo_uid)
    id, org_id, zalo_uid
  FROM contacts
  WHERE zalo_uid IS NOT NULL
  ORDER BY org_id, zalo_uid, created_at ASC
) keeper
JOIN contacts dup ON dup.zalo_uid = keeper.zalo_uid
                  AND dup.org_id  = keeper.org_id
                  AND dup.id     != keeper.id
WHERE a.contact_id = dup.id;

UPDATE orders o
SET contact_id = keeper.id
FROM (
  SELECT DISTINCT ON (org_id, zalo_uid)
    id, org_id, zalo_uid
  FROM contacts
  WHERE zalo_uid IS NOT NULL
  ORDER BY org_id, zalo_uid, created_at ASC
) keeper
JOIN contacts dup ON dup.zalo_uid = keeper.zalo_uid
                  AND dup.org_id  = keeper.org_id
                  AND dup.id     != keeper.id
WHERE o.contact_id = dup.id;

DELETE FROM contacts
WHERE id IN (
  SELECT dup.id
  FROM contacts dup
  JOIN (
    SELECT DISTINCT ON (org_id, zalo_uid)
      id, org_id, zalo_uid
    FROM contacts
    WHERE zalo_uid IS NOT NULL
    ORDER BY org_id, zalo_uid, created_at ASC
  ) keeper ON keeper.zalo_uid = dup.zalo_uid
           AND keeper.org_id  = dup.org_id
           AND keeper.id     != dup.id
);

ALTER TABLE contacts
  ADD CONSTRAINT contacts_org_id_zalo_uid_unique
  UNIQUE (org_id, zalo_uid);

COMMIT;
