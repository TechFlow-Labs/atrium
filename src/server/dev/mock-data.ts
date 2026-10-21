import { sql } from "drizzle-orm";
import { withUser } from "@/server/db/client";

/** Marker on project names so mock rows can be filtered without a schema change. */
export const DEV_MOCK_NAME_PREFIX = "Demo · ";

export const DEV_MOCKS_COOKIE = "atrium_dev_mocks";

export function isLocalDev(): boolean {
  const configured = (process.env.BETTER_AUTH_URL ?? "").trim();
  if (configured) {
    try {
      const host = new URL(configured).hostname.toLowerCase();
      if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) {
        return true;
      }
      return false;
    } catch {
      // Fall through to NODE_ENV.
    }
  }
  return process.env.NODE_ENV !== "production";
}

/** Cookie unset defaults to visible on localhost. */
export function parseDevMocksVisible(raw?: string | null): boolean {
  if (raw == null || raw === "") return true;
  const value = raw.trim().toLowerCase();
  if (value === "0" || value === "off" || value === "false" || value === "hidden") return false;
  return true;
}

export async function areDevMocksVisible(): Promise<boolean> {
  if (!isLocalDev()) return true;
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    return parseDevMocksVisible(jar.get(DEV_MOCKS_COOKIE)?.value);
  } catch {
    // Outside a request (tests/scripts): do not hide rows.
    return true;
  }
}

/** SQL fragment for queries that already join `projects p`. */
export function sqlDevMockProjectVisible(showMocks: boolean) {
  if (showMocks) return sql`true`;
  return sql`p.name not like ${`${DEV_MOCK_NAME_PREFIX}%`}`;
}

/** SQL fragment for task-only queries (no projects join). */
export function sqlDevMockTaskVisible(showMocks: boolean) {
  if (showMocks) return sql`true`;
  return sql`not exists (
    select 1 from projects __dev_mock_p
    where __dev_mock_p.id = t.project_id
      and __dev_mock_p.name like ${`${DEV_MOCK_NAME_PREFIX}%`}
  )`;
}

export function localDevLabel(): string {
  const base = (process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "") || "http://127.0.0.1";
  try {
    return new URL(base).host;
  } catch {
    return base;
  }
}

type MockTaskSeed = {
  title: string;
  description?: string;
  priority: "none" | "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "blocked" | "done" | "cancelled";
  dueInDays?: number | null;
};

type MockProjectSeed = {
  name: string;
  description: string;
  tasks: MockTaskSeed[];
};

const WORK_MOCK_CATALOG: MockProjectSeed[] = [
  {
    name: `${DEV_MOCK_NAME_PREFIX}Launch board`,
    description: "Localhost-only work demo for debugging the console.",
    tasks: [
      {
        title: "Confirm the vendor shortlist",
        description: "Three studios replied. Pick one before Friday.",
        priority: "urgent",
        status: "in_progress",
        dueInDays: 3,
      },
      {
        title: "Unblock the contract review",
        priority: "high",
        status: "blocked",
        dueInDays: 5,
      },
      {
        title: "Publish the internal note",
        priority: "medium",
        status: "open",
        dueInDays: 7,
      },
      {
        title: "Archive the kickoff deck",
        priority: "low",
        status: "done",
        dueInDays: -2,
      },
    ],
  },
  {
    name: `${DEV_MOCK_NAME_PREFIX}Ops runway`,
    description: "Second work demo with mixed priorities and due dates.",
    tasks: [
      {
        title: "Rotate staging credentials",
        priority: "high",
        status: "open",
        dueInDays: 1,
      },
      {
        title: "Draft the weekly status",
        priority: "medium",
        status: "in_progress",
        dueInDays: 2,
      },
      {
        title: "Close the leftover triage tickets",
        priority: "low",
        status: "open",
        dueInDays: 10,
      },
      {
        title: "Cancel the unused staging job",
        priority: "none",
        status: "cancelled",
        dueInDays: null,
      },
    ],
  },
];

const PERSONAL_MOCK_CATALOG: MockProjectSeed[] = [
  {
    name: `${DEV_MOCK_NAME_PREFIX}Home desk`,
    description: "Localhost-only personal demo for this account.",
    tasks: [
      {
        title: "Book the dentist",
        priority: "medium",
        status: "open",
        dueInDays: 4,
      },
      {
        title: "Renew the domain",
        description: "Registrar email arrived last week.",
        priority: "high",
        status: "in_progress",
        dueInDays: 2,
      },
      {
        title: "Sort the tax folder",
        priority: "low",
        status: "blocked",
        dueInDays: 14,
      },
      {
        title: "Return the library books",
        priority: "low",
        status: "done",
        dueInDays: -1,
      },
    ],
  },
  {
    name: `${DEV_MOCK_NAME_PREFIX}Side project`,
    description: "A second personal demo with lighter work.",
    tasks: [
      {
        title: "Sketch the landing page",
        priority: "medium",
        status: "in_progress",
        dueInDays: 6,
      },
      {
        title: "Write the README",
        priority: "low",
        status: "open",
        dueInDays: 9,
      },
      {
        title: "Park the unused idea",
        priority: "none",
        status: "cancelled",
        dueInDays: null,
      },
    ],
  },
];

