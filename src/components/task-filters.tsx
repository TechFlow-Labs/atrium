"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Boxes, Check, ChevronDown, CircleDashed, Layers, ListFilter, Search, UserRound } from "lucide-react";
import { ProviderIcon, providerLabel } from "@/components/provider-icon";
import { PriorityIcon, StatusIcon } from "@/components/task-meta-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useHoverMenu } from "@/components/ui/use-hover-menu";
import {
  buildTasksHref,
  parseFilterList,
  serializeFilterList,
  type FilterValues,
} from "@/lib/task-filters";
import { cn } from "@/lib/utils";

export type { FilterValues };
export { buildTasksHref, parseFilterList, serializeFilterList };

type ProjectOption = { id: string; name: string; productId?: string };
type ProductOption = { id: string; name: string };
type AssigneeOption = { value: string; label: string };

type PickerOption = {
  value: string;
  label: string;
  icon: ReactNode;
};

const STATUS_OPTIONS: PickerOption[] = [
  { value: "open", label: "Open", icon: <StatusIcon status="open" /> },
  { value: "todo", label: "To do", icon: <StatusIcon status="todo" /> },
  { value: "in_progress", label: "In progress", icon: <StatusIcon status="in_progress" /> },
  { value: "blocked", label: "Blocked", icon: <StatusIcon status="blocked" /> },
  { value: "done", label: "Done", icon: <StatusIcon status="done" /> },
  { value: "cancelled", label: "Cancelled", icon: <StatusIcon status="cancelled" /> },
];

const PRIORITY_OPTIONS: PickerOption[] = [
  { value: "attention", label: "Needs attention", icon: <PriorityIcon priority="attention" /> },
  { value: "urgent", label: "Urgent", icon: <PriorityIcon priority="urgent" /> },
  { value: "high", label: "High", icon: <PriorityIcon priority="high" /> },
  { value: "medium", label: "Medium", icon: <PriorityIcon priority="medium" /> },
  { value: "low", label: "Low", icon: <PriorityIcon priority="low" /> },
];

const SOURCE_OPTIONS: PickerOption[] = [
  { value: "atrium", label: "Atrium", icon: <ProviderIcon provider="native" /> },
  { value: "linear", label: providerLabel("linear"), icon: <ProviderIcon provider="linear" /> },
  { value: "jira", label: providerLabel("jira"), icon: <ProviderIcon provider="jira" /> },
  { value: "github", label: providerLabel("github"), icon: <ProviderIcon provider="github" /> },
  { value: "gitlab", label: providerLabel("gitlab"), icon: <ProviderIcon provider="gitlab" /> },
  { value: "gitea", label: providerLabel("gitea"), icon: <ProviderIcon provider="gitea" /> },
];

