"use client";

import { CircleHelp } from "lucide-react";
import { useState } from "react";
import { markGuideSeenAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScreenTour } from "@/components/screen-tour";
import { APP_TOUR } from "@/lib/screen-guides";

// Opens the whole-app tour once after the first successful login. Screens no
// longer auto-open their own guides. The header help button restarts the tour.
export function ScreenGuide({ seenVersions }: { seenVersions: Record<string, number> }) {
  const [seen, setSeen] = useState(seenVersions);
  const [manual, setManual] = useState<"intro" | "tour" | null>(null);

  const unseen = seen[APP_TOUR.id] !== APP_TOUR.version;
  const phase = manual ?? (unseen ? "intro" : null);

  const finishFlow = () => {
    setManual(null);
    if (!unseen) return;
    setSeen((current) => ({ ...current, [APP_TOUR.id]: APP_TOUR.version }));
    // If the save fails, the tour stays marked as seen for this session and
    // shows again on the next visit.
    markGuideSeenAction(APP_TOUR.id, APP_TOUR.version).catch(() => undefined);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        data-tour="guide-help"
        title="Show app tour"
        aria-label="Show app tour"
        onClick={() => setManual("intro")}
      >
        <CircleHelp className="size-4" aria-hidden="true" />
      </Button>
      <Dialog
        open={phase === "intro"}
        onOpenChange={(next) => {
          if (!next) finishFlow();
        }}
      >
        <DialogContent className="w-[min(100%-2rem,32rem)]">
          <DialogHeader>
            <DialogTitle>{APP_TOUR.title}</DialogTitle>
            <DialogDescription>{APP_TOUR.intro}</DialogDescription>
          </DialogHeader>
          <div className="mt-6 flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" onClick={finishFlow}>
              Skip
            </Button>
            <Button type="button" onClick={() => setManual("tour")}>
              Start tour
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {phase === "tour" ? <ScreenTour steps={APP_TOUR.tour} onClose={finishFlow} /> : null}
    </>
  );
}
