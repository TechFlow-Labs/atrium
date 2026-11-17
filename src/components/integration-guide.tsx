import { fillCallback, integrationGuide } from "@/lib/integration-guides";

// Step-by-step setup for one integration. `callbackBase` is the public origin
// of this Atrium deployment, for example https://atrium.example.com.
export function IntegrationGuide({
  provider,
  callbackBase,
  defaultOpen = false,
}: {
  provider: string;
  callbackBase: string;
  defaultOpen?: boolean;
}) {
  const guide = integrationGuide(provider);
  if (!guide) return null;
  const callbackUrl = `${callbackBase}/api/integrations/oauth/${provider}/callback`;

  return (
    <details open={defaultOpen} className="group rounded-lg border bg-card/60 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-medium marker:content-none [&::-webkit-details-marker]:hidden">
        <span>How to set up {guide.title}</span>
        <span className="text-xs text-muted group-open:hidden">Show steps</span>
        <span className="hidden text-xs text-muted group-open:inline">Hide steps</span>
      </summary>
      <div className="space-y-4 border-t px-4 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">What you need</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            {guide.needs.map((item) => (
              <li key={item}>{fillCallback(item, callbackUrl, callbackBase)}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Steps</p>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            {guide.steps.map((step) => (
              <li key={step}>{fillCallback(step, callbackUrl, callbackBase)}</li>
            ))}
          </ol>
        </div>
        {guide.steps.some((step) => step.includes("{callbackUrl}")) ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Callback URL</p>
            <p className="mt-1 break-all rounded-md border bg-background px-3 py-2 font-mono text-xs">{callbackUrl}</p>
          </div>
        ) : null}
        {guide.notes?.length ? (
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
            {guide.notes.map((note) => (
              <li key={note}>{fillCallback(note, callbackUrl, callbackBase)}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}
