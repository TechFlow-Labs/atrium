/** Update the URL without triggering a Next.js App Router navigation/remount. */
export function softReplaceUrl(href: string) {
  if (typeof window === "undefined") return;
  window.history.replaceState(window.history.state, "", href);
}
