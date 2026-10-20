"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import type { TourStep } from "@/lib/screen-guides";

const LOCATE_ATTEMPTS = 40;
const LOCATE_INTERVAL_MS = 150;
const CARD_WIDTH = 360;
const CARD_GAP = 14;
const CARD_HEIGHT_ESTIMATE = 230;
const SPOTLIGHT_PADDING = 8;
const VIEWPORT_MARGIN = 16;

function pathMatches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Walks through tour steps, navigating when a step sets `href`, highlighting
// each target, and skipping steps whose target never appears.
export function ScreenTour({
  steps,
  onClose,
}: {
  steps: TourStep[];
  onClose: (reason: "finished" | "skipped") => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);

  const step = steps[index];
  const total = steps.length;

  const finish = useCallback(
    (reason: "finished" | "skipped") => onClose(reason),
    [onClose],
  );

  const advance = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next >= total) finish("finished");
      else if (next >= 0) setIndex(next);
    },
    [finish, index, total],
  );

  // Navigate to the step's screen when needed, then locate the target.
  useEffect(() => {
    if (!step) return;
    let attempts = 0;
    let timer: number | undefined;
    let cancelled = false;

    if (step.href && !pathMatches(pathname, step.href)) {
      router.push(step.href);
      return;
    }

    function locate() {
      if (cancelled) return;
      if (!step.target) {
        targetRef.current = null;
        setRect(null);
        return;
      }
      const element = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      // A hidden target, such as the sidebar on phones, is skipped at once.
      // A target that has not rendered yet is retried for a short time.
      if (element) {
        if (element.getBoundingClientRect().width === 0) {
          advance(1);
          return;
        }
        targetRef.current = element;
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        setRect(element.getBoundingClientRect());
        return;
      }
      if (attempts < LOCATE_ATTEMPTS) {
        attempts += 1;
        timer = window.setTimeout(locate, LOCATE_INTERVAL_MS);
        return;
      }
      advance(1);
    }

    locate();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [step, pathname, router, advance]);

  // Keep the spotlight on its target while the page scrolls or resizes.
  useEffect(() => {
    function measure() {
      if (targetRef.current) setRect(targetRef.current.getBoundingClientRect());
    }
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, []);

  useEffect(() => {
    nextRef.current?.focus();
  }, [index]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") finish("skipped");
      if (event.key === "ArrowRight") advance(1);
      if (event.key === "ArrowLeft") advance(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, finish]);

  if (!step) return null;

  const cardStyle = cardPosition(rect);
  const isLast = index === total - 1;

  return createPortal(
    <div className="fixed inset-0 z-[60]">
      {rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-xl transition-all duration-200"
          style={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.62)",
            outline: "2px solid var(--primary)",
            outlineOffset: 2,
          }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-black/62" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="screen-tour-title"
        aria-describedby="screen-tour-body"
        className="fixed rounded-xl border bg-card p-5 text-foreground shadow-xl"
        style={cardStyle}
      >
        <p className="text-xs uppercase tracking-[0.18em] text-muted">
          Step {index + 1} of {total}
        </p>
        <h2 id="screen-tour-title" className="mt-1 text-lg font-medium">
          {step.title}
        </h2>
        <p id="screen-tour-body" className="mt-2 text-sm text-muted">
          {step.body}
        </p>
        <div className="mt-5 flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => finish("skipped")}>
            Skip tour
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={index === 0} onClick={() => advance(-1)}>
              Back
            </Button>
            <Button ref={nextRef} type="button" size="sm" onClick={() => advance(1)}>
              {isLast ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Places the card beside the target where there is room: below, above,
// then to the right or left. Falls back to the center of the screen for
// targets that fill the viewport.
function cardPosition(rect: DOMRect | null): React.CSSProperties {
  if (!rect || typeof window === "undefined") {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: `min(${CARD_WIDTH}px, calc(100vw - 32px))` };
  }
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(CARD_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);
  const height = CARD_HEIGHT_ESTIMATE;
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  const centeredLeft = clamp(rect.left, VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
  const centeredTop = clamp(rect.top, VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN);
  const gap = CARD_GAP + SPOTLIGHT_PADDING;

  if (viewportHeight - rect.bottom >= height + gap + VIEWPORT_MARGIN) {
    return { top: rect.bottom + gap, left: centeredLeft, width };
  }
  if (rect.top >= height + gap + VIEWPORT_MARGIN) {
    return { top: rect.top - gap - height, left: centeredLeft, width };
  }
  if (viewportWidth - rect.right >= width + gap + VIEWPORT_MARGIN) {
    return { top: centeredTop, left: rect.right + gap, width };
  }
  if (rect.left >= width + gap + VIEWPORT_MARGIN) {
    return { top: centeredTop, left: rect.left - gap - width, width };
  }
  return { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width };
}
