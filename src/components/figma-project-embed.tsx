import { ExternalLink } from "lucide-react";
import { ProviderIcon } from "@/components/provider-icon";
import { Button } from "@/components/ui/button";

export function FigmaProjectEmbed({
  fileName,
  editUrl,
  embedUrl,
  focusKey = "file",
}: {
  fileName: string | null;
  editUrl: string;
  embedUrl: string;
  focusKey?: string;
}) {
  const title = fileName?.trim() || "Figma file";
  return (
    <section className="space-y-3" data-tour="project-figma-embed" id="project-figma-embed">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ProviderIcon provider="figma" className="size-5 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-lg font-medium">{title}</h2>
            <p className="text-xs text-muted">View-only embed. Edit opens Figma in a new tab.</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={editUrl} target="_blank" rel="noopener noreferrer">
            Edit in Figma
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <iframe
          key={focusKey}
          title={`${title} — Figma`}
          src={embedUrl}
          className="h-[min(70vh,36rem)] w-full border-0"
          allowFullScreen
        />
      </div>
    </section>
  );
}
