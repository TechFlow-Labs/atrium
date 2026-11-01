import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ScreenLoader } from "@/components/screen-loader";
import { OpenInProviderButton, ProviderIcon, providerLabel } from "@/components/provider-icon";
import { TaskComments } from "@/components/task-comments";
import { TaskDetailForm } from "@/components/task-detail-form";
import { TaskLinks } from "@/components/task-links";
import { TaskTransferDialog } from "@/components/task-transfer-dialog";
import { getSessionUser } from "@/server/auth/session";
import { workspaceContext } from "@/server/auth/workspace";
import { listTaskComments } from "@/server/tasks/comments";
import { listTaskLinks } from "@/server/tasks/links";
import { getTask } from "@/server/tasks/service";

export const instant = false;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  return (
    <Suspense fallback={<ScreenLoader />}>
      <TaskDetailContent params={params} />
    </Suspense>
  );
}

async function TaskDetailContent({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { taskId } = await params;
  if (!UUID_RE.test(taskId)) notFound();

  const { workspaces } = await workspaceContext(user.id);
  const [task, commentBundle, links] = await Promise.all([
    getTask(user.id, taskId),
    listTaskComments(user.id, taskId),
    listTaskLinks(user.id, taskId),
  ]);
  if (!task || !commentBundle || !links) notFound();

  const membership = workspaces.find((workspace) => workspace.id === task.workspace_id);
  const canWrite = membership ? membership.role !== "viewer" : false;
  const sourceLabel = providerLabel(task.provider);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-3">
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to tasks
          </Link>
          <div className="flex items-center gap-2">
            <ProviderIcon provider={task.provider} />
            <p className="text-xs text-muted">
              {sourceLabel}
              {task.external_url ? " · synced into Atrium" : " · native in Atrium"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? (
            <TaskTransferDialog
              workspaceId={task.workspace_id}
              taskIds={[task.id]}
              triggerLabel="Transfer"
            />
          ) : null}
          {task.external_url ? (
            <div data-tour="task-provider">
              <OpenInProviderButton provider={task.provider} href={task.external_url} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
        <div className="min-w-0 space-y-6">
          {task.sync_error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              Sync error: {task.sync_error}
            </p>
          ) : null}

          <div data-tour="task-form">
            <TaskDetailForm
              key={task.id}
              workspaceId={task.workspace_id}
              taskId={task.id}
              version={task.version}
              title={task.title}
              description={task.description}
              status={task.status}
              priority={task.priority}
              dueAt={task.due_at}
              projectId={task.project_id}
              projectName={task.project_name}
              assigneeLabel={task.assignee_label}
              updatedAt={task.updated_at}
              syncState={task.sync_state}
              canWrite={canWrite}
            />
          </div>
        </div>

        <aside className="min-w-0 space-y-5 rounded-lg border bg-card/40 p-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:p-5">
          <div data-tour="task-links">
            <TaskLinks
              workspaceId={task.workspace_id}
              taskId={task.id}
              links={links}
              canWrite={canWrite}
            />
          </div>
          <div data-tour="task-comments">
            <TaskComments
              taskId={task.id}
              comments={commentBundle.comments}
              source={commentBundle.source}
              canComment={commentBundle.canComment}
              canWrite={canWrite}
              unavailableReason={commentBundle.unavailableReason}
              currentUserName={user.name}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
