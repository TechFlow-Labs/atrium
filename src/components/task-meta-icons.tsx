import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDot,
  ListTodo,
  CircleSlash,
  CloudOff,
  Flame,
  LoaderCircle,
  Minus,
  RefreshCw,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Siren,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_ICONS: Record<string, { icon: LucideIcon; className: string }> = {
  open: { icon: Circle, className: "text-sky-500" },
  todo: { icon: ListTodo, className: "text-violet-500" },
  in_progress: { icon: CircleDot, className: "text-amber-500" },
  blocked: { icon: AlertTriangle, className: "text-rose-500" },
  done: { icon: CheckCircle2, className: "text-emerald-500" },
  cancelled: { icon: CircleSlash, className: "text-stone-400" },
};

const PRIORITY_ICONS: Record<string, { icon: LucideIcon; className: string }> = {
  none: { icon: Minus, className: "text-stone-400" },
  attention: { icon: Siren, className: "text-rose-600" },
  urgent: { icon: Flame, className: "text-rose-600" },
  high: { icon: SignalHigh, className: "text-orange-500" },
  medium: { icon: SignalMedium, className: "text-amber-500" },
  low: { icon: SignalLow, className: "text-stone-400" },
};

const SYNC_ICONS: Record<string, { icon: LucideIcon; className: string; label: string }> = {
  synced: { icon: CheckCircle2, className: "text-emerald-500", label: "Synced" },
  pending: { icon: LoaderCircle, className: "animate-spin text-amber-500", label: "Pending sync" },
  error: { icon: CloudOff, className: "text-rose-500", label: "Sync error" },
  tombstone: { icon: RefreshCw, className: "text-stone-400", label: "Removed upstream" },
};

export function StatusIcon({ status, className }: { status: string; className?: string }) {
  const meta = STATUS_ICONS[status];
  if (!meta) return null;
  const Icon = meta.icon;
  return <Icon className={cn("size-4 shrink-0", meta.className, className)} aria-hidden="true" />;
}

export function PriorityIcon({ priority, className }: { priority: string; className?: string }) {
  const meta = PRIORITY_ICONS[priority];
  if (!meta) return null;
  const Icon = meta.icon;
  return <Icon className={cn("size-4 shrink-0", meta.className, className)} aria-hidden="true" />;
}

export function syncStateLabel(state: string): string {
  return SYNC_ICONS[state]?.label ?? SYNC_ICONS.synced?.label ?? "Synced";
}

export function SyncStateIcon({ state, className }: { state: string; className?: string }) {
  const meta = SYNC_ICONS[state] ?? SYNC_ICONS.synced;
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span title={meta.label} className="inline-flex">
      <Icon className={cn("size-4 shrink-0", meta.className, className)} aria-label={meta.label} />
    </span>
  );
}
