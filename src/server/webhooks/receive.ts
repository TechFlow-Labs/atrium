import { sql } from "drizzle-orm";
import { sha256, verifyHmacSha256 } from "../crypto/secrets";
import { getDb } from "../db/client";
import { openCredential } from "../integrations/credentials";
import type { ProviderId } from "../integrations/types";
import { redact } from "../log";
import { allowRequest } from "../rate-limit";

const MAX_BYTES = 1_000_000;

export async function receiveWebhook(input: {
  provider: ProviderId;
  integrationId: string;
  rawBody: string;
  headers: Record<string, string>;
  /** When true, the caller already verified the signature (e.g. GitHub App env secret). */
  signatureAlreadyVerified?: boolean;
}): Promise<{ status: number; body: string }> {
  if (Buffer.byteLength(input.rawBody) > MAX_BYTES) {
    return { status: 413, body: "Payload is too large" };
  }
  const allowed = await allowRequest(`webhook:${input.integrationId}`, 60, 60_000);
  if (!allowed) return { status: 429, body: "Too many webhook deliveries" };

  const material = await getDb().execute<{
    workspace_id: string;
    provider: string;
    status: string;
    credential_ciphertext: string | null;
  }>(sql`select * from integration_webhook_material(${input.integrationId}::uuid)`);
  const integration = material[0];
  if (!integration || integration.provider !== input.provider) {
    return { status: 404, body: "Integration not found" };
  }
  const credential = openCredential(integration.credential_ciphertext);
  const secret = credential?.webhookSecret;
  const signature =
    input.headers["x-hub-signature-256"] ??
    input.headers["x-hub-signature"] ??
    input.headers["linear-signature"] ??
    input.headers["x-fake-signature"] ??
    "";
  const valid = input.signatureAlreadyVerified
    ? integration.status === "connected"
    : Boolean(secret && integration.status === "connected" && verifyHmacSha256(secret, input.rawBody, signature));
  let parsed: unknown = {};
  if (valid) {
    try {
      parsed = JSON.parse(input.rawBody) as unknown;
    } catch {
      return { status: 400, body: "Webhook body must be JSON" };
    }
  }
  const deliveryId =
    input.headers["x-github-delivery"] ??
    input.headers["linear-delivery"] ??
    input.headers["x-atlassian-webhook-identifier"] ??
    input.headers["x-fake-delivery"] ??
    `body:${sha256(input.rawBody)}`;
  const stored = {
    event: input.headers["x-github-event"] ?? input.headers["x-event"] ?? null,
    body: redact(parsed),
  };
  const inserted = await getDb().execute<{ delivery: string; inserted: boolean }>(sql`
    select delivery, inserted from ingest_webhook(
      ${input.provider},
      ${deliveryId},
      ${valid},
      ${sha256(input.rawBody)},
      ${JSON.stringify(stored)}::jsonb,
      ${input.integrationId}::uuid,
      ${integration.workspace_id}::uuid
    )
  `);
  if (!valid) return { status: 401, body: "Invalid webhook signature" };
  return { status: 200, body: inserted[0]?.inserted ? "accepted" : "duplicate" };
}
