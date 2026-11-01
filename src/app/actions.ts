"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getAuth } from "@/server/auth/auth";
import { readSmtpConfig } from "@/server/auth/mail";
import { logError } from "@/server/log";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { allowRequest } from "@/server/rate-limit";
import {
  ensurePersonalWorkspace,
  createWorkspace,
  createWorkspaceContext,
  deleteWorkspaceContext,
  inviteMember,
  acceptInvitation,
  listWorkspaces,
  setMemberRole,
  removeMember,
  updateWorkspace,
  updateWorkspaceKind,
} from "@/server/workspaces/service";
import {
  archiveProject,
  createMilestone,
  createNativeProject,
  deleteProject,
  listProjects,
  updateProject,
} from "@/server/projects/service";
import { addTaskComment } from "@/server/tasks/comments";
import { addTaskLink, removeTaskLink, searchTasksForLink } from "@/server/tasks/links";
import { bulkUpdateTasks, createTask, deleteTasks, transferTasks, updateTask } from "@/server/tasks/service";
import {
  addFakeRemoteProject,
  beginOAuth,
  connectWithToken,
  createExternalProject,
  disconnectIntegration,
  ensureExternalProjectForTask,
  listIntegrationShareTargets,
  listRemoteProjects,
  resolveConflict,
  retryDead,
  setNativePublishing,
  shareIntegrationToWorkspace,
  testIntegration,
  updateFieldMappings,
} from "@/server/integrations/service";
import { writeAudit } from "@/server/audit";
import { withUser } from "@/server/db/client";
import { sql } from "drizzle-orm";
import type { ProviderId } from "@/server/integrations/types";
import { parseMotionEnabled } from "@/lib/apply-theme";
import { resolveGuide } from "@/lib/screen-guides";
import { saveProfilePreferences, setOnboardingPending } from "@/server/onboarding/service";
import { OAUTH_PROVIDERS } from "@/lib/oauth-providers";
import {
  deleteOAuthApp,
  saveOAuthApp,
  shareOAuthAppToWorkspace,
} from "@/server/integrations/oauth-apps";
import { markGuideSeen } from "@/server/guides/service";
import { parseProjectsLayout, type ProjectsLayout } from "@/lib/projects-layout";
import { parseColorPalette, parseThemeMode } from "@/lib/theme";
import { createMcpToken, revokeMcpToken } from "@/server/mcp/tokens";
import { createWorkspaceNote } from "@/server/notes/workspace-notes";
import {
  DEV_MOCKS_COOKIE,
  ensureDevMockData,
  isLocalDev,
  parseDevMocksVisible,
  reseedDevMockData,
} from "@/server/dev/mock-data";

export type ActionState = { error?: string; notice?: string; token?: string; version?: number; noteId?: string };

async function userId(): Promise<string> {
  const user = await getSessionUser();
  if (!user) throw new Error("Sign in to continue");
  return user.id;
}

async function clientKey(): Promise<string> {
  const headerStore = await headers();
  return headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

const password = z.string().min(12, "Use at least 12 characters").regex(/[a-zA-Z]/, "Include a letter").regex(/[0-9]/, "Include a number");

export async function registerAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
    email: z.string().trim().email("Enter a valid email"),
    password,
  }).safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  if (!(await allowRequest(`auth:${await clientKey()}`, 10, 15 * 60 * 1000))) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }
  const rememberMe = formData.get("rememberMe") === "on" || formData.get("rememberMe") === "true";
  let newUserId: string;
  try {
    const signUp = await getAuth().api.signUpEmail({
      body: { ...parsed.data, rememberMe },
      headers: await headers(),
    });
    newUserId = signUp.user.id;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create the account" };
  }
  // The session cookie is not readable in this request, so use the new id.
  await setOnboardingPending(newUserId, true);
  const user = await getSessionUser();
  if (user) await ensurePersonalWorkspace(user.id, user.name);
  redirect("/onboarding");
}

export async function loginAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const secret = String(formData.get("password") ?? "");
  const rememberMe = formData.get("rememberMe") === "on" || formData.get("rememberMe") === "true";
  if (!(await allowRequest(`auth:${await clientKey()}`, 10, 15 * 60 * 1000))) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }
  try {
    await getAuth().api.signInEmail({
      body: { email, password: secret, rememberMe },
      headers: await headers(),
    });
  } catch {
    return { error: "Email or password is incorrect" };
  }
  const user = await getSessionUser();
  if (user) {
    await ensurePersonalWorkspace(user.id, user.name);
    await withUser(user.id, (tx) => writeAudit(tx, { workspaceId: null, action: "auth.signed_in", entityType: "user", entityId: user.id }));
  }
  redirect("/home");
}

