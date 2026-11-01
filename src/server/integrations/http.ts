import { assertSafeOutboundUrl, type DnsResolver } from "../crypto/ssrf";
import { ProviderError } from "./types";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let fetchImpl: FetchLike = (input, init) => fetch(input, init);
let resolver: DnsResolver | undefined;

export function setProviderFetch(next: FetchLike | null): void {
  fetchImpl = next ?? ((input, init) => fetch(input, init));
}

export function setDnsResolver(next: DnsResolver | undefined): void {
  resolver = next;
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - Date.now());
}

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as {
      message?: string;
      errorMessages?: string[];
      errors?: Array<{ message?: string }>;
    };
    const graphql = parsed.errors?.map((error) => error.message).filter((message): message is string => Boolean(message));
    if (graphql && graphql.length > 0) return graphql.join("; ");
    if (parsed.message) return parsed.message;
    if (parsed.errorMessages && parsed.errorMessages.length > 0) return parsed.errorMessages.join("; ");
  } catch {
    // The provider returned a non-JSON body.
  }
  return text.slice(0, 300);
}

export async function providerFetch(url: string, init: RequestInit = {}, redirects = 0): Promise<Response> {
  const safe = await assertSafeOutboundUrl(url, resolver);
  const response = await fetchImpl(safe.toString(), { ...init, redirect: "manual" });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (redirects >= 2) {
      throw new ProviderError("Provider redirected too many times", "unavailable", true, response.status);
    }
    const location = response.headers.get("location");
    if (!location) {
      throw new ProviderError("Provider redirect is missing a location", "unavailable", true, response.status);
    }
    const next = new URL(location, safe).toString();
    return providerFetch(next, init, redirects + 1);
  }
  if (response.status === 429) {
    throw new ProviderError("Provider rate limit reached", "rate_limited", true, 429, retryAfterMs(response));
  }
  if (response.status === 401 || response.status === 403) {
    const detail = await readError(response).catch(() => "");
    const suffix = detail.trim() ? `: ${detail.trim().slice(0, 180)}` : "";
    throw new ProviderError(
      `Provider rejected the credentials${suffix}`,
      "unauthorized",
      false,
      response.status,
    );
  }
  if (response.status === 404) {
    throw new ProviderError("Provider record was not found", "not_found", false, 404);
  }
  if (response.status >= 500) {
    throw new ProviderError("Provider is unavailable", "unavailable", true, response.status);
  }
  if (!response.ok) {
    const detail = await readError(response);
    throw new ProviderError(`Provider request failed: ${detail}`, "validation", false, response.status);
  }
  return response;
}

export function headerMap(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key.toLowerCase()] = value;
  });
  return output;
}

export function nextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match?.[1]) return match[1];
  }
  return null;
}
