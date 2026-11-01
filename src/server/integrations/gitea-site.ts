/** Normalize a Gitea instance URL to its origin (used by OAuth and API clients). */
export function giteaOAuthSiteUrl(siteUrl: string | null | undefined): string {
  const raw = (siteUrl ?? "https://gitea.com").trim().replace(/\/$/, "");
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.origin;
  } catch {
    throw new Error("Gitea site URL is invalid");
  }
}