const resetNotice = "If an account exists for that email, a reset link is on its way. It expires in one hour.";

export async function requestPasswordResetAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!z.string().email().safeParse(email).success) return { error: "Enter a valid email" };
  if (!(await allowRequest(`reset:${await clientKey()}`, 5, 15 * 60 * 1000))) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }
  if (!readSmtpConfig() && process.env.NODE_ENV === "production") {
    return { error: "Password reset email is not set up on this server." };
  }
  try {
    await getAuth().api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
      headers: await headers(),
    });
  } catch (error) {
    logError("password reset request failed", { error: error instanceof Error ? error.message : "request failed" });
  }
  return { notice: resetNotice };
}

export async function resetPasswordAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const parsed = password.safeParse(next);
  if (!token) return { error: "This reset link is invalid. Request a new one." };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the password" };
  if (next !== confirm) return { error: "The passwords do not match" };
  if (!(await allowRequest(`reset-finish:${await clientKey()}`, 10, 15 * 60 * 1000))) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }
  try {
    await getAuth().api.resetPassword({
      body: { newPassword: next, token },
      headers: await headers(),
    });
  } catch {
    return { error: "This reset link is invalid or has expired. Request a new one." };
  }
  redirect("/login?reset=1");
}

export async function saveWorkspaceNoteAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await getSessionUser();
    if (!user) return { error: "Sign in to continue" };
    const { current } = await workspaceContext(user.id);
    const noteId = await createWorkspaceNote(user.id, current.id, {
      title: String(formData.get("title") ?? ""),
      body: String(formData.get("body") ?? ""),
    });
    revalidatePath("/notes");
    return { notice: "Saved to Notes", noteId };
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not save the note" };
  }
}

export async function logoutAction(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
}

export async function switchWorkspaceAction(formData: FormData): Promise<void> {
  const id = String(formData.get("workspaceId") ?? "");
  const user = await userId();
  const { listWorkspaces } = await import("@/server/workspaces/service");
  const workspaces = await listWorkspaces(user);
  if (!workspaces.some((workspace) => workspace.id === id)) throw new Error("Workspace not found");
  (await cookies()).set("atrium_workspace", id, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  redirect("/home");
}

export async function createWorkspaceAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const id = await createWorkspace(await userId(), {
      name: String(formData.get("name") ?? ""),
      kind: String(formData.get("kind") ?? "work"),
      icon: String(formData.get("icon") ?? ""),
    });
    (await cookies()).set("atrium_workspace", id, { httpOnly: true, sameSite: "lax", path: "/" });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not create the workspace" };
  }
  redirect("/workspaces");
}

export async function updateWorkspaceAction(formData: FormData): Promise<void> {
  await updateWorkspace(await userId(), String(formData.get("workspaceId")), {
    name: String(formData.get("name") ?? ""),
    kind: String(formData.get("kind") ?? "work"),
    icon: String(formData.get("icon") ?? ""),
  });
  redirect("/workspaces");
}

export async function updateWorkspaceKindAction(formData: FormData): Promise<void> {
  await updateWorkspaceKind(
    await userId(),
    String(formData.get("workspaceId")),
    String(formData.get("kind") ?? "work"),
  );
  revalidatePath("/workspaces");
  revalidatePath("/", "layout");
}

export async function createWorkspaceContextAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await createWorkspaceContext(await userId(), {
      label: String(formData.get("label") ?? ""),
      icon: String(formData.get("icon") ?? ""),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create the context" };
  }
  revalidatePath("/workspaces");
  revalidatePath("/", "layout");
  return { notice: "Context added" };
}

export async function deleteWorkspaceContextAction(formData: FormData): Promise<void> {
  await deleteWorkspaceContext(await userId(), String(formData.get("contextId")));
  revalidatePath("/workspaces");
  revalidatePath("/", "layout");
}

export async function inviteAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const result = await inviteMember(await userId(), String(formData.get("workspaceId")), {
      email: String(formData.get("email") ?? ""),
      role: String(formData.get("role") ?? "member") as "admin" | "member" | "viewer",
    });
    return { notice: "Invitation created. Share this link once. It is not stored in readable form.", token: result.token };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not invite" };
  }
}

export async function acceptInviteAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const workspaceId = await acceptInvitation(await userId(), String(formData.get("token") ?? ""));
    (await cookies()).set("atrium_workspace", workspaceId, { httpOnly: true, sameSite: "lax", path: "/" });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Invitation could not be accepted" };
  }
  redirect("/home");
}

