import { receiveGithubAppWebhook } from "@/server/webhooks/github-app";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  const result = await receiveGithubAppWebhook({ rawBody, headers });
  return new Response(result.body, { status: result.status });
}