function MultiFilterPicker({
  label,
  emptyLabel,
  values,
  options,
  onChange,
  noun,
  fullWidth = false,
}: {
  label: string;
  emptyLabel: string;
  values: string[];
  options: PickerOption[];
  onChange: (values: string[]) => void;
  noun: string;
  fullWidth?: boolean;
}) {
  const menu = useHoverMenu();
  const selected = options.filter((option) => values.includes(option.value));
  const summary =
    selected.length === 0
      ? emptyLabel
      : selected.length === 1
        ? selected[0]!.label
        : `${selected.length} ${noun}`;

  function toggle(value: string) {
    if (!value) {
      onChange([]);
      return;
    }
    if (values.includes(value)) {
      onChange(values.filter((item) => item !== value));
      return;
    }
    onChange([...values, value]);
  }

  return (
    <DropdownMenu open={menu.open} onOpenChange={menu.onOpenChange} modal={false}>
      <DropdownMenuTrigger
        aria-label={label}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-left text-xs outline-none",
          fullWidth && "w-full",
          "transition hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring",
          selected.length > 0 && "border-foreground/25 bg-accent/30",
          menu.open && "border-foreground/20 bg-accent/40",
        )}
        {...menu.triggerProps}
      >
        <span className="text-muted">{label}</span>
        {selected.length > 0 ? (
          <span className="max-w-36 truncate font-medium">{summary}</span>
        ) : null}
        <ChevronDown className="size-3 shrink-0 text-muted" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56" {...menu.contentProps}>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onChange([]);
          }}
          className={cn(selected.length === 0 && "bg-accent")}
        >
          <span className="inline-flex size-5 shrink-0 items-center justify-center">
            <Layers className="size-4 text-muted" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 truncate">{emptyLabel}</span>
          {selected.length === 0 ? <Check className="size-3.5 shrink-0 text-foreground" aria-hidden="true" /> : null}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((option) => {
          const active = values.includes(option.value);
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={(event) => {
                event.preventDefault();
                toggle(option.value);
              }}
              className={cn(active && "bg-accent")}
            >
              <span className="inline-flex size-5 shrink-0 items-center justify-center">{option.icon}</span>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {active ? <Check className="size-3.5 shrink-0 text-foreground" aria-hidden="true" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TaskViewToggle({
  values,
  onNavigate,
}: {
  values: FilterValues;
  onNavigate: (href: string) => void;
}) {
  const board = values.view === "board";
  return (
    <nav
      data-drag-inert=""
      className="flex items-center gap-0.5 rounded-md border bg-card p-0.5 text-xs"
      aria-label="Task views"
    >
      <button
        type="button"
        aria-pressed={!board}
        onClick={() => onNavigate(buildTasksHref({ ...values, view: undefined }))}
        className={cn(
          "rounded px-2 py-1 transition",
          !board
            ? "bg-foreground text-background"
            : "text-muted hover:bg-accent hover:text-foreground",
        )}
      >
        List
      </button>
      <button
        type="button"
        aria-pressed={board}
        onClick={() => onNavigate(buildTasksHref({ ...values, view: "board" }))}
        className={cn(
          "rounded px-2 py-1 transition",
          board
            ? "bg-foreground text-background"
            : "text-muted hover:bg-accent hover:text-foreground",
        )}
      >
        Board
      </button>
    </nav>
  );
}

const SEARCH_DEBOUNCE_MS = 300;

export function TaskSearch({
  values,
  pending = false,
  onNavigate,
  className,
}: {
  values: FilterValues;
  pending?: boolean;
  onNavigate: (href: string) => void;
  className?: string;
}) {
  const [q, setQ] = useState(values.q ?? "");
  const [prevQ, setPrevQ] = useState(values.q);
  const valuesRef = useRef(values);
  const onNavigateRef = useRef(onNavigate);

  if (values.q !== prevQ) {
    setPrevQ(values.q);
    setQ(values.q ?? "");
  }

  useEffect(() => {
    valuesRef.current = values;
    onNavigateRef.current = onNavigate;
  }, [values, onNavigate]);

  useEffect(() => {
    const next = q.trim();
    const current = (valuesRef.current.q ?? "").trim();
    if (next === current) return;
    const timer = window.setTimeout(() => {
      onNavigateRef.current(buildTasksHref({ ...valuesRef.current, q: next || undefined }));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [q]);

  function onSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onNavigate(buildTasksHref({ ...values, q: q.trim() || undefined }));
  }

  return (
    <form
      onSubmit={onSearchSubmit}
      className={cn("relative w-full", pending && "opacity-70", className)}
      aria-busy={pending}
    >
      <label className="relative block">
        <span className="sr-only">Search tasks</span>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          name="q"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search"
          className="h-8 w-full rounded-md border bg-card py-1 pl-8 pr-2 text-xs outline-none ring-ring focus-visible:ring-2"
          aria-label="Search tasks"
        />
      </label>
    </form>
  );
}

export function TaskFilters({
  projects,
  products = [],
  assignees = [],
  values,
  pending = false,
  onNavigate,
}: {
  projects: ProjectOption[];
  products?: ProductOption[];
  assignees?: AssigneeOption[];
  values: FilterValues;
  pending?: boolean;
  onNavigate: (href: string) => void;
}) {
  const statuses = parseFilterList(values.status);
  const priorities = parseFilterList(values.priority);
  const selectedProducts = parseFilterList(values.product);
  const selectedProjects = parseFilterList(values.project);
  const sources = parseFilterList(values.source);
  const selectedAssignees = parseFilterList(values.assignee);

  const productOptions: PickerOption[] = products.map((item) => ({
    value: item.id,
    label: item.name,
    icon: <Boxes className="size-4 text-teal-700" aria-hidden="true" />,
  }));

  const visibleProjects =
    selectedProducts.length === 0
      ? projects
      : projects.filter(
          (project) => project.productId && selectedProducts.includes(project.productId),
        );

  const projectOptions: PickerOption[] = visibleProjects.map((item) => ({
    value: item.id,
    label: item.name,
    icon: <CircleDashed className="size-4 text-teal-600" aria-hidden="true" />,
  }));

  const assigneeOptions: PickerOption[] = [
    {
      value: "unassigned",
      label: "Unassigned",
      icon: <UserRound className="size-4 text-muted" aria-hidden="true" />,
    },
    ...assignees.map((item) => ({
      value: item.value,
      label: item.label,
      icon: <UserRound className="size-4 text-sky-600" aria-hidden="true" />,
    })),
  ];

  function navigate(next: Partial<FilterValues>) {
    onNavigate(
      buildTasksHref({
        ...values,
        status: serializeFilterList(statuses),
        priority: serializeFilterList(priorities),
        product: serializeFilterList(selectedProducts),
        project: serializeFilterList(selectedProjects),
        source: serializeFilterList(sources),
        assignee: serializeFilterList(selectedAssignees),
        ...next,
      }),
    );
  }

  const menu = useHoverMenu();
  const projectSelection = selectedProjects.filter((id) => visibleProjects.some((project) => project.id === id));
  const chips = [
    ...(values.q?.trim() ? [{ key: "q", group: "Search", label: values.q.trim() }] : []),
    ...chipLabels("Status", statuses, STATUS_OPTIONS),
    ...chipLabels("Priority", priorities, PRIORITY_OPTIONS),
    ...chipLabels("Product", selectedProducts, productOptions),
    ...chipLabels("Project", projectSelection, projectOptions),
    ...chipLabels("Assigned to", selectedAssignees, assigneeOptions),
    ...chipLabels("Source", sources, SOURCE_OPTIONS),
  ];

  return (
    <div
      data-drag-inert=""
      className={cn("flex flex-wrap items-center gap-1.5", pending && "opacity-70")}
      aria-busy={pending}
    >
      <Popover open={menu.open} onOpenChange={menu.onOpenChange}>
        <PopoverTrigger
          type="button"
          aria-label="Filters"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs outline-none",
            "transition hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring",
            menu.open && "border-foreground/20 bg-accent/40",
          )}
          {...menu.triggerProps}
        >
          <ListFilter className="size-3.5" aria-hidden="true" />
          Filters
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(100vw-2rem,44rem)]"
          {...menu.contentProps}
          onPointerDown={() => menu.onOpenChange(true)}
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <TaskSearch values={values} pending={pending} onNavigate={onNavigate} className="col-span-2 sm:col-span-3" />
      <MultiFilterPicker
        label="Status"
        emptyLabel="Any status"
        noun="statuses"
        fullWidth
        values={statuses}
        options={STATUS_OPTIONS}
        onChange={(next) => navigate({ status: serializeFilterList(next) })}
      />
      <MultiFilterPicker
        label="Priority"
        emptyLabel="Any priority"
        noun="priorities"
        fullWidth
        values={priorities}
        options={PRIORITY_OPTIONS}
        onChange={(next) => navigate({ priority: serializeFilterList(next) })}
      />
      {products.length > 0 ? (
        <MultiFilterPicker
          label="Product"
          emptyLabel="Any product"
          noun="products"
          fullWidth
          values={selectedProducts}
          options={productOptions}
          onChange={(next) => {
            const allowed = new Set(
              projects
                .filter((project) => !next.length || (project.productId && next.includes(project.productId)))
                .map((project) => project.id),
            );
            navigate({
              product: serializeFilterList(next),
              project: serializeFilterList(selectedProjects.filter((id) => allowed.has(id))),
            });
          }}
        />
      ) : null}
      <MultiFilterPicker
        label="Project"
        emptyLabel="Any project"
        noun="projects"
        fullWidth
        values={projectSelection}
        options={projectOptions}
        onChange={(next) => navigate({ project: serializeFilterList(next) })}
      />
      <MultiFilterPicker
        label="Assigned to"
        emptyLabel="Any assignee"
        noun="assignees"
        fullWidth
        values={selectedAssignees}
        options={assigneeOptions}
        onChange={(next) => navigate({ assignee: serializeFilterList(next) })}
      />
      <MultiFilterPicker
        label="Source"
        emptyLabel="Any source"
        noun="sources"
        fullWidth
        values={sources}
        options={SOURCE_OPTIONS}
        onChange={(next) => navigate({ source: serializeFilterList(next) })}
      />
          </div>
        </PopoverContent>
      </Popover>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex h-8 max-w-48 items-center gap-1 rounded-md border border-foreground/20 bg-accent/30 px-2 text-xs"
        >
          <span className="text-muted">{chip.group}</span>
          <span className="truncate font-medium">{chip.label}</span>
        </span>
      ))}
      {chips.length > 0 ? (
        <button
          type="button"
          className="h-8 rounded-md px-2 text-xs text-muted transition hover:bg-accent hover:text-foreground"
          onClick={() =>
            onNavigate(
              buildTasksHref({
                ...values,
                q: undefined,
                status: undefined,
                priority: undefined,
                product: undefined,
                project: undefined,
                source: undefined,
                assignee: undefined,
              }),
            )
          }
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

function chipLabels(group: string, values: string[], options: PickerOption[]) {
  return values.flatMap((value) => {
    const option = options.find((item) => item.value === value);
    if (!option) return [];
    return [{ key: `${group}:${value}`, group, label: option.label }];
  });
}
