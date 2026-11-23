import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local"), override: false });
config({ path: resolve(process.cwd(), ".env"), override: false });

const providers = ["linear", "jira", "github", "gitlab", "gitea", "slack", "figma"] as const;
const base = (process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:38471").replace(/\/$/, "");

console.log(`BETTER_AUTH_URL=${base}\n`);
console.log("Register these callback URLs with each OAuth app:\n");
for (const provider of providers) {
  const id = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
  const secret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
  const ready = Boolean(id && secret);
  console.log(
    `${provider.padEnd(8)} ${base}/api/integrations/oauth/${provider}/callback  ${ready ? "(configured)" : "(missing client id/secret)"}`,
  );
}
