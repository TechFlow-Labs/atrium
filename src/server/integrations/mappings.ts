import type { FieldMappings, TaskPriority, TaskStatus } from "./types";

export function mapStatusToProvider(mappings: FieldMappings, status: TaskStatus): string {
  const mapped = mappings.status?.[status];
  if (mapped) return mapped;
  if (status === "todo") return mappings.status?.open ?? "open";
  return status;
}

export function mapStatusFromProvider(mappings: FieldMappings, value: string | null | undefined): TaskStatus {
  if (!value) return "open";
  const entry = Object.entries(mappings.status ?? {}).find(([, providerValue]) => providerValue === value);
  if (entry) return entry[0] as TaskStatus;
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  if (normalized === "todo" || normalized === "backlog" || normalized === "open") return "open";
  if (normalized.includes("progress")) return "in_progress";
  if (normalized.includes("block")) return "blocked";
  if (normalized === "done" || normalized === "closed" || normalized === "complete" || normalized === "completed") {
    return "done";
  }
  if (normalized.includes("cancel")) return "cancelled";
  return "open";
}

export function mapPriorityToProvider(mappings: FieldMappings, priority: TaskPriority): string {
  return mappings.priority?.[priority] ?? priority;
}

export function mapPriorityFromProvider(mappings: FieldMappings, value: string | number | null | undefined): TaskPriority {
  if (value === null || value === undefined || value === "") return "none";
  const asString = String(value);
  const entry = Object.entries(mappings.priority ?? {}).find(([, providerValue]) => providerValue === asString);
  if (entry) return entry[0] as TaskPriority;
  const normalized = asString.toLowerCase();
  if (normalized === "1" || normalized.includes("urgent")) return "urgent";
  if (normalized === "2" || normalized === "high") return "high";
  if (normalized === "3" || normalized === "medium") return "medium";
  if (normalized === "4" || normalized === "low") return "low";
  return "none";
}

export function mapAssigneeToProvider(mappings: FieldMappings, userId: string | null | undefined): string | null {
  if (!userId) return null;
  return mappings.assignees?.[userId] ?? null;
}
