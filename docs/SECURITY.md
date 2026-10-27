# Security checklist

- [ ] `BETTER_AUTH_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` are unique, 32-byte base64 values, and are not stored in the database backup.
- [ ] `atrium_app` is not a superuser and does not have `BYPASSRLS`.
- [ ] `atrium_migrator` is used only for migrations.
- [ ] `DATABASE_URL_WORKER` is present on the worker, not in browser code.
- [ ] `ALLOW_FAKE_PROVIDER` is false outside tests and local demos.
- [ ] `BETTER_AUTH_URL` is the public https origin. Secure cookies turn on when `NODE_ENV=production`.
- [ ] Traefik or another proxy sets a request body limit. The webhook route also rejects bodies over 1 MB.
- [ ] Webhook routes require a valid HMAC over the raw body. Invalid signatures return 401 after the delivery is stored as rejected.
- [ ] Auth and webhook endpoints are rate limited in Postgres.
- [ ] Provider tokens are encrypted. Disconnect sets `credential_ciphertext` to null. List responses expose `hasCredential`, not the secret.
- [ ] Logs pass through `redact` for keys that look like tokens, secrets, passwords, or cookies.
- [ ] Outbound provider calls allow only https on port 443. Known SaaS hosts (Linear, Atlassian, GitHub, GitLab, Gitea) are allowlisted; self-hosted Gitea/GitLab hostnames are allowed only when DNS resolves to a public address.
- [ ] OAuth scopes stay at the minimum listed in `docs/DEPLOYMENT.md`. Revoke a connection from Integrations; that clears the stored credential.
- [ ] Invitations store only a SHA-256 of the token. The raw link is shown once to the inviter. Invitations are not emailed.
- [ ] Password reset emails go out only when SMTP is configured. The message says the same thing whether or not the address has an account. The link expires in one hour, and a successful reset revokes other sessions. The mailbox password stays in the server environment.
- [ ] Every private page and server action reads the session. Workspace role checks run in the service, not only in the interface.
- [ ] Sign-in “Keep me signed in” uses Better Auth `rememberMe`. Unchecked sessions are browser-session cookies only; checked sessions last up to 14 days. `session.cookieCache` stores a short-lived signed `session_data` cookie (5 minutes) so routine `getSession` calls can skip the database — revoke still wins after that cache expires.
- [ ] Review audit events for role changes, invitations, integration connect and disconnect, and task mutations.

Known boundary: anyone who can connect as `atrium_app` can set `app.current_user_id`. Treat that connection string as an application secret.
