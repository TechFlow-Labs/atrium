import { sql } from "drizzle-orm";
import { requireAction } from "../authz/membership";
import { withUser } from "../db/client";
import { openCredential, sealCredential } from "../integrations/credentials";
import { resolveOAuthApp } from "../integrations/oauth-apps";
import {
  listSlackMessagesSince,
  refreshSlackAccessToken,
  validateSlackConnection,
  type SlackMessage,
} from "../integrations/slack";
import { credentialNeedsRefresh } from "../integrations/token-refresh";
import type { ChatProviderId } from "../integrations/types";

export type ChatFeedItem = SlackMessage & {
  integrationId: string;
  integrationName: string;
  provider: ChatProviderId;
};

export type SlackConnectionSummary = {
  id: string;
  displayName: string;
  status: string;
  externalAccountId: string | null;
  lastError: string | null;
  hasCredential: boolean;
};

function startOfDayUnixSeconds(timeZone: string, now = new Date()): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMs = asUtc - now.getTime();
  const localMidnightUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    0,
    0,
    0,
  );
  return Math.floor((localMidnightUtc - offsetMs) / 1000);
}

export async function listSlackConnections(
  userId: string,
  workspaceId: string,
): Promise<SlackConnectionSummary[]> {
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    const rows = await tx.execute<{
      id: string;
      display_name: string;
      status: string;
      external_account_id: string | null;
      last_error: string | null;
      credential_ciphertext: string | null;
    }>(sql`
      select id, display_name, status, external_account_id, last_error, credential_ciphertext
      from integrations
      where workspace_id = ${workspaceId}::uuid
        and provider = 'slack'
        and status <> 'revoked'
      order by display_name
    `);
    return rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      status: row.status,
      externalAccountId: row.external_account_id,
      lastError: row.last_error,
      hasCredential: Boolean(row.credential_ciphertext),
    }));
  });
}

export async function listTodayChatMessages(
  userId: string,
  workspaceId: string,
): Promise<{
  timeZone: string;
  dayLabel: string;
  connections: SlackConnectionSummary[];
  messages: ChatFeedItem[];
  errors: Array<{ integrationId: string; message: string }>;
}> {
  return withUser(userId, async (tx) => {
    await requireAction(tx, workspaceId, "task.read");
    const prefs = await tx.execute<{ timezone: string }>(sql`
      select timezone from user_preferences
      where user_id = current_setting('app.current_user_id', true)
    `);
    const timeZone = prefs[0]?.timezone ?? "UTC";
    const oldest = startOfDayUnixSeconds(timeZone);
    const dayLabel = new Intl.DateTimeFormat("en", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone,
    }).format(new Date());

    const rows = await tx.execute<{
      id: string;
      display_name: string;
      status: string;
      external_account_id: string | null;
      last_error: string | null;
      credential_ciphertext: string | null;
    }>(sql`
      select id, display_name, status, external_account_id, last_error, credential_ciphertext
      from integrations
      where workspace_id = ${workspaceId}::uuid
        and provider = 'slack'
        and status <> 'revoked'
      order by display_name
    `);

    const connections: SlackConnectionSummary[] = rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      status: row.status,
      externalAccountId: row.external_account_id,
      lastError: row.last_error,
      hasCredential: Boolean(row.credential_ciphertext),
    }));

    const messages: ChatFeedItem[] = [];
    const errors: Array<{ integrationId: string; message: string }> = [];

    for (const row of rows) {
      if (!row.credential_ciphertext || row.status === "revoked") continue;
      let credentials = openCredential(row.credential_ciphertext);
      if (!credentials?.accessToken) {
        errors.push({ integrationId: row.id, message: "Slack credential is missing" });
        continue;
      }
      try {
        if (credentialNeedsRefresh(credentials)) {
          const app = await resolveOAuthApp(tx, workspaceId, "slack");
          if (app) {
            credentials = await refreshSlackAccessToken(credentials, app);
            await tx.execute(sql`
              update integrations
              set credential_ciphertext = ${sealCredential(credentials)},
                  last_error = null,
                  status = 'connected',
                  last_validated_at = now()
              where id = ${row.id}::uuid
            `);
          }
        }
        const feed = await listSlackMessagesSince(credentials.accessToken, oldest, {
          teamId: row.external_account_id,
        });
        for (const item of feed) {
          messages.push({
            ...item,
            integrationId: row.id,
            integrationName: row.display_name,
            provider: "slack",
          });
        }
      } catch (error) {
        errors.push({
          integrationId: row.id,
          message: error instanceof Error ? error.message : "Could not load Slack messages",
        });
      }
    }

    messages.sort((a, b) => b.at.getTime() - a.at.getTime());
    return { timeZone, dayLabel, connections, messages, errors };
  });
}

export async function testSlackCredential(accessToken: string) {
  return validateSlackConnection(accessToken);
}
