import { providerFetch } from "./http";
import { ProviderError, type StoredCredential } from "./types";

/** Bot scopes requested by Add to Slack. Comma-separated on the authorize URL. */
export const SLACK_BOT_SCOPES = [
  "channels:history",
  "channels:read",
  "groups:history",
  "groups:read",
  "users:read",
] as const;

type SlackApiResponse = {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
};

async function slackGet<T extends SlackApiResponse>(
  token: string,
  method: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`https://slack.com/api/${method}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  const response = await providerFetch(url.toString(), {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  });
  let data: T;
  try {
    data = (await response.json()) as T;
  } catch {
    throw new ProviderError("Slack returned an invalid response", "unavailable", true, response.status);
  }
  if (!response.ok || !data.ok) {
    const code = data.error ?? `http_${response.status}`;
    if (code === "invalid_auth" || code === "token_revoked" || code === "account_inactive") {
      throw new ProviderError("Slack rejected this bot token", "unauthorized", false, response.status);
    }
    if (code === "missing_scope") {
      throw new ProviderError(
        "Slack token is missing scopes. Add channels:history, channels:read, and users:read to the bot, then reinstall.",
        "unauthorized",
        false,
        response.status,
      );
    }
    if (code === "ratelimited") {
      throw new ProviderError("Slack rate limited this request", "rate_limited", true, response.status);
    }
    throw new ProviderError(`Slack error: ${code}`, "unavailable", true, response.status);
  }
  return data;
}

type SlackOAuthAccess = {
  ok?: boolean;
  error?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  team?: { id?: string; name?: string };
};

export async function exchangeSlackCode(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<StoredCredential> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
  });
  const json = await slackOAuthAccess(body);
  return slackCredentialFromAccess(json);
}

export async function refreshSlackAccessToken(
  credential: StoredCredential,
  app: { clientId: string; clientSecret: string },
): Promise<StoredCredential> {
  const refreshToken = credential.refreshToken;
  if (!refreshToken) {
    throw new ProviderError("Slack access token expired. Add Slack again.", "unauthorized", false);
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: app.clientId,
    client_secret: app.clientSecret,
    refresh_token: refreshToken,
  });
  const json = await slackOAuthAccess(body);
  const next = slackCredentialFromAccess(json, credential);
  return { ...credential, ...next, refreshToken: next.refreshToken ?? refreshToken };
}

async function slackOAuthAccess(body: URLSearchParams): Promise<SlackOAuthAccess> {
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  let json: SlackOAuthAccess;
  try {
    json = (await response.json()) as SlackOAuthAccess;
  } catch {
    throw new Error("Slack returned an invalid OAuth response");
  }
  if (!response.ok || json.ok === false || !json.access_token) {
    throw new Error(json.error ?? "Slack did not return a bot token");
  }
  return json;
}

function slackCredentialFromAccess(json: SlackOAuthAccess, previous?: StoredCredential): StoredCredential {
  return {
    accessToken: json.access_token ?? previous?.accessToken ?? "",
    refreshToken: json.refresh_token ?? previous?.refreshToken,
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : previous?.expiresAt,
    accountLabel: json.team?.name?.trim() || previous?.accountLabel,
  };
}

export async function validateSlackConnection(accessToken: string): Promise<{
  externalAccountId: string;
  accountLabel: string;
}> {
  const data = await slackGet<{
    ok: boolean;
    team?: string;
    team_id?: string;
    user?: string;
    user_id?: string;
    bot_id?: string;
  }>(accessToken, "auth.test");
  const team = data.team?.trim() || "Slack";
  const teamId = data.team_id?.trim() || data.user_id?.trim() || "slack";
  return {
    externalAccountId: teamId,
    accountLabel: team,
  };
}

export type SlackChannel = {
  id: string;
  name: string;
  isPrivate: boolean;
};

export type SlackMessage = {
  channelId: string;
  channelName: string;
  ts: string;
  text: string;
  userId: string | null;
  userName: string;
  permalink: string | null;
  at: Date;
};

type Conversation = {
  id: string;
  name?: string;
  is_channel?: boolean;
  is_group?: boolean;
  is_private?: boolean;
  is_member?: boolean;
  is_archived?: boolean;
};

type HistoryMessage = {
  type?: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  username?: string;
};

export async function listSlackChannels(accessToken: string, limit = 40): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
  let cursor = "";
  do {
    const data = await slackGet<{
      ok: boolean;
      channels?: Conversation[];
      response_metadata?: { next_cursor?: string };
    }>(accessToken, "conversations.list", {
      types: "public_channel,private_channel",
      exclude_archived: "true",
      limit: "200",
      cursor,
    });
    for (const channel of data.channels ?? []) {
      if (!channel.id || channel.is_archived || channel.is_member === false) continue;
      channels.push({
        id: channel.id,
        name: channel.name ? `#${channel.name}` : channel.id,
        isPrivate: Boolean(channel.is_private || channel.is_group),
      });
      if (channels.length >= limit) return channels;
    }
    cursor = data.response_metadata?.next_cursor?.trim() ?? "";
  } while (cursor);
  return channels;
}

