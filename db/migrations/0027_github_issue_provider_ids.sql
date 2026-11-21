-- GitHub issue numbers are per-repository. One GitHub App integration often
-- covers many repos, so bare numbers collide in external_records
-- (unique on integration_id, entity_type, provider_id). Namespace as repo#number.

-- Rewrite linked issue records using the connection's provider_project_id.
UPDATE external_records er
SET provider_id = c.provider_project_id || '#' || er.provider_id,
    updated_at = now()
FROM tasks t
JOIN project_connections c ON c.project_id = t.project_id
JOIN integrations i ON i.id = c.integration_id
WHERE er.local_entity_id = t.id
  AND er.integration_id = i.id
  AND er.entity_type = 'issue'
  AND i.provider = 'github'
  AND er.provider_id !~ '#'
  AND c.provider_project_id IS NOT NULL
  AND c.provider_project_id <> '';

-- Unlinked github issue rows that still carry a repo in raw JSON.
UPDATE external_records er
SET provider_id = (er.raw->>'providerProjectId') || '#' || er.provider_id,
    updated_at = now()
FROM integrations i
WHERE er.integration_id = i.id
  AND er.entity_type = 'issue'
  AND i.provider = 'github'
  AND er.local_entity_id IS NULL
  AND er.provider_id !~ '#'
  AND coalesce(er.raw->>'providerProjectId', '') <> '';

-- Soft-deleted open/in-progress tasks from the cross-repo tombstone bug can
-- reappear on the next reconcile once provider ids are unique again.
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
  AND t.status IN ('open', 'in_progress', 'blocked');

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
