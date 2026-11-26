import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  neutral: "bg-accent text-foreground",
  open: "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-100",
  todo: "bg-violet-100 text-violet-950 dark:bg-violet-500/20 dark:text-violet-100",
  in_progress: "bg-amber-100 text-amber-950 dark:bg-amber-500/20 dark:text-amber-100",
  blocked: "bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-100",
  done: "bg-emerald-100 text-emerald-950 dark:bg-emerald-500/20 dark:text-emerald-100",
  cancelled: "bg-stone-200 text-stone-800 dark:bg-stone-500/25 dark:text-stone-200",
  urgent: "bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-100",
  high: "bg-orange-200 text-orange-950 dark:bg-orange-500/20 dark:text-orange-100",
  medium: "bg-amber-100 text-amber-950 dark:bg-amber-500/20 dark:text-amber-100",
  low: "bg-stone-200 text-stone-800 dark:bg-stone-500/25 dark:text-stone-200",
  none: "bg-stone-100 text-stone-700 dark:bg-stone-500/20 dark:text-stone-200",
  native:
    "bg-emerald-100 text-emerald-950 ring-1 ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-100 dark:ring-emerald-400/40",
  external:
    "bg-sky-100 text-sky-950 ring-1 ring-sky-300 dark:bg-sky-500/20 dark:text-sky-100 dark:ring-sky-400/40",
  pending: "bg-amber-100 text-amber-950 dark:bg-amber-500/20 dark:text-amber-100",
  synced: "bg-emerald-100 text-emerald-950 dark:bg-emerald-500/20 dark:text-emerald-100",
  error: "bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-100",
  tombstone: "bg-stone-200 text-stone-800 dark:bg-stone-500/25 dark:text-stone-200",
  connected: "bg-emerald-100 text-emerald-950 dark:bg-emerald-500/20 dark:text-emerald-100",
  revoked: "bg-stone-200 text-stone-800 dark:bg-stone-500/25 dark:text-stone-200",
  project:
    "bg-teal-100 text-teal-950 ring-1 ring-teal-300 dark:bg-teal-500/20 dark:text-teal-100 dark:ring-teal-400/40",
  due: "bg-indigo-100 text-indigo-950 ring-1 ring-indigo-300 dark:bg-indigo-500/20 dark:text-indigo-100 dark:ring-indigo-400/40",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        tones[tone] ?? tones.neutral,
        className,
      )}
    >
      {children}
    </span>
  );
}