export async function roleAction(formData: FormData): Promise<void> {
  await setMemberRole(
    await userId(),
    String(formData.get("workspaceId")),
    String(formData.get("memberId")),
    String(formData.get("role")) as "owner" | "admin" | "member" | "viewer",
  );
  redirect("/workspaces");
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  await removeMember(await userId(), String(formData.get("workspaceId")), String(formData.get("memberId")));
  redirect("/workspaces");
}

export async function createProjectAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await createNativeProject(await userId(), String(formData.get("workspaceId")), {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
    });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not create the project" };
  }
  redirect("/projects");
}

export async function updateProjectAction(formData: FormData): Promise<void> {
  const returnTo = String(formData.get("returnTo") ?? "").trim();
  const projectId = String(formData.get("projectId"));
  await updateProject(await userId(), String(formData.get("workspaceId")), projectId, {
    name: formData.has("name") ? String(formData.get("name") ?? "") : undefined,
    nickname: formData.has("nickname") ? String(formData.get("nickname") ?? "") : undefined,
    description: formData.has("description") ? String(formData.get("description") ?? "") : undefined,
  });
  redirect(returnTo || `/projects/${projectId}`);
}

export async function archiveProjectAction(formData: FormData): Promise<void> {
  await archiveProject(
    await userId(),
    String(formData.get("workspaceId")),
    String(formData.get("projectId")),
    formData.get("archived") === "true",
  );
  redirect("/projects");
}

export async function deleteProjectAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  try {
    await deleteProject(await userId(), workspaceId, projectId);
    revalidatePath("/projects");
    revalidatePath("/home");
    revalidatePath("/tasks");
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not delete the project" };
  }
  redirect("/projects");
}

export async function createMilestoneAction(formData: FormData): Promise<void> {
  await createMilestone(await userId(), String(formData.get("workspaceId")), String(formData.get("projectId")), {
    name: String(formData.get("name") ?? ""),
    dueAt: String(formData.get("dueAt") ?? "") || null,
  });
  redirect(`/projects/${formData.get("projectId")}`);
}

export async function createTaskAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const uid = await userId();
    const workspaceId = String(formData.get("workspaceId"));
    const destination = String(formData.get("destination") ?? "atrium");
    let projectId = String(formData.get("projectId") ?? "");
    if (destination === "provider") {
      projectId = await ensureExternalProjectForTask(uid, workspaceId, {
        integrationId: String(formData.get("integrationId") ?? ""),
        providerProjectId: String(formData.get("providerProjectId") ?? ""),
        name: String(formData.get("providerProjectName") ?? ""),
        key: String(formData.get("providerProjectKey") ?? "") || null,
        url: String(formData.get("providerProjectUrl") ?? "") || null,
      });
    }
    if (!projectId) {
      return { error: destination === "provider" ? "Choose a provider project" : "Choose a project" };
    }
    await createTask(uid, workspaceId, {
      projectId,
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      status: (String(formData.get("status") ?? "open") || "open") as "open",
      priority: (String(formData.get("priority") ?? "medium") || "medium") as "medium",
      dueAt: String(formData.get("dueAt") ?? "") || null,
      assigneeUserId: String(formData.get("assigneeUserId") ?? "") || null,
    });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not create the task" };
  }
  redirect(String(formData.get("returnTo") ?? "/tasks"));
}

export async function listRemoteProjectsForCreateAction(
  workspaceId: string,
  integrationId: string,
): Promise<{ projects: Array<{ providerId: string; name: string; key: string | null; url: string | null }> } | { error: string }> {
  try {
    const projects = await listRemoteProjects(await userId(), workspaceId, integrationId);
    return {
      projects: projects.map((project) => ({
        providerId: project.providerId,
        name: project.name,
        key: project.key,
        url: project.url,
      })),
    };
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not load provider projects" };
  }
}

export async function updateTaskAction(formData: FormData): Promise<void> {
  await updateTask(await userId(), String(formData.get("workspaceId")), String(formData.get("taskId")), {
    version: Number(formData.get("version")),
    title: formData.has("title") ? String(formData.get("title")) : undefined,
    description: formData.has("description") ? String(formData.get("description")) : undefined,
    status: formData.get("status") ? (String(formData.get("status")) as "open") : undefined,
    priority: formData.get("priority") ? (String(formData.get("priority")) as "medium") : undefined,
    dueAt: formData.has("dueAt") ? String(formData.get("dueAt") ?? "") || null : undefined,
    assigneeUserId: formData.has("assigneeUserId") ? String(formData.get("assigneeUserId") ?? "") || null : undefined,
  });
  const returnTo = String(formData.get("returnTo") ?? "/tasks");
  if (String(formData.get("silent") ?? "") === "1") {
    revalidatePath("/tasks");
    revalidatePath(returnTo);
    return;
  }
  redirect(returnTo);
}

