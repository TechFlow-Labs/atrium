import { redirect } from "next/navigation";

/** Deep links under /issues resolve to the existing task detail route. */
export default async function IssueDetailRedirectPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  redirect(`/tasks/${taskId}`);
}
