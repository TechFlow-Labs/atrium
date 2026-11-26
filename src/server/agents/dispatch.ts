import { sql } from "drizzle-orm";
import { decryptSecret, signHmacSha256 } from "../crypto/secrets";
import { getDb } from "../db/client";
import { logError } from "../log";

type DispatchMaterial = {
  id: string;
  payload: unknown;
  attempts: number;
  status: string;
  webhook_url: string;
  webhook_secret_ciphertext: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function kickAgentDispatch(dispatchId: string | null): void {
  if (!dispatchId) return;
  void deliverAgentDispatch(dispatchId);
}

export async function deliverAgentDispatch(dispatchId: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rows = await getDb().execute<DispatchMaterial>(sql`
      select id, payload, attempts, status, webhook_url, webhook_secret_ciphertext
      from agent_dispatch_material(${dispatchId}::uuid)
    `);
    const row = rows[0];
    if (!row || row.status === "delivered" || row.attempts >= 3) return;

    const body = JSON.stringify(row.payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    let error: string | null = null;
    try {
      const secret = decryptSecret(row.webhook_secret_ciphertext);
      const signature = signHmacSha256(secret, `${timestamp}.${body}`).toString("hex");
      const response = await fetch(row.webhook_url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-webhook-timestamp": timestamp,
          "x-webhook-signature-v2": signature,
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) error = `Webhook responded ${response.status}`;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Webhook request failed";
    }

    const status = error ? (attempt === 2 ? "failed" : "pending") : "delivered";
    await getDb().execute(sql`
      select finish_agent_dispatch(${dispatchId}::uuid, ${status}, ${error})
    `);
    if (!error) return;
    if (attempt < 2) await sleep(400 * (attempt + 1));
  }
  logError("agent dispatch failed", { dispatchId });
}
