# Architecture

Atrium is a modular monolith. One Next.js process serves the interface and the authenticated mutations. A second process, or an embedded loop in development, drains a Postgres-backed job queue and transactional outbox.

## What already existed

The repository started empty. There was no application code, schema, or shared database to reuse. PostgreSQL 16 is installed for local development. Isolation, backups, and access controls for any other database could not be verified, so Atrium uses its own database and three roles.

## Modules

- Workspaces, memberships, and invitations.
- Projects, milestones, and tasks.
- Integrations and provider project connections.
- Sync engine, outbox, webhooks, and conflict records.
- Audit events and user preferences.

## Ownership

`projects.ownership_mode` is `native`, `external`, or `hybrid`. Hybrid is stored so a later release can use it. The application rejects hybrid writes. Native tasks are canonical in Atrium. External tasks are a projection: creates and supported edits are queued and sent through the provider adapter. The provider remains authoritative for those fields.

## Authorization

The browser never decides access. Server actions and services call `requireAction` with the session user. Every request transaction sets `app.current_user_id`. Domain tables have row-level security forced on. The `atrium_app` role cannot bypass it. The worker role can, because webhooks and reconciliation have no end-user session. Privileged changes (create a workspace, change a role, ingest a webhook, claim a job) go through `SECURITY DEFINER` functions that check the session user or a narrow contract.

The app role can set the user id itself. That is the trusted application boundary. Direct SQL tests show that a missing user id sees no domain rows, and one user cannot update another workspace.

## Providers

`IntegrationAdapter` is implemented for a deterministic fake provider plus Linear (GraphQL), Jira Cloud (REST v3), and GitHub (REST issues plus GraphQL Projects v2 Status). Credentials are AES-256-GCM envelopes. The key lives only in `CREDENTIAL_ENCRYPTION_KEY`. Disconnecting an integration nulls the ciphertext. Outbound URLs are https, port 443, and limited to the official API hosts.

## Sync

Inbound webhooks are verified against the raw body, stored, and acknowledged only after that insert. A duplicate delivery id does not create another job. Outbound edits are outbox rows in the same transaction as the local change. Failures retry with exponential backoff and jitter, then land in a dead-letter state an admin can retry. Reconciliation walks provider pages from a stored cursor. Echoes are detected from recent outbound fingerprints, not from a global last-write-wins rule.

## UI controls

User-facing forms use shared components in `src/components/ui/` (`Checkbox`, `Radio`, `Input`, `Textarea`, `MenuSelect`, `Button`). Do not add bare HTML checkboxes, radios, or `<select>` elements in product screens. Hidden inputs are allowed for form payloads. Agent-facing guidance lives in `AGENTS.md`.

## Trust limits

- A member who can open a SQL session as `atrium_app` can set `app.current_user_id` to their own id, and also to another id. Give that role only to the application.
- Audit rows are written by a definer function. They are not a tamper-proof ledger against a database superuser.
- Live Linear, Jira, GitHub, GitLab, and Gitea calls are not exercised without operator credentials. Adapter tests use a mocked HTTP client. The fake provider covers the sync loop against Postgres.
