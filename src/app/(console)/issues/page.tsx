import { redirect } from "next/navigation";

/** Issues is the product name for the former Tasks surface; keep /tasks as the route implementation. */
export default async function IssuesRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value)) for (const item of value) query.append(key, item);
  }
  const suffix = query.toString();
  redirect(suffix ? `/tasks?${suffix}` : "/tasks");
}
