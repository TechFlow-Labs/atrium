"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { ProviderIcon } from "@/components/provider-icon";
import { Button } from "@/components/ui/button";
import { figmaEmbedCanvasCenter, figmaPinOverlayPoint, type FigmaCommentPin } from "@/lib/figma-embed";

export function FigmaProjectEmbed({
  fileName,
  editUrl,
  embedUrl,
  focusKey = "file",
  pin = null,
  pulseKey = "",
}: {
  fileName: string | null;
  editUrl: string;
  embedUrl: string;
  focusKey?: string;
  pin?: FigmaCommentPin | null;
  pulseKey?: string;
}) {
  const title = fileName?.trim() || "Figma file";
  const frameRef = useRef<HTMLDivElement>(null);
  const freshLoad = useRef(true);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    freshLoad.current = true;
    const backup = window.setTimeout(() => {
      setLoadedUrl((current) => (current === embedUrl ? current : embedUrl));
    }, 1600);
    return () => window.clearTimeout(backup);
  }, [embedUrl]);

  useEffect(() => {
    if (!pulseKey || loadedUrl !== embedUrl) {
      setPoint(null);
      return;
    }
    const wait = freshLoad.current ? 700 : 180;
    freshLoad.current = false;
    const reveal = window.setTimeout(() => {
      const rect = frameRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const viewport = { width: rect.width, height: rect.height };
      const next = pin ? figmaPinOverlayPoint(pin, viewport) : null;
      setPoint(next ?? figmaEmbedCanvasCenter(viewport));
    }, wait);
    const hide = window.setTimeout(() => setPoint(null), wait + 1600);
    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(hide);
    };
  }, [embedUrl, loadedUrl, pin, pulseKey]);

  return (
    <section className="space-y-3" data-tour="project-figma-embed" id="project-figma-embed">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ProviderIcon provider="figma" className="size-5 shrink-0" />
          <p className="text-xs text-muted">View-only embed. Edit opens Figma in a new tab.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={editUrl} target="_blank" rel="noopener noreferrer">
            Edit in Figma
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </Button>
      </div>
      <div ref={frameRef} className="relative isolate overflow-hidden rounded-xl border bg-card">
        <iframe
          key={focusKey}
          title={`${title} — Figma`}
          src={embedUrl}
          className="relative z-0 h-[min(70vh,36rem)] w-full border-0"
          allowFullScreen
          onLoad={() => {
            freshLoad.current = true;
            setLoadedUrl(embedUrl);
          }}
        />
        <div className="pointer-events-none absolute inset-0 z-20">
          {point ? (
            <span key={pulseKey} className="absolute size-0" style={{ left: point.x, top: point.y }} aria-hidden="true">
              <span className="figma-pin-ring" />
              <span className="figma-pin-dot" />
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