function catalogForKind(kind: string): MockProjectSeed[] {
  return kind === "personal" ? PERSONAL_MOCK_CATALOG : WORK_MOCK_CATALOG;
}

async function countActiveMockProjects(userId: string, workspaceId: string): Promise<number> {
  const rows = await withUser(userId, async (tx) =>
    tx.execute<{ count: number }>(sql`
      select count(*)::int as count
      from projects
      where workspace_id = ${workspaceId}::uuid
        and status = 'active'
        and name like ${`${DEV_MOCK_NAME_PREFIX}%`}
    `),
  );
  return rows[0]?.count ?? 0;
}

async function retireMockProjects(userId: string, workspaceId: string): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await withUser(userId, async (tx) => {
    await tx.execute(sql`
      update tasks
      set deleted_at = coalesce(deleted_at, now()),
          updated_at = now()
      where workspace_id = ${workspaceId}::uuid
        and deleted_at is null
        and project_id in (
          select id from projects
          where workspace_id = ${workspaceId}::uuid
            and name like ${`${DEV_MOCK_NAME_PREFIX}%`}
        )
    `);
    await tx.execute(sql`
      update projects
      set status = 'archived',
          archived_at = coalesce(archived_at, now()),
          name = left('Retired mock · ' || ${stamp} || ' · ' || name, 120),
          updated_at = now()
      where workspace_id = ${workspaceId}::uuid
        and name like ${`${DEV_MOCK_NAME_PREFIX}%`}
    `);
  });
}

async function seedMockCatalog(userId: string, workspaceId: string, kind = "work"): Promise<void> {
  // Dynamic imports avoid a cycle with projects/tasks services (they import visibility helpers).
  const { createNativeProject } = await import("@/server/projects/service");
  const { createTask } = await import("@/server/tasks/service");
  for (const project of catalogForKind(kind)) {
    const projectId = await createNativeProject(userId, workspaceId, {
      name: project.name,
      description: project.description,
    });
    for (const task of project.tasks) {
      const dueAt =
        task.dueInDays == null
          ? null
          : (() => {
              const date = new Date();
              date.setUTCDate(date.getUTCDate() + task.dueInDays);
              return date.toISOString();
            })();
      await createTask(userId, workspaceId, {
        projectId,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        dueAt,
      });
    }
  }
}

async function workspaceKind(userId: string, workspaceId: string): Promise<string> {
  const rows = await withUser(userId, async (tx) =>
    tx.execute<{ kind: string }>(sql`
      select kind from workspaces where id = ${workspaceId}::uuid limit 1
    `),
  );
  return rows[0]?.kind ?? "work";
}

/** Idempotent: creates demo projects/tasks when none are present on localhost. */
export async function ensureDevMockData(
  userId: string,
  workspaceId: string,
  kind?: string,
): Promise<void> {
  if (!isLocalDev()) return;
  if (!(await areDevMocksVisible())) return;
  if ((await countActiveMockProjects(userId, workspaceId)) > 0) return;
  try {
    await seedMockCatalog(userId, workspaceId, kind ?? (await workspaceKind(userId, workspaceId)));
  } catch {
    // Shared workspaces without project.create should not break the shell.
  }
}

/** Seeds demo data into every writable workspace for this account. */
export async function ensureDevMockDataForAccount(
  userId: string,
  workspaces: Array<{ id: string; kind: string; role: string }>,
): Promise<void> {
  if (!isLocalDev()) return;
  if (!(await areDevMocksVisible())) return;
  for (const workspace of workspaces) {
    if (workspace.role === "viewer") continue;
    await ensureDevMockData(userId, workspace.id, workspace.kind);
  }
}

/** Archive existing demo rows and seed a fresh catalog. */
export async function reseedDevMockData(userId: string, workspaceId: string): Promise<void> {
  if (!isLocalDev()) throw new Error("Dev mocks are only available on localhost");
  await retireMockProjects(userId, workspaceId);
  await seedMockCatalog(userId, workspaceId, await workspaceKind(userId, workspaceId));
}
