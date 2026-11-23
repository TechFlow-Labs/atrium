"use client";

import type { ReactNode } from "react";

/** Collapses the personal-access-token form so the app/OAuth path stays primary. */
export function ProviderTokenFallback({
  providerLabel: label,
  children,
}: {
  providerLabel: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-lg border bg-card/60 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-medium marker:content-none [&::-webkit-details-marker]:hidden">
        <span>Use a {label} token instead</span>
        <span className="text-xs font-normal text-muted group-open:hidden">Show</span>
        <span className="hidden text-xs font-normal text-muted group-open:inline">Hide</span>
      </summary>
      <div className="space-y-3 border-t px-4 py-3">{children}</div>
    </details>
  );
}
