import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const EXACT_HOSTS = new Set([
  "api.linear.app",
  "linear.app",
  "api.atlassian.com",
  "auth.atlassian.com",
  "api.github.com",
  "github.com",
  "gitlab.com",
  "gitea.com",
  "api.slack.com",
  "slack.com",
  "app.slack.com",
  "api.figma.com",
  "www.figma.com",
  "figma.com",
]);

export type DnsResolver = (hostname: string) => Promise<string[]>;

const defaultResolver: DnsResolver = async (hostname) => {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((entry) => entry.address);
};

export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase();
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  const mapped = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const parts = mapped.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return ip.includes(":") && (ip.startsWith("fc") || ip.startsWith("fd") || ip === "::1");
  }
  const [a, b] = parts;
  if (a === undefined || b === undefined) return true;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function hostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (EXACT_HOSTS.has(host)) return true;
  if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.atlassian\.net$/.test(host)) return true;
  // Self-hosted Gitea/GitLab: any dotted public hostname; DNS private-IP check is the gate.
  return host.includes(".") && !host.endsWith(".local");
}

export async function assertSafeOutboundUrl(
  input: string,
  resolver: DnsResolver = defaultResolver,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Outbound URL is invalid");
  }
  if (url.protocol !== "https:") {
    throw new Error("Outbound URL must use https");
  }
  if (url.username || url.password) {
    throw new Error("Outbound URL cannot include credentials");
  }
  if (url.port && url.port !== "443") {
    throw new Error("Outbound URL port is not allowed");
  }
  const host = url.hostname.toLowerCase();
  if (isIP(host) || host === "localhost" || host.endsWith(".local")) {
    throw new Error("Outbound URL host is not allowed");
  }
  if (!hostAllowed(host)) {
    throw new Error("Outbound URL host is not allowlisted");
  }
  if (!EXACT_HOSTS.has(host)) {
    let addresses: string[];
    try {
      addresses = await resolver(host);
    } catch {
      throw new Error("Outbound URL host could not be resolved");
    }
    if (addresses.length === 0 || addresses.some((address) => isPrivateAddress(address))) {
      throw new Error("Outbound URL resolves to a blocked address");
    }
  }
  return url;
}
