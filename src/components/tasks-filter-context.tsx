"use client";

import { createContext, useContext } from "react";
import type { FilterValues } from "@/lib/task-filters";

const TasksFilterContext = createContext<FilterValues | null>(null);

export function TasksFilterProvider({
  values,
  children,
}: {
  values: FilterValues;
  children: React.ReactNode;
}) {
  return <TasksFilterContext.Provider value={values}>{children}</TasksFilterContext.Provider>;
}

export function useTasksFilterValues(): FilterValues {
  const values = useContext(TasksFilterContext);
  if (!values) {
    throw new Error("useTasksFilterValues must be used within TasksFilterProvider");
  }
  return values;
}
