import type { CSSProperties, ReactNode } from "react";
import { Suspense } from "react";
import { AtriumLogo } from "@/components/atrium-logo";
import { PageMotion } from "@/components/page-motion";

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="landing-shell">
      <div className="landing-gradient" aria-hidden="true" />
      <Suspense
        fallback={
          <main className="relative z-10 mx-auto grid h-full min-h-0 w-full max-w-5xl flex-1 grid-cols-1 items-center gap-10 overflow-y-auto px-6 py-12 md:grid-cols-2 md:gap-16 md:py-16">
            <AuthCopy title={title} description={description} />
            <div className="w-full max-w-md md:justify-self-end">{children}</div>
          </main>
        }
      >
        <PageMotion>
          <main className="relative z-10 mx-auto grid h-full min-h-0 w-full max-w-5xl flex-1 grid-cols-1 items-center gap-10 overflow-y-auto px-6 py-12 md:grid-cols-2 md:gap-16 md:py-16">
            <header className="max-w-md md:pr-4" data-reveal style={{ "--reveal-delay": "0ms" } as CSSProperties}>
              <AuthCopy title={title} description={description} />
            </header>
            <div
              className="w-full max-w-md md:justify-self-end"
              data-reveal
              style={{ "--reveal-delay": "90ms" } as CSSProperties}
            >
              {children}
            </div>
          </main>
        </PageMotion>
      </Suspense>
    </div>
  );
}

function AuthCopy({ title, description }: { title: string; description: string }) {
  return (
    <>
      <AtriumLogo markClassName="size-8 text-primary" />
      <h1 className="mt-3 text-4xl leading-tight md:text-5xl">{title}</h1>
      <p className="mt-3 text-base text-muted md:text-lg">{description}</p>
    </>
  );
}
