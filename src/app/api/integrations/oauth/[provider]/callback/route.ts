import { redirect, unstable_rethrow } from "next/navigation";
import { isOAuthProvider } from "@/lib/oauth-providers";
import { getSessionUser } from "@/server/auth/session";
import { completeOAuth } from "@/server/integrations/service";

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { provider } = await context.params;
  if (!isOAuthProvider(provider)) {
    return new Response("Unknown provider", { status: 404 });
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");
  if (oauthError) {
    const message = oauthErrorDescription || oauthError;
    redirect(`/integrations?error=${encodeURIComponent(message)}`);
  }
  if (!code || !state) {
    redirect(`/integrations?error=${encodeURIComponent("Missing OAuth code or state from the provider")}`);
  }
  try {
    const result = await completeOAuth(user.id, provider, code, state);
    redirect(provider === "slack" ? "/chats" : `/integrations/${result.integrationId}`);
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : "OAuth connection failed";
    redirect(`/integrations?error=${encodeURIComponent(message)}`);
  }
}
