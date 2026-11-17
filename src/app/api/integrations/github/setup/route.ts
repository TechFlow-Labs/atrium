import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { completeGithubAppInstall } from "@/server/integrations/github-app";

export async function GET(request: Request) {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const setupAction = url.searchParams.get("setup_action")?.trim();
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    redirect(`/integrations?error=${encodeURIComponent(errorDescription ?? error)}`);
  }
  if (!installationId || !state) {
    redirect(`/integrations?error=${encodeURIComponent("GitHub App install did not return installation_id and state")}`);
  }
  if (setupAction === "request") {
    redirect(
      `/integrations?error=${encodeURIComponent("GitHub App installation was requested and needs an organization owner to approve it")}`,
    );
  }

  try {
    const result = await completeGithubAppInstall(user.id, installationId, state);
    redirect(`/integrations/${result.integrationId}`);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Could not finish GitHub App install";
    redirect(`/integrations?error=${encodeURIComponent(message)}`);
  }
}
