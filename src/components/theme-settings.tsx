"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Check, Moon, Sun } from "lucide-react";
import {
  groupRelatedTasksAction,
  motionAction,
  paletteAction,
  providerTileStylesAction,
  themeAction,
} from "@/app/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { applyDocumentMotion, applyDocumentTheme } from "@/lib/apply-theme";
import { COLOR_PALETTES, type ColorPaletteId, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

const MODE_OPTIONS = [
  {
    value: "light" as const,
    label: "Light",
    description: "Bright surfaces and dark text",
    icon: Sun,
  },
  {
    value: "dark" as const,
    label: "Dark",
    description: "Low-light sidebar and cards",
    icon: Moon,
  },
];

export function ThemeSettings({
  theme,
  palette,
  animationsEnabled,
  providerTileStyles,
  groupRelatedTasks,
}: {
  theme: ThemeMode;
  palette: ColorPaletteId;
  animationsEnabled: boolean;
  providerTileStyles: boolean;
  groupRelatedTasks: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<{ theme: ThemeMode; palette: ColorPaletteId } | null>(null);
  const [motionDraft, setMotionDraft] = useState<boolean | null>(null);
  const [providerTilesDraft, setProviderTilesDraft] = useState<boolean | null>(null);
  const [groupRelatedDraft, setGroupRelatedDraft] = useState<boolean | null>(null);
  const mode = draft?.theme ?? theme;
  const activePalette = draft?.palette ?? palette;
  const motionOn = motionDraft ?? animationsEnabled;
  const providerTilesOn = providerTilesDraft ?? providerTileStyles;
  const groupRelatedOn = groupRelatedDraft ?? groupRelatedTasks;

  useEffect(() => {
    applyDocumentTheme(theme, palette);
  }, [theme, palette]);

  useEffect(() => {
    applyDocumentMotion(animationsEnabled);
  }, [animationsEnabled]);

  function setTheme(next: ThemeMode) {
    if (next === mode || pending) return;
    setDraft({ theme: next, palette: activePalette });
    applyDocumentTheme(next, activePalette);
    const formData = new FormData();
    formData.set("theme", next);
    startTransition(async () => {
      await themeAction(formData);
      router.refresh();
      setDraft(null);
    });
  }

  function setPalette(next: ColorPaletteId) {
    if (next === activePalette || pending) return;
    setDraft({ theme: mode, palette: next });
    applyDocumentTheme(mode, next);
    const formData = new FormData();
    formData.set("palette", next);
    startTransition(async () => {
      await paletteAction(formData);
      router.refresh();
      setDraft(null);
    });
  }

  function setMotion(next: boolean) {
    if (next === motionOn || pending) return;
    setMotionDraft(next);
    applyDocumentMotion(next);
    const formData = new FormData();
    formData.set("animationsEnabled", next ? "on" : "off");
    startTransition(async () => {
      await motionAction(formData);
      router.refresh();
      setMotionDraft(null);
    });
  }

  function setProviderTiles(next: boolean) {
    if (next === providerTilesOn || pending) return;
    setProviderTilesDraft(next);
    const formData = new FormData();
    formData.set("providerTileStyles", next ? "on" : "off");
    startTransition(async () => {
      await providerTileStylesAction(formData);
      router.refresh();
      setProviderTilesDraft(null);
    });
  }

  function setGroupRelated(next: boolean) {
    if (next === groupRelatedOn || pending) return;
    setGroupRelatedDraft(next);
    const formData = new FormData();
    formData.set("groupRelatedTasks", next ? "on" : "off");
    startTransition(async () => {
      await groupRelatedTasksAction(formData);
      router.refresh();
      setGroupRelatedDraft(null);
    });
  }

  return (
    <section className="rounded-lg border bg-card p-4 md:p-5">
      <div>
        <h2 className="text-xl">Appearance</h2>
        <p className="mt-1 text-sm text-muted">
          Pick a color palette, light or dark mode, motion, and task tile accents. Changes apply immediately.
        </p>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-medium">Color palette</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5" role="radiogroup" aria-label="Color palette">
          {COLOR_PALETTES.map((option) => {
            const active = activePalette === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={pending}
                onClick={() => setPalette(option.id)}
                className={cn(
                  "flex flex-col gap-3 rounded-lg border p-3 text-left transition",
                  "hover:border-foreground/25 hover:bg-accent/40",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:opacity-60",
                  active ? "border-foreground/30 bg-accent/50" : "border-border bg-background",
                )}
              >
                <span className="flex h-12 overflow-hidden rounded-md border" aria-hidden="true">
                  <span className="w-1/4" style={{ background: option.swatches.sidebar }} />
                  <span className="flex flex-1 flex-col">
                    <span className="flex-1" style={{ background: option.swatches.light }} />
                    <span className="h-3" style={{ background: option.swatches.primary }} />
                    <span className="flex-1" style={{ background: option.swatches.dark }} />
                  </span>
                </span>
                <span>
                  <span className="flex items-center gap-2 font-medium">
                    {option.label}
                    {active ? <Check className="size-3.5" aria-hidden="true" /> : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{option.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium">Mode</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Color mode">
          {MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = mode === option.value;
            const swatch = COLOR_PALETTES.find((item) => item.id === activePalette)?.swatches;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={pending}
                onClick={() => setTheme(option.value)}
                className={cn(
                  "relative flex items-start gap-3 rounded-lg border p-4 text-left transition",
                  "hover:border-foreground/25 hover:bg-accent/40",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:opacity-60",
                  active ? "border-foreground/30 bg-accent/50" : "border-border bg-background",
                )}
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border bg-card">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-medium">
                    {option.label}
                    {active ? <Check className="size-3.5" aria-hidden="true" /> : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{option.description}</span>
                  <span
                    aria-hidden="true"
                    className="mt-3 flex h-10 overflow-hidden rounded-md border"
                    style={{
                      background: option.value === "light" ? swatch?.light : swatch?.dark,
                    }}
                  >
                    <span className="w-1/5" style={{ background: swatch?.sidebar }} />
                    <span className="m-2 h-2 w-1/3 rounded-sm" style={{ background: swatch?.primary }} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium">Motion</h3>
        <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-4">
          <Checkbox
            className="mt-0.5"
            checked={!motionOn}
            disabled={pending}
            onCheckedChange={(value) => setMotion(value !== true)}
            aria-label="Disable animations"
          />
          <span className="min-w-0">
            <span className="block font-medium">Disable animations</span>
            <span className="mt-0.5 block text-xs text-muted">
              Skip page entrance motion and staggered reveals. Your system reduce-motion preference still applies when enabled.
            </span>
          </span>
        </label>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium">Tasks</h3>
        <div className="mt-3 space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-4">
            <Checkbox
              className="mt-0.5"
              checked={!providerTilesOn}
              disabled={pending}
              onCheckedChange={(value) => setProviderTiles(value !== true)}
              aria-label="Disable provider colors on task tiles"
            />
            <span className="min-w-0">
              <span className="block font-medium">Disable provider colors on task tiles</span>
              <span className="mt-0.5 block text-xs text-muted">
                Hide source-colored rails and washes on the tasks board and list. Provider icons still show which system a task came from.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-4">
            <Checkbox
              className="mt-0.5"
              checked={!groupRelatedOn}
              disabled={pending}
              onCheckedChange={(value) => setGroupRelated(value !== true)}
              aria-label="Disable related-task grouping"
            />
            <span className="min-w-0">
              <span className="block font-medium">Disable related-task grouping</span>
              <span className="mt-0.5 block text-xs text-muted">
                Show the tasks list as a flat feed instead of clustering linked tasks together. You can also toggle this from the tasks screen.
              </span>
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}