export async function updateTaskDetailAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const taskId = String(formData.get("taskId") ?? "");
  const version = Number(formData.get("version"));
  try {
    await updateTask(await userId(), String(formData.get("workspaceId")), taskId, {
      version,
      title: formData.has("title") ? String(formData.get("title")) : undefined,
      description: formData.has("description") ? String(formData.get("description")) : undefined,
      status: formData.get("status") ? (String(formData.get("status")) as "open") : undefined,
      priority: formData.get("priority") ? (String(formData.get("priority")) as "medium") : undefined,
      dueAt: formData.has("dueAt") ? String(formData.get("dueAt") ?? "") || null : undefined,
      assigneeUserId: formData.has("assigneeUserId") ? String(formData.get("assigneeUserId") ?? "") || null : undefined,
    });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not update the task" };
  }
  const silent = String(formData.get("silent") ?? "") === "1";
  if (silent) {
    revalidatePath(`/tasks/${taskId}`);
    return { notice: "Saved", version: version + 1 };
  }
  redirect(String(formData.get("returnTo") ?? `/tasks/${taskId}`));
}

export async function addTaskCommentAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const taskId = String(formData.get("taskId") ?? "");
  try {
    await addTaskComment(await userId(), taskId, String(formData.get("body") ?? ""));
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not add the comment" };
  }
  redirect(String(formData.get("returnTo") ?? `/tasks/${taskId}`));
}

export async function addTaskLinkAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const taskId = String(formData.get("taskId") ?? "");
  try {
    await addTaskLink(await userId(), String(formData.get("workspaceId")), {
      fromTaskId: taskId,
      toTaskId: String(formData.get("toTaskId") ?? ""),
      linkType: String(formData.get("linkType") ?? ""),
    });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not link the tasks" };
  }
  revalidatePath(`/tasks/${taskId}`);
  const relatedId = String(formData.get("toTaskId") ?? "");
  if (relatedId) revalidatePath(`/tasks/${relatedId}`);
  redirect(String(formData.get("returnTo") ?? `/tasks/${taskId}`));
}

export async function removeTaskLinkAction(formData: FormData): Promise<void> {
  const taskId = String(formData.get("taskId") ?? "");
  const relatedTaskId = String(formData.get("relatedTaskId") ?? "");
  await removeTaskLink(await userId(), String(formData.get("workspaceId")), String(formData.get("linkId")));
  revalidatePath(`/tasks/${taskId}`);
  if (relatedTaskId) revalidatePath(`/tasks/${relatedTaskId}`);
  redirect(String(formData.get("returnTo") ?? `/tasks/${taskId}`));
}

export async function searchTasksForLinkAction(
  workspaceId: string,
  excludeTaskId: string,
  query: string,
): Promise<{ tasks: Array<{ id: string; title: string; status: string; priority: string; provider: string | null; projectName: string }> } | { error: string }> {
  try {
    const tasks = await searchTasksForLink(await userId(), workspaceId, { query, excludeTaskId });
    return { tasks };
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not search tasks" };
  }
}

export async function bulkTaskAction(formData: FormData): Promise<void> {
  const ids = formData.getAll("ids").map(String);
  await bulkUpdateTasks(await userId(), String(formData.get("workspaceId")), {
    ids,
    status: formData.get("status") ? (String(formData.get("status")) as "done") : undefined,
    priority: formData.get("priority") ? (String(formData.get("priority")) as "high") : undefined,
  });
  redirect("/tasks");
}

export async function deleteTasksAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const alsoRemote = formData.get("alsoRemote") === "on" || formData.get("alsoRemote") === "true";
  const returnTo = String(formData.get("returnTo") ?? "/tasks");
  try {
    await deleteTasks(await userId(), workspaceId, { ids, alsoRemote });
    revalidatePath("/tasks");
    revalidatePath("/home");
    for (const id of ids) revalidatePath(`/tasks/${id}`);
    redirect(returnTo.startsWith("/") ? returnTo : "/tasks");
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not delete the tasks" };
  }
}

export async function listTransferDestinationsAction(
  sourceWorkspaceId: string,
): Promise<
  | { workspaces: Array<{ id: string; name: string; kind: string }> }
  | { error: string }
> {
  try {
    const user = await userId();
    const workspaces = await listWorkspaces(user);
    return {
      workspaces: workspaces
        .filter((workspace) => workspace.id !== sourceWorkspaceId && workspace.role !== "viewer")
        .map((workspace) => ({ id: workspace.id, name: workspace.name, kind: workspace.kind })),
    };
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not load workspaces" };
  }
}

