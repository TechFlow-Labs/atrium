"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronDown, Layers } from "lucide-react";
import { ProviderIcon, providerLabel } from "@/components/provider-icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useHoverMenu } from "@/components/ui/use-hover-menu";
import { cn } from "@/lib/utils";

export function homeHref(source?: string): string {
  if (!source) return "/home";
  return `/home?source=${encodeURIComponent(source)}`;
}

type SourceOption = {
  value: string;
  label: string;
  provider: string | null;
};

export function HomeSourceFilter({
  source,
  sources,
  onChange,
}: {
  source: string;
  sources: Array<{ provider: string; display_name: string }>;
  onChange?: (source: string) => void;
}) {
  const router = useRouter();
  const menu = useHoverMenu();

  const options: SourceOption[] = [
    { value: "", label: "All sources", provider: null },
    { value: "atrium", label: "Atrium", provider: "native" },
    ...sources.map((row) => ({
      value: row.provider,
      label: providerLabel(row.provider),
      provider: row.provider,
    })),
  ];

  const selected = options.find((option) => option.value === source) ?? options[0]!;
  const indicatorOptions =
    selected.value === ""
      ? options.filter((option) => option.provider)
      : options.filter((option) => option.value === selected.value && option.provider);

  function choose(value: string) {
    menu.onOpenChange(false);
    if (onChange) {
      onChange(value);
      return;
    }
    router.push(homeHref(value || undefined));
  }

  return (
    <Popover open={menu.open} onOpenChange={menu.onOpenChange}>
      <PopoverTrigger
        type="button"
        aria-label={`Show data from ${selected.label}`}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-sm outline-none transition",
          "hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring",
          menu.open && "border-foreground/25 bg-accent",
        )}
        {...menu.triggerProps}
      >
        <span className="text-sm text-muted">Sources</span>
        <span className="inline-flex items-center" aria-hidden="true">
          {indicatorOptions.length === 0 ? (
            <Layers className="size-4 text-muted" />
          ) : (
            <span className="inline-flex items-center">
              {indicatorOptions.map((option, index) => (
                <span
                  key={option.value}
                  className={cn(index > 0 && "-ml-1.5")}
                  style={{ zIndex: indicatorOptions.length - index }}
                >
                  <ProviderIcon provider={option.provider} className="ring-2 ring-card" />
                </span>
              ))}
            </span>
          )}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        className="w-56 p-1"
        {...menu.contentProps}
      >
        <div role="listbox" aria-label="Filter dashboard by integration" className="grid gap-0.5">
          {options.map((option) => {
            const active = selected.value === option.value;
            return (
              <button
                key={option.value || "all"}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => choose(option.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition",
                  active ? "bg-accent text-foreground" : "text-foreground hover:bg-accent/50",
                )}
              >
                {option.provider ? (
                  <ProviderIcon provider={option.provider} />
                ) : (
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-secondary text-muted ring-1 ring-border">
                    <Layers className="size-3.5" aria-hidden="true" />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {active ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
