import { verifyHmacSha256 } from "../crypto/secrets";
import { findGithubIntegrationByInstallationId, resolveGithubAppConfig } from "../integrations/github-app";
import { receiveWebhook } from "./receive";

export async function receiveGithubAppWebhook(input: {
  rawBody: string;
  headers: Record<string, string>;
}): Promise<{ status: number; body: string }> {
  const config = resolveGithubAppConfig();
  if (!config?.webhookSecret) {
    return { status: 503, body: "GitHub App webhook secret is not configured" };
  }

  const signature = input.headers["x-hub-signature-256"] ?? "";
  if (!verifyHmacSha256(config.webhookSecret, input.rawBody, signature)) {
    return { status: 401, body: "Invalid webhook signature" };
  }

  let installationId: string | null = null;
  try {
    const body = JSON.parse(input.rawBody) as {
      installation?: { id?: number | string };
    };
    if (body.installation?.id != null) installationId = String(body.installation.id);
  } catch {
    return { status: 400, body: "Webhook body must be JSON" };
  }
  if (!installationId) {
    return { status: 400, body: "GitHub App webhook is missing installation.id" };
  }

  const integration = await findGithubIntegrationByInstallationId(installationId);
  if (!integration) {
    return { status: 404, body: "No Atrium integration for this GitHub App installation" };
  }

  return receiveWebhook({
    provider: "github",
    integrationId: integration.id,
    rawBody: input.rawBody,
    headers: input.headers,
    signatureAlreadyVerified: true,
  });
}