export async function listTransferProjectsAction(
  destinationWorkspaceId: string,
): Promise<{ projects: Array<{ id: string; name: string }> } | { error: string }> {
  try {
    const user = await userId();
    const projects = await listProjects(user, destinationWorkspaceId, { status: "active" });
    return {
      projects: projects.map((project) => ({
        id: project.id,
        name: project.nickname?.trim() || project.name,
      })),
    };
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not load projects" };
  }
}

export async function transferTasksAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sourceWorkspaceId = String(formData.get("workspaceId") ?? "");
  const destinationWorkspaceId = String(formData.get("destinationWorkspaceId") ?? "");
  const destinationProjectId = String(formData.get("destinationProjectId") ?? "");
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  try {
    const result = await transferTasks(await userId(), sourceWorkspaceId, {
      ids,
      destinationWorkspaceId,
      destinationProjectId,
    });
    (await cookies()).set("atrium_workspace", destinationWorkspaceId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
    revalidatePath("/tasks");
    if (result.transferred.length === 1) {
      redirect(`/tasks/${result.transferred[0].toId}`);
    }
    redirect("/tasks");
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not transfer the tasks" };
  }
}

export async function connectTokenAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const provider = String(formData.get("provider"));
  try {
    await connectWithToken(await userId(), String(formData.get("workspaceId")), {
      provider,
      displayName: String(formData.get("displayName") ?? ""),
      accessToken: String(formData.get("accessToken") ?? ""),
      webhookSecret: String(formData.get("webhookSecret") ?? ""),
      cloudId: String(formData.get("cloudId") ?? ""),
      siteUrl: String(formData.get("siteUrl") ?? ""),
    });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not connect" };
  }
  redirect(provider === "slack" ? "/chats" : provider === "obsidian" ? "/notes" : "/integrations");
}

export async function disconnectAction(formData: FormData): Promise<void> {
  await disconnectIntegration(await userId(), String(formData.get("workspaceId")), String(formData.get("integrationId")));
  redirect("/integrations");
}

export async function testConnectionAction(formData: FormData): Promise<void> {
  await testIntegration(await userId(), String(formData.get("workspaceId")), String(formData.get("integrationId")));
  redirect(`/integrations/${formData.get("integrationId")}`);
}

export async function oauthStartAction(formData: FormData): Promise<void> {
  try {
    const url = await beginOAuth(
      await userId(),
      String(formData.get("workspaceId")),
      String(formData.get("provider")) as Exclude<ProviderId, "fake">,
    );
    redirect(url);
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : "Could not start OAuth";
    redirect(`/integrations?error=${encodeURIComponent(message)}`);
  }
}

export async function linkProjectAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    id = await createExternalProject(await userId(), String(formData.get("workspaceId")), {
      integrationId: String(formData.get("integrationId")),
      providerProjectId: String(formData.get("providerProjectId")),
      name: String(formData.get("name") ?? ""),
      key: String(formData.get("key") ?? "") || null,
      url: String(formData.get("url") ?? "") || null,
    });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not link the project" };
  }
  redirect(`/projects/${id}`);
}

export async function mappingAction(formData: FormData): Promise<void> {
  const mappings = {
    status: {
      open: String(formData.get("status_open") ?? ""),
      in_progress: String(formData.get("status_in_progress") ?? ""),
      blocked: String(formData.get("status_blocked") ?? ""),
      done: String(formData.get("status_done") ?? ""),
      cancelled: String(formData.get("status_cancelled") ?? ""),
    },
    priority: {
      none: String(formData.get("priority_none") ?? ""),
      low: String(formData.get("priority_low") ?? ""),
      medium: String(formData.get("priority_medium") ?? ""),
      high: String(formData.get("priority_high") ?? ""),
      urgent: String(formData.get("priority_urgent") ?? ""),
    },
  };
  await updateFieldMappings(await userId(), String(formData.get("workspaceId")), String(formData.get("projectId")), mappings);
  redirect(`/projects/${formData.get("projectId")}`);
}

export async function publishAction(formData: FormData): Promise<void> {
  await setNativePublishing(
    await userId(),
    String(formData.get("workspaceId")),
    String(formData.get("projectId")),
    formData.get("enabled") === "true",
  );
  redirect(`/projects/${formData.get("projectId")}`);
}

export async function fakeProjectAction(formData: FormData): Promise<void> {
  await addFakeRemoteProject(
    await userId(),
    String(formData.get("workspaceId")),
    String(formData.get("integrationId")),
    String(formData.get("name") ?? "Demo project"),
  );
  redirect(`/integrations/${formData.get("integrationId")}`);
}

export async function retryAction(formData: FormData): Promise<void> {
  await retryDead(await userId(), String(formData.get("workspaceId")), formData.get("kind") === "job" ? "job" : "outbox", String(formData.get("id")));
  redirect("/sync");
}

