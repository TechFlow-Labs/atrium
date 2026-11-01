export const ROLES = ["owner", "admin", "member", "viewer"] as const;
export type WorkspaceRole = (typeof ROLES)[number];

export const ACTIONS = [
  "workspace.update",
  "workspace.delete",
  "member.invite",
  "member.invite_admin",
  "member.set_role",
  "member.remove",
  "project.create",
  "project.update",
  "project.archive",
  "project.delete",
  "milestone.write",
  "task.read",
  "task.write",
  "integration.manage",
  "sync.retry",
  "conflict.resolve",
  "audit.read",
] as const;

export type Action = (typeof ACTIONS)[number];

const MATRIX: Record<WorkspaceRole, ReadonlySet<Action>> = {
  owner: new Set(ACTIONS),
  admin: new Set([
    "workspace.update",
    "member.invite",
    "member.set_role",
    "member.remove",
    "project.create",
    "project.update",
    "project.archive",
    "project.delete",
    "milestone.write",
    "task.read",
    "task.write",
    "integration.manage",
    "sync.retry",
    "conflict.resolve",
    "audit.read",
  ]),
  member: new Set(["task.read", "task.write", "conflict.resolve"]),
  viewer: new Set(["task.read"]),
};

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function can(role: WorkspaceRole, action: Action): boolean {
  return MATRIX[role].has(action);
}

export function assertCan(role: WorkspaceRole, action: Action): void {
  if (!can(role, action)) {
    throw new AuthorizationError(`Unauthorized: ${role} cannot ${action}`);
  }
}

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return (ROLES as readonly string[]).includes(value);
}
