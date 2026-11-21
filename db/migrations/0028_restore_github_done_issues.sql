-- 1) GitHub Project Status "Done" / closed issues were soft-deleted via archived=true.
-- 2) Bare issue-number collisions left cross-repo ghosts (e.g. emblem#23 pointing at
--    an employer-scanner URL). Drop those links so the next reconcile recreates them.

-- Detach cross-repo ghosts: provider_id repo != external_url repo.
WITH bad AS (
  SELECT er.id AS er_id, er.local_entity_id AS task_id
  FROM external_records er
  JOIN tasks t ON t.id = er.local_entity_id
  JOIN integrations i ON i.id = er.integration_id
  WHERE er.entity_type = 'issue'
    AND i.provider = 'github'
    AND er.provider_id LIKE '%#%'
    AND t.external_url IS NOT NULL
    AND split_part(er.provider_id, '#', 1)
      <> substring(t.external_url from 'github\.com/([^/]+/[^/]+)')
)
UPDATE tasks t
SET deleted_at = coalesce(t.deleted_at, now()),
    sync_state = 'tombstone',
    updated_at = now()
FROM bad
WHERE t.id = bad.task_id;

DELETE FROM external_records er
USING (
  SELECT er.id AS er_id
  FROM external_records er
  JOIN tasks t ON t.id = er.local_entity_id
  JOIN integrations i ON i.id = er.integration_id
  WHERE er.entity_type = 'issue'
    AND i.provider = 'github'
    AND er.provider_id LIKE '%#%'
    AND t.external_url IS NOT NULL
    AND split_part(er.provider_id, '#', 1)
      <> substring(t.external_url from 'github\.com/([^/]+/[^/]+)')
) bad
WHERE er.id = bad.er_id;

-- Restore Done/closed rows that were only hidden by archived=true.
UPDATE tasks t
SET deleted_at = NULL,
    sync_state = 'synced',
    sync_error = NULL,
    updated_at = now()
FROM project_connections c
JOIN integrations i ON i.id = c.integration_id
WHERE t.project_id = c.project_id
  AND i.provider = 'github'
  AND t.deleted_at IS NOT NULL
  AND t.sync_state = 'tombstone'
  AND t.status IN ('open', 'in_progress', 'blocked', 'done', 'cancelled')
  AND t.external_url IS NOT NULL
  -- Keep intentionally detached cross-repo ghosts tombstoned (no external_records link).
  AND EXISTS (
    SELECT 1 FROM external_records er
    WHERE er.local_entity_id = t.id AND er.entity_type = 'issue' AND er.deleted_at IS NULL
  );

UPDATE external_records er
SET deleted_at = NULL,
    updated_at = now()
FROM tasks t
JOIN project_connections c ON c.project_id = t.project_id
JOIN integrations i ON i.id = c.integration_id
WHERE er.local_entity_id = t.id
  AND er.entity_type = 'issue'
  AND i.provider = 'github'
  AND er.deleted_at IS NOT NULL
  AND t.deleted_at IS NULL;