export async function resolveAction(formData: FormData): Promise<void> {
  const resolution = formData.get("resolution") === "keep_remote" ? "keep_remote" : "keep_local";
  await resolveConflict(await userId(), String(formData.get("workspaceId")), String(formData.get("conflictId")), resolution);
  redirect("/sync");
}

export async function settingsAction(formData: FormData): Promise<void> {
  const user = await userId();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length >= 2) {
    await getAuth().api.updateUser({ body: { name }, headers: await headers() });
  }
  const theme = parseThemeMode(String(formData.get("theme") ?? "light"));
  const palette = parseColorPalette(String(formData.get("palette") ?? "grove"));
  const jar = await cookies();
  jar.set("atrium_theme", theme, { path: "/", sameSite: "lax" });
  jar.set("atrium_palette", palette, { path: "/", sameSite: "lax" });
  await withUser(user, async (tx) => {
    await tx.execute(sql`
      insert into user_preferences (user_id, timezone, theme, palette, notify_sync_errors, notify_assignments)
      values (
        current_setting('app.current_user_id', true),
        ${String(formData.get("timezone") ?? "UTC")},
        ${theme},
        ${palette},
        ${formData.get("notifySync") === "on"},
        ${formData.get("notifyAssignments") === "on"}
      )
      on conflict (user_id) do update set
        timezone = excluded.timezone,
        theme = excluded.theme,
        palette = excluded.palette,
        notify_sync_errors = excluded.notify_sync_errors,
        notify_assignments = excluded.notify_assignments,
        updated_at = now()
    `);
  });
  redirect("/settings");
}

export async function motionAction(formData: FormData): Promise<void> {
  const user = await userId();
  const enabled = parseMotionEnabled(String(formData.get("animationsEnabled") ?? "on"));
  (await cookies()).set("atrium_motion", enabled ? "on" : "off", { path: "/", sameSite: "lax" });
  await withUser(user, async (tx) => {
    await tx.execute(sql`
      insert into user_preferences (user_id, timezone, theme, palette, notify_sync_errors, notify_assignments, animations_enabled)
      values (
        current_setting('app.current_user_id', true),
        'UTC',
        'light',
        'grove',
        true,
        true,
        ${enabled}
      )
      on conflict (user_id) do update set
        animations_enabled = excluded.animations_enabled,
        updated_at = now()
    `);
  });
  revalidatePath("/", "layout");
}

export async function providerTileStylesAction(formData: FormData): Promise<void> {
  const user = await userId();
  const enabled = parseMotionEnabled(String(formData.get("providerTileStyles") ?? "on"));
  (await cookies()).set("atrium_provider_tiles", enabled ? "on" : "off", { path: "/", sameSite: "lax" });
  await withUser(user, async (tx) => {
    await tx.execute(sql`
      insert into user_preferences (user_id, timezone, theme, palette, notify_sync_errors, notify_assignments, provider_tile_styles)
      values (
        current_setting('app.current_user_id', true),
        'UTC',
        'light',
        'grove',
        true,
        true,
        ${enabled}
      )
      on conflict (user_id) do update set
        provider_tile_styles = excluded.provider_tile_styles,
        updated_at = now()
    `);
  });
  revalidatePath("/", "layout");
}

export async function groupRelatedTasksAction(formData: FormData): Promise<void> {
  const user = await userId();
  const enabled = parseMotionEnabled(String(formData.get("groupRelatedTasks") ?? "on"));
  (await cookies()).set("atrium_group_related_tasks", enabled ? "on" : "off", { path: "/", sameSite: "lax" });
  await withUser(user, async (tx) => {
    await tx.execute(sql`
      insert into user_preferences (user_id, timezone, theme, palette, notify_sync_errors, notify_assignments, group_related_tasks)
      values (
        current_setting('app.current_user_id', true),
        'UTC',
        'light',
        'grove',
        true,
        true,
        ${enabled}
      )
      on conflict (user_id) do update set
        group_related_tasks = excluded.group_related_tasks,
        updated_at = now()
    `);
  });
  revalidatePath("/tasks");
  revalidatePath("/settings");
}

export async function themeAction(formData: FormData): Promise<void> {
  const user = await userId();
  const theme = parseThemeMode(String(formData.get("theme") ?? "light"));
  (await cookies()).set("atrium_theme", theme, { path: "/", sameSite: "lax" });
  await withUser(user, async (tx) => {
    await tx.execute(sql`
      insert into user_preferences (user_id, timezone, theme, palette, notify_sync_errors, notify_assignments)
      values (
        current_setting('app.current_user_id', true),
        'UTC',
        ${theme},
        'grove',
        true,
        true
      )
      on conflict (user_id) do update set
        theme = excluded.theme,
        updated_at = now()
    `);
  });
  revalidatePath("/", "layout");
}

