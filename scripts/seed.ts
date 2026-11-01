import { config } from "dotenv";

config({ path: ".env.local" });

const DEMO_PASSWORD = "atrium-demo-12";

async function ensureUser(email: string, name: string): Promise<string> {
  const { getAuth } = await import("../src/server/auth/auth");
  const { getDb } = await import("../src/server/db/client");
  const { sql } = await import("drizzle-orm");
  try {
    await getAuth().api.signUpEmail({ body: { email, password: DEMO_PASSWORD, name } });
  } catch {
    // The account already exists. The seed is safe to run again.
  }
  const rows = await getDb().execute<{ id: string }>(sql`select id from "user" where email = ${email}`);
  const id = rows[0]?.id;
  if (!id) throw new Error(`Could not seed ${email}`);
  return id;
}

async function countActiveProjects(workspaceId: string): Promise<number> {
  const { getDb } = await import("../src/server/db/client");
  const { sql } = await import("drizzle-orm");
  const rows = await getDb().execute<{ count: number }>(sql`
    select count(*)::int as count from projects
    where workspace_id = ${workspaceId}::uuid and status = 'active'
  `);
  return Number(rows[0]?.count ?? 0);
}

async function main(): Promise<void> {
  const { closeDb } = await import("../src/server/db/client");
  const { ensurePersonalWorkspace, createWorkspace, inviteMember, acceptInvitation, listWorkspaces } = await import(
    "../src/server/workspaces/service"
  );
  const { createNativeProject } = await import("../src/server/projects/service");
  const { createTask } = await import("../src/server/tasks/service");

  const mira = await ensureUser("mira.vell@atrium.local", "Mira Vell");
  const jonas = await ensureUser("jonas.reid@atrium.local", "Jonas Reid");
  await ensurePersonalWorkspace(mira, "Mira Vell");
  await ensurePersonalWorkspace(jonas, "Jonas Reid");

  const dueIn = (days: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
  };

  const miraSpaces = await listWorkspaces(mira);
  const miraPersonal = miraSpaces.find((workspace) => workspace.kind === "personal");
  if (miraPersonal && (await countActiveProjects(miraPersonal.id)) === 0) {
    const garden = await createNativeProject(mira, miraPersonal.id, {
      name: "Garden plans",
      description: "Mira's personal workspace seed.",
    });
    await createTask(mira, miraPersonal.id, {
      projectId: garden,
      title: "Order spring bulbs",
      priority: "medium",
      status: "open",
      dueAt: dueIn(5),
    });
    await createTask(mira, miraPersonal.id, {
      projectId: garden,
      title: "Fix the potting bench",
      priority: "low",
      status: "in_progress",
      dueAt: dueIn(8),
    });
  }

  if (!miraSpaces.some((workspace) => workspace.name === "Northwind Studio")) {
    const workId = await createWorkspace(mira, { name: "Northwind Studio", kind: "work" });
    const launch = await createNativeProject(mira, workId, {
      name: "Launch board",
      description: "Native work owned by this workspace.",
    });
    const vendor = await createTask(mira, workId, {
      projectId: launch,
      title: "Confirm the vendor shortlist",
      description: "Three studios replied. Pick one before Friday.",
      priority: "urgent",
      status: "in_progress",
      dueAt: dueIn(3),
    });
    const contract = await createTask(mira, workId, {
      projectId: launch,
      title: "Unblock the contract review",
      priority: "high",
      status: "blocked",
      dueAt: dueIn(5),
    });
    const note = await createTask(mira, workId, {
      projectId: launch,
      title: "Publish the internal note",
      priority: "medium",
      status: "open",
      dueAt: dueIn(7),
    });
    const { addTaskLink } = await import("../src/server/tasks/links");
    await addTaskLink(mira, workId, {
      fromTaskId: contract,
      toTaskId: vendor,
      linkType: "blocks",
    });
    await addTaskLink(mira, workId, {
      fromTaskId: note,
      toTaskId: vendor,
      linkType: "relates_to",
    });
    const invite = await inviteMember(mira, workId, { email: "jonas.reid@atrium.local", role: "member" });
    await acceptInvitation(jonas, invite.token);
  } else {
    // Idempotent demo links for an already-seeded Northwind Studio.
    const northwind = miraSpaces.find((workspace) => workspace.name === "Northwind Studio");
    if (northwind) {
      const { withUser } = await import("../src/server/db/client");
      const { sql } = await import("drizzle-orm");
      const { addTaskLink } = await import("../src/server/tasks/links");
      const linkCount = await withUser(mira, async (tx) =>
        tx.execute<{ count: number }>(sql`
          select count(*)::int as count from task_links
          where workspace_id = ${northwind.id}::uuid
        `),
      );
      if (Number(linkCount[0]?.count ?? 0) === 0) {
        const demoTasks = await withUser(mira, async (tx) =>
          tx.execute<{ id: string; title: string }>(sql`
            select t.id, t.title from tasks t
            join projects p on p.id = t.project_id
            where t.workspace_id = ${northwind.id}::uuid
              and t.deleted_at is null
              and p.name = 'Launch board'
              and t.title in (
                'Confirm the vendor shortlist',
                'Unblock the contract review',
                'Publish the internal note'
              )
          `),
        );
        const byTitle = new Map(demoTasks.map((row) => [row.title, row.id]));
        const vendor = byTitle.get("Confirm the vendor shortlist");
        const contract = byTitle.get("Unblock the contract review");
        const note = byTitle.get("Publish the internal note");
        if (vendor && contract) {
          await addTaskLink(mira, northwind.id, {
            fromTaskId: contract,
            toTaskId: vendor,
            linkType: "blocks",
          });
        }
        if (vendor && note) {
          await addTaskLink(mira, northwind.id, {
            fromTaskId: note,
            toTaskId: vendor,
            linkType: "relates_to",
          });
        }
      }
    }
  }

  const refreshed = await listWorkspaces(mira);
  if (!refreshed.some((workspace) => workspace.name === "Harbor Ledger")) {
    const privateId = await createWorkspace(mira, { name: "Harbor Ledger", kind: "work" });
    const books = await createNativeProject(mira, privateId, {
      name: "Personal books",
      description: "Jonas is not a member of this workspace.",
    });
    await createTask(mira, privateId, {
      projectId: books,
      title: "File the quarter receipts",
      priority: "low",
      status: "open",
      dueAt: dueIn(4),
    });
  }

  const jonasSpaces = await listWorkspaces(jonas);
  const jonasPersonal = jonasSpaces.find((workspace) => workspace.kind === "personal");
  if (jonasPersonal && (await countActiveProjects(jonasPersonal.id)) === 0) {
    const study = await createNativeProject(jonas, jonasPersonal.id, {
      name: "Study track",
      description: "Jonas's personal workspace seed.",
    });
    await createTask(jonas, jonasPersonal.id, {
      projectId: study,
      title: "Finish the RLS notes",
      priority: "high",
      status: "in_progress",
      dueAt: dueIn(2),
    });
    await createTask(jonas, jonasPersonal.id, {
      projectId: study,
      title: "Practice the sync walkthrough",
      priority: "medium",
      status: "open",
      dueAt: dueIn(6),
    });
    await createTask(jonas, jonasPersonal.id, {
      projectId: study,
      title: "Park the abandoned sketch",
      priority: "none",
      status: "cancelled",
    });
  }

  console.log("Seeded Mira Vell and Jonas Reid.");
  console.log("Password for both accounts: atrium-demo-12");
  await closeDb();
}

void main();
