import type { CSSProperties } from "react";
import Link from "next/link";
import { Suspense } from "react";
import { AtriumLogo } from "@/components/atrium-logo";
import { PageMotion } from "@/components/page-motion";

export default function Page() {
  return (
    <div className="landing-shell">
      <div className="landing-gradient" aria-hidden="true" />
      <Suspense
        fallback={
          <main className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-3xl flex-1 flex-col justify-center overflow-y-auto px-6 py-16">
            <LandingCopy />
          </main>
        }
      >
        <PageMotion>
          <main className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-3xl flex-1 flex-col justify-center overflow-y-auto px-6 py-16">
            <LandingCopy />
          </main>
        </PageMotion>
      </Suspense>
    </div>
  );
}

function LandingCopy() {
  return (
    <>
      <div data-reveal>
        <AtriumLogo markClassName="size-9 text-primary" />
        <p className="mt-3 text-xs uppercase tracking-[0.22em] text-muted">Self-hosted operations</p>
      </div>
      <h1 className="mt-3 text-5xl leading-tight" data-reveal style={{ "--reveal-delay": "60ms" } as CSSProperties}>
        One desk for personal work and the company backlog.
      </h1>
      <p
        className="mt-4 max-w-xl text-lg text-muted"
        data-reveal
        style={{ "--reveal-delay": "120ms" } as CSSProperties}
      >
        Atrium keeps native projects beside Linear, Jira, and GitHub. External tasks stay owned by the provider. Your
        workspaces stay isolated.
      </p>
      <div className="mt-8 flex gap-3" data-reveal style={{ "--reveal-delay": "180ms" } as CSSProperties}>
        <Link href="/login" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
          Sign in
        </Link>
        <Link href="/register" className="rounded-md border bg-card/80 px-4 py-2 text-sm backdrop-blur-sm">
          Create an account
        </Link>
      </div>
    </>
  );
}