export async function paletteAction(formData: FormData): Promise<void> {
  const user = await userId();
  const palette = parseColorPalette(String(formData.get("palette") ?? "grove"));
  (await cookies()).set("atrium_palette", palette, { path: "/", sameSite: "lax" });
  await withUser(user, async (tx) => {
    await tx.execute(sql`
      insert into user_preferences (user_id, timezone, theme, palette, notify_sync_errors, notify_assignments)
      values (
        current_setting('app.current_user_id', true),
        'UTC',
        'light',
        ${palette},
        true,
        true
      )
      on conflict (user_id) do update set
        palette = excluded.palette,
        updated_at = now()
    `);
  });
  revalidatePath("/", "layout");
}

export async function passwordAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = password.safeParse(String(formData.get("newPassword") ?? ""));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Choose a stronger password" };
  try {
    await getAuth().api.changePassword({
      body: {
        currentPassword: String(formData.get("currentPassword") ?? ""),
        newPassword: parsed.data,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not change the password" };
  }
  return { notice: "Password updated. Other sessions were signed out." };
}

export async function createMcpTokenAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const id = await userId();
  const key = await clientKey();
  if (!(await allowRequest(`mcp-create:${key}`, 10, 60_000))) {
    return { error: "Too many token requests. Wait a minute and try again." };
  }
  const scopes: string[] = [];
  if (formData.get("scope_read") === "on") scopes.push("read");
  if (formData.get("scope_write") === "on") scopes.push("write");
  const expiresRaw = String(formData.get("expiresInDays") ?? "").trim();
  const expiresInDays = expiresRaw ? Number(expiresRaw) : null;
  try {
    const created = await createMcpToken(id, {
      name: String(formData.get("name") ?? ""),
      workspaceId: String(formData.get("workspaceId") ?? "") || null,
      scopes,
      expiresInDays: Number.isFinite(expiresInDays) ? expiresInDays : null,
    });
    revalidatePath("/integrations");
    return { token: created.token, notice: "MCP token created." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create MCP token" };
  }
}

export async function revokeMcpTokenAction(formData: FormData): Promise<void> {
  const id = await userId();
  await revokeMcpToken(id, String(formData.get("tokenId") ?? ""));
  revalidatePath("/integrations");
}

const oauthAppForm = z.object({
  workspaceId: z.string().uuid(),
  provider: z.enum(OAUTH_PROVIDERS, { message: "Unknown provider" }),
});

export async function saveOAuthAppAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await userId();
  const parsed = oauthAppForm
    .extend({
      clientId: z.string().trim().min(1, "Enter the client ID").max(300),
      clientSecret: z.string().trim().max(500),
      siteUrl: z.string().trim().max(300),
    })
    .safeParse({
      workspaceId: formData.get("workspaceId"),
      provider: formData.get("provider"),
      clientId: formData.get("clientId"),
      clientSecret: formData.get("clientSecret") ?? "",
      siteUrl: formData.get("siteUrl") ?? "",
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  try {
    await saveOAuthApp(user, parsed.data.workspaceId, parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not save the OAuth app" };
  }
  revalidatePath("/integrations");
  return { notice: "Saved" };
}

// Saves the workspace's OAuth app, then sends the user to the provider. Used
// by the provider tile when no client ID or secret is configured yet.
export async function connectOAuthAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await userId();
  const parsed = oauthAppForm
    .extend({
      clientId: z.string().trim().min(1, "Enter the client ID").max(300),
      clientSecret: z.string().trim().min(1, "Enter the client secret").max(500),
      siteUrl: z.string().trim().max(300),
    })
    .safeParse({
      workspaceId: formData.get("workspaceId"),
      provider: formData.get("provider"),
      clientId: formData.get("clientId"),
      clientSecret: formData.get("clientSecret") ?? "",
      siteUrl: formData.get("siteUrl") ?? "",
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  let url: string;
  try {
    await saveOAuthApp(user, parsed.data.workspaceId, parsed.data);
    url = await beginOAuth(user, parsed.data.workspaceId, parsed.data.provider);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not start OAuth" };
  }
  redirect(url);
}

export async function deleteOAuthAppAction(formData: FormData): Promise<void> {
  const user = await userId();
  const parsed = oauthAppForm.parse({
    workspaceId: formData.get("workspaceId"),
    provider: formData.get("provider"),
  });
  await deleteOAuthApp(user, parsed.workspaceId, parsed.provider);
  revalidatePath("/integrations");
}

export async function listIntegrationShareTargetsAction(
  sourceWorkspaceId: string,
): Promise<{ workspaces: Array<{ id: string; name: string; kind: string }> } | { error: string }> {
  try {
    const workspaces = await listIntegrationShareTargets(await userId(), sourceWorkspaceId);
    return { workspaces };
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not load workspaces" };
  }
}

export async function shareIntegrationAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await shareIntegrationToWorkspace(
      await userId(),
      String(formData.get("workspaceId") ?? ""),
      String(formData.get("integrationId") ?? ""),
      String(formData.get("targetWorkspaceId") ?? ""),
    );
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not share the integration" };
  }
  revalidatePath("/integrations");
  return { notice: "Shared to the other workspace" };
}

export async function shareOAuthAppAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = oauthAppForm.safeParse({
    workspaceId: formData.get("workspaceId"),
    provider: formData.get("provider"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const targetWorkspaceId = String(formData.get("targetWorkspaceId") ?? "");
  try {
    await shareOAuthAppToWorkspace(
      await userId(),
      parsed.data.workspaceId,
      targetWorkspaceId,
      parsed.data.provider,
    );
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not share the OAuth app" };
  }
  revalidatePath("/integrations");
  return { notice: "OAuth app shared" };
}

// Onboarding actions return instead of redirecting, so the wizard can move
// between steps itself.
export async function onboardingProfileAction(formData: FormData): Promise<ActionState> {
  const user = await userId();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length > 0 && name.length < 2) return { error: "Name must be at least 2 characters" };
  const timezone = String(formData.get("timezone") ?? "").trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    return { error: "Enter a valid timezone, such as Europe/Athens or UTC" };
  }
  if (name.length >= 2) {
    await getAuth().api.updateUser({ body: { name }, headers: await headers() });
  }
  await saveProfilePreferences(user, {
    timezone,
    notifySync: formData.get("notifySync") === "on",
    notifyAssignments: formData.get("notifyAssignments") === "on",
  });
  return { notice: "Saved" };
}

export async function onboardingWorkspaceAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const id = await createWorkspace(await userId(), {
      name: String(formData.get("name") ?? ""),
      kind: "work",
      icon: "",
    });
    (await cookies()).set("atrium_workspace", id, { httpOnly: true, sameSite: "lax", path: "/" });
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not create the workspace" };
  }
  return { notice: "Workspace created" };
}

export async function completeOnboardingAction(): Promise<void> {
  const user = await userId();
  await setOnboardingPending(user, false);
  redirect("/home");
}

export async function markGuideSeenAction(guideId: string, version: number): Promise<void> {
  const user = await userId();
  // Only the current version of a known guide can be recorded.
  const guide = resolveGuide(guideId, version);
  if (!guide) return;
  await markGuideSeen(user, guide.id, guide.version);
}

export async function projectsLayoutAction(layout: ProjectsLayout): Promise<void> {
  const user = await userId();
  const next = parseProjectsLayout(layout);
  const encoded = encodeURIComponent(JSON.stringify(next));
  (await cookies()).set("atrium_projects_layout", encoded, { path: "/", sameSite: "lax", maxAge: 31536000 });
  await withUser(user, async (tx) => {
    await tx.execute(sql`
      insert into user_preferences (user_id, timezone, theme, palette, notify_sync_errors, notify_assignments, projects_layout)
      values (
        current_setting('app.current_user_id', true),
        'UTC',
        'light',
        'grove',
        true,
        true,
        ${JSON.stringify(next)}::jsonb
      )
      on conflict (user_id) do update set
        projects_layout = excluded.projects_layout,
        updated_at = now()
    `);
  });
  revalidatePath("/projects");
}

export async function setDevMocksVisibleAction(formData: FormData): Promise<void> {
  if (!isLocalDev()) throw new Error("Dev tools are only available on localhost");
  const user = await userId();
  const visible = parseDevMocksVisible(String(formData.get("visible") ?? "1"));
  (await cookies()).set(DEV_MOCKS_COOKIE, visible ? "1" : "0", { path: "/", sameSite: "lax" });
  if (visible) {
    const { current } = await workspaceContext(user);
    await ensureDevMockData(user, current.id);
  }
  revalidatePath("/", "layout");
}

export async function reseedDevMocksAction(): Promise<void> {
  if (!isLocalDev()) throw new Error("Dev tools are only available on localhost");
  const user = await userId();
  (await cookies()).set(DEV_MOCKS_COOKIE, "1", { path: "/", sameSite: "lax" });
  const { current } = await workspaceContext(user);
  await reseedDevMockData(user, current.id);
  revalidatePath("/", "layout");
}
