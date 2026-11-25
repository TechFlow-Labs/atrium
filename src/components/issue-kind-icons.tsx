import {
  AppWindow,
  BookOpen,
  Bug,
  ClipboardList,
  Code2,
  Database,
  FileText,
  Hammer,
  HelpCircle,
  LayoutDashboard,
  Lightbulb,
  MessageSquareText,
  MonitorSmartphone,
  Paintbrush,
  PenLine,
  Rocket,
  Search,
  Server,
  Settings2,
  Shield,
  ShoppingBag,
  Siren,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { IssueCategoryId } from "@/lib/issue-kinds";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<IssueCategoryId, LucideIcon> = {
  software: Code2,
  product: Lightbulb,
  design: Paintbrush,
  operations: Wrench,
  general: ClipboardList,
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  frontend: AppWindow,
  backend: Server,
  mobile: MonitorSmartphone,
  infrastructure: Settings2,
  data: Database,
  security: Shield,
  bug: Bug,
  docs: BookOpen,
  discovery: Search,
  spec: FileText,
  launch: Rocket,
  interface: LayoutDashboard,
  research: Sparkles,
  content: MessageSquareText,
  incident: Siren,
  release: Rocket,
  maintenance: Hammer,
  admin: PenLine,
  errand: ShoppingBag,
};

export function IssueCategoryIcon({
  categoryId,
  className,
}: {
  categoryId: string | null | undefined;
  className?: string;
}) {
  if (!categoryId || !(categoryId in CATEGORY_ICONS)) return null;
  const Icon = CATEGORY_ICONS[categoryId as IssueCategoryId];
  return <Icon className={cn("size-4 shrink-0 text-muted", className)} aria-hidden="true" />;
}

export function IssueTypeIcon({
  typeId,
  className,
}: {
  typeId: string | null | undefined;
  className?: string;
}) {
  if (!typeId) return null;
  const Icon = TYPE_ICONS[typeId] ?? HelpCircle;
  return <Icon className={cn("size-4 shrink-0 text-muted", className)} aria-hidden="true" />;
}