async function resolveUsers(
  accessToken: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const userId of userIds) {
    if (!userId || names.has(userId)) continue;
    try {
      const data = await slackGet<{
        ok: boolean;
        user?: {
          name?: string;
          real_name?: string;
          profile?: { display_name?: string; real_name?: string };
        };
      }>(accessToken, "users.info", { user: userId });
      const profile = data.user?.profile;
      const label =
        profile?.display_name?.trim() ||
        profile?.real_name?.trim() ||
        data.user?.real_name?.trim() ||
        data.user?.name?.trim() ||
        userId;
      names.set(userId, label);
    } catch {
      names.set(userId, userId);
    }
  }
  return names;
}

function messageLink(teamId: string | null, channelId: string, ts: string): string | null {
  if (!teamId) return null;
  const archiveTs = ts.replace(".", "");
  return `https://app.slack.com/client/${teamId}/${channelId}/thread/${channelId}-${archiveTs}`;
}

export async function listSlackMessagesSince(
  accessToken: string,
  oldestUnixSeconds: number,
  options: { channelLimit?: number; perChannelLimit?: number; teamId?: string | null } = {},
): Promise<SlackMessage[]> {
  const channelLimit = options.channelLimit ?? 20;
  const perChannelLimit = options.perChannelLimit ?? 40;
  const channels = await listSlackChannels(accessToken, channelLimit);
  const collected: Array<Omit<SlackMessage, "userName"> & { userName?: string }> = [];
  const userIds = new Set<string>();

  for (const channel of channels) {
    const data = await slackGet<{
      ok: boolean;
      messages?: HistoryMessage[];
      is_limited?: boolean;
    }>(accessToken, "conversations.history", {
      channel: channel.id,
      oldest: String(oldestUnixSeconds),
      limit: String(perChannelLimit),
      inclusive: "true",
    });

    for (const message of data.messages ?? []) {
      if (!message.ts || message.type !== "message") continue;
      if (message.subtype && message.subtype !== "bot_message" && message.subtype !== "thread_broadcast") {
        continue;
      }
      const text = (message.text ?? "").trim();
      if (!text) continue;
      const userId = message.user ?? null;
      if (userId) userIds.add(userId);
      collected.push({
        channelId: channel.id,
        channelName: channel.name,
        ts: message.ts,
        text,
        userId,
        userName: message.username?.trim() || undefined,
        permalink: messageLink(options.teamId ?? null, channel.id, message.ts),
        at: new Date(Number(message.ts) * 1000),
      });
    }
  }

  const names = await resolveUsers(accessToken, [...userIds]);
  return collected
    .map((message) => ({
      channelId: message.channelId,
      channelName: message.channelName,
      ts: message.ts,
      text: message.text,
      userId: message.userId,
      userName:
        message.userName ||
        (message.userId ? names.get(message.userId) : undefined) ||
        "Slack",
      permalink: message.permalink,
      at: message.at,
    }))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}
