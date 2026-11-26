import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { homeFeed, searchWorkspace } from "../home/service";
import { createNativeProject, getProject, listProjects } from "../projects/service";
import { addTaskComment, listTaskComments } from "../tasks/comments";
import { createTask, getTask, listTasks, updateTask } from "../tasks/service";
import { listWorkspaces } from "../workspaces/service";
import { mcpAuthExtra, requireMcpScope, resolveWorkspaceId } from "./auth";

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown MCP error";
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

const statusSchema = z.enum(["open", "todo", "in_progress", "blocked", "done", "cancelled"]);
const prioritySchema = z.enum(["none", "low", "medium", "high", "urgent"]);

export function registerAtriumMcpTools(server: McpServer) {
  server.registerTool(
    "list_workspaces",
    {
      title: "List workspaces",
      description: "List Atrium workspaces the authenticated user can access.",
      inputSchema: z.object({}),
    },
    async (_args, ctx) => {
      try {
        const auth = mcpAuthExtra(ctx.http?.authInfo);
        requireMcpScope(auth, "read");
        const workspaces = await listWorkspaces(auth.userId);
        const filtered = auth.workspaceId
          ? workspaces.filter((workspace) => workspace.id === auth.workspaceId)
          : workspaces;
        return textResult({ workspaces: filtered });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List projects in a workspace. Native projects are canonical; external ones mirror a provider.",
      inputSchema: z.object({
        workspaceId: z.string().uuid().optional().describe("Required unless the token is locked to one workspace"),
        status: z.enum(["active", "archived", "all"]).optional().default("active"),
        query: z.string().optional(),
      }),
    },
    async (args, ctx) => {
      try {
        const auth = mcpAuthExtra(ctx.http?.authInfo);
        requireMcpScope(auth, "read");
        const workspaceId = resolveWorkspaceId(auth, args.workspaceId);
        const projects = await listProjects(auth.userId, workspaceId, {
          status: args.status,
          query: args.query,
        });
        return textResult({ workspaceId, projects });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "create_project",
    {
      title: "Create native project",
      description: "Create a native Atrium project in a workspace.",
      inputSchema: z.object({
        workspaceId: z.string().uuid().optional(),
        name: z.string().min(2).max(120),
        description: z.string().max(4000).optional(),
      }),
    },
    async (args, ctx) => {
      try {
        const auth = mcpAuthExtra(ctx.http?.authInfo);
        requireMcpScope(auth, "write");
        const workspaceId = resolveWorkspaceId(auth, args.workspaceId);
        const id = await createNativeProject(auth.userId, workspaceId, {
          name: args.name,
          description: args.description,
        });
        const project = await getProject(auth.userId, workspaceId, id);
        return textResult({ project });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description: "List tasks in a workspace with optional filters.",
      inputSchema: z.object({
        workspaceId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        status: z.string().optional().describe("Comma-separated statuses, or attention for urgent/high"),
        assignee: z.string().optional().describe("Assignee user id, or unassigned"),
        priority: z.string().optional(),
        query: z.string().optional(),
        dueBefore: z.string().optional(),
        dueAfter: z.string().optional(),
      }),
    },
    async (args, ctx) => {
      try {
        const auth = mcpAuthExtra(ctx.http?.authInfo);
        requireMcpScope(auth, "read");
        const workspaceId = resolveWorkspaceId(auth, args.workspaceId);
        const tasks = await listTasks(auth.userId, workspaceId, {
          projectId: args.projectId,
          status: args.status,
          assignee: args.assignee,
          priority: args.priority,
          query: args.query,
          dueBefore: args.dueBefore,
          dueAfter: args.dueAfter,
        });
        return textResult({
          workspaceId,
          count: tasks.length,
          tasks: tasks.slice(0, 100),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_task",
    {
      title: "Get task",
      description: "Fetch one task by id.",
      inputSchema: z.object({
        taskId: z.string().uuid(),
      }),
    },
    async (args, ctx) => {
      try {
        const auth = mcpAuthExtra(ctx.http?.authInfo);
        requireMcpScope(auth, "read");
        const task = await getTask(auth.userId, args.taskId);
        if (!task) return errorResult(new Error("Task not found"));
        if (auth.workspaceId && task.workspace_id !== auth.workspaceId) {
          return errorResult(new Error("Task is outside this token's workspace"));
        }
        return textResult({ task });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "create_task",
    {
      title: "Create task",
      description: "Create a task in a project.",
      inputSchema: z.object({
        workspaceId: z.string().uuid().optional(),
        projectId: z.string().uuid(),
        title: z.string().min(1).max(200),
        description: z.string().max(20_000).optional(),
        status: statusSchema.optional(),
        priority: prioritySchema.optional(),
        dueAt: z.string().nullable().optional(),
      }),
    },
    async (args, ctx) => {
      try {
        const auth = mcpAuthExtra(ctx.http?.authInfo);
        requireMcpScope(auth, "write");
        const workspaceId = resolveWorkspaceId(auth, args.workspaceId);
        const id = await createTask(auth.userId, workspaceId, {
          projectId: args.projectId,
          title: args.title,
          description: args.description,
          status: args.status,
          priority: args.priority,
          dueAt: args.dueAt,
        });
        const task = await getTask(auth.userId, id);
        return textResult({ task });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "update_task",
    {
      title: "Update task",
      description: "Update fields on an existing task. Pass the current version for optimistic concurrency.",
      inputSchema: z.object({
        workspaceId: z.string().uuid().optional(),
        taskId: z.string().uuid(),
        version: z.number().int().nonnegative(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(20_000).optional(),
        status: statusSchema.optional(),
        priority: prioritySchema.optional(),
        dueAt: z.string().nullable().optional(),
        assigneeUserId: z.string().nullable().optional().describe("Workspace member id, or null to unassign"),
      }),
    },
    async (args, ctx) => {
      try {
        const auth = mcpAuthExtra(ctx.http?.authInfo);
        requireMcpScope(auth, "write");
        const existing = await getTask(auth.userId, args.taskId);
        if (!existing) return errorResult(new Error("Task not found"));
        const workspaceId = resolveWorkspaceId(auth, args.workspaceId ?? existing.workspace_id);
        if (existing.workspace_id !== workspaceId) {
          return errorResult(new Error("Task is outside the requested workspace"));
        }
        await updateTask(auth.userId, workspaceId, args.taskId, {
          version: args.version,
          title: args.title,
          description: args.description,
          status: args.status,
          priority: args.priority,
          dueAt: args.dueAt,
          assigneeUserId: args.assigneeUserId,
          projectId: existing.project_id,
        });
        const task = await getTask(auth.userId, args.taskId);
        return textResult({ task });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "search_workspace",
    {
      title: "Search workspace",
      description: "Search projects and tasks in a workspace by text.",
      inputSchema: z.object({
        workspaceId: z.string().uuid().optional(),
        query: z.string().min(2).max(200),
      }),
    },
    async (args, ctx) => {
      try {
        const auth = mcpAuthExtra(ctx.http?.authInfo);
        requireMcpScope(auth, "read");
        const workspaceId = resolveWorkspaceId(auth, args.workspaceId);
        const results = await searchWorkspace(auth.userId, workspaceId, args.query);
        return textResult({ workspaceId, ...results });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "workspace_overview",
    {
      title: "Workspace overview",
      description: "Return dashboard stats and attention lists for a workspace.",
      inputSchema: z.object({
        workspaceId: z.string().uuid().optional(),
        source: z.string().optional().describe("Optional source filter: atrium, linear, jira, github, gitlab, gitea"),
      }),
    },
    async (args, ctx) => {
      try {
        const auth = mcpAuthExtra(ctx.http?.authInfo);
        requireMcpScope(auth, "read");
        const workspaceId = resolveWorkspaceId(auth, args.workspaceId);
        const feed = await homeFeed(auth.userId, workspaceId, Date.now(), args.source);
        return textResult({
          workspaceId,
          stats: feed.stats,
          priorities: feed.priorities,
          dueSoon: feed.dueSoon,
          blocked: feed.blocked,
          health: feed.health,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "list_comments",
    {
      title: "List comments",
      description: "List Activity comments on one task.",
      inputSchema: z.object({
        taskId: z.string().uuid(),
      }),
    },
    async (args, ctx) => {
      try {
        const auth = mcpAuthExtra(ctx.http?.authInfo);
        requireMcpScope(auth, "read");
        const bundle = await listTaskComments(auth.userId, args.taskId);
        if (!bundle) return errorResult(new Error("Task not found"));
        if (auth.workspaceId) {
          const task = await getTask(auth.userId, args.taskId);
          if (task && task.workspace_id !== auth.workspaceId) {
            return errorResult(new Error("Task is outside this token's workspace"));
          }
        }
        return textResult({
          source: bundle.source,
          comments: bundle.comments.map((comment) => ({
            id: comment.id,
            body: comment.body,
            author: comment.authorLabel,
            createdAt: comment.createdAt,
          })),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "add_comment",
    {
      title: "Add comment",
      description: "Post an Activity comment on a task. The comment is authored as the token's user.",
      inputSchema: z.object({
        taskId: z.string().uuid(),
        body: z.string().min(1).max(10_000),
      }),
    },
    async (args, ctx) => {
      try {
        const auth = mcpAuthExtra(ctx.http?.authInfo);
        requireMcpScope(auth, "write");
        if (auth.workspaceId) {
          const task = await getTask(auth.userId, args.taskId);
          if (!task) return errorResult(new Error("Task not found"));
          if (task.workspace_id !== auth.workspaceId) {
            return errorResult(new Error("Task is outside this token's workspace"));
          }
        }
        await addTaskComment(auth.userId, args.taskId, args.body);
        return textResult({ ok: true });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
