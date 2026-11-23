"use client";

import { useEffect, useRef, useState } from "react";
import { figmaPinOverlayPoint, type FigmaCommentPin } from "@/lib/figma-embed";

const FIGMA_ORIGINS = new Set(["https://www.figma.com", "https://embed.figma.com"]);

function figmaEmbedMessageType(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object" || !("type" in data)) return null;
  const type = (data as { type?: unknown }).type;
  return typeof type === "string" ? type : null;
}

function messageFromEmbed(event: MessageEvent, iframe: HTMLIFrameElement | null): boolean {
  if (!FIGMA_ORIGINS.has(event.origin)) return false;
  const frameWindow = iframe?.contentWindow;
  if (!frameWindow || !event.source) return false;
  let current = event.source as Window;
  for (let depth = 0; depth < 5; depth += 1) {
    if (current === frameWindow) return true;
    if (current.parent === current) return false;
    current = current.parent;
  }
  return false;
}

export function FigmaProjectEmbed({
  fileName,
  embedUrl,
  focusKey = "file",
  pin = null,
  pulseKey = "",
}: {
  fileName: string | null;
  embedUrl: string;
  focusKey?: string;
  pin?: FigmaCommentPin | null;
  pulseKey?: string;
}) {
  const title = fileName?.trim() || "Figma file";
  const frameRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setReadyUrl(null);
    function onMessage(event: MessageEvent) {
      if (!messageFromEmbed(event, iframeRef.current)) return;
      const type = figmaEmbedMessageType(event.data);
      if (type !== "INITIAL_LOAD" && type !== "EMBED_LOADED") return;
      setReadyUrl(embedUrl);
    }
    window.addEventListener("message", onMessage);
    const fallback = window.setTimeout(() => {
      setReadyUrl((current) => current ?? embedUrl);
    }, 8000);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(fallback);
    };
  }, [embedUrl]);

  useEffect(() => {
    if (!pulseKey || !pin || readyUrl !== embedUrl) {
      setPoint(null);
      return;
    }
    const reveal = window.setTimeout(() => {
      const rect = frameRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      setPoint(figmaPinOverlayPoint(pin, { width: rect.width, height: rect.height }));
    }, 350);
    const hide = window.setTimeout(() => setPoint(null), 350 + 1600);
    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(hide);
    };
  }, [embedUrl, pin, pulseKey, readyUrl]);

  return (
    <section data-tour="project-figma-embed" id="project-figma-embed">
      <div ref={frameRef} className="relative isolate overflow-hidden rounded-xl border bg-card">
        <iframe
          key={focusKey}
          ref={iframeRef}
          title={`${title} — Figma`}
          src={embedUrl}
          className="relative z-0 h-[min(70vh,36rem)] w-full border-0"
          allowFullScreen
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
