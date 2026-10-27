import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { writeAudit } from "../audit";
import { getDb, withUser } from "../db/client";
import { account, session, user, verification } from "../db/schema";
import { logError } from "../log";
import { sendPasswordResetEmail } from "./mail";

// The instance is created on first use. Importing this module must not open a
// database connection or read the environment, because `next build` imports
// every route to collect page data, and the build stage has no runtime env.
function createAuth() {
  return betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      autoSignIn: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user: accountUser, url }) => {
        await sendPasswordResetEmail(accountUser.email, url);
      },
      onPasswordReset: async ({ user: accountUser }) => {
        try {
          await withUser(accountUser.id, (tx) =>
            writeAudit(tx, {
              workspaceId: null,
              action: "auth.password_reset",
              entityType: "user",
              entityId: accountUser.id,
            }),
          );
        } catch (error) {
          logError("password reset audit failed", {
            error: error instanceof Error ? error.message : "audit failed",
          });
        }
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      // Signed session payload in the browser so getSession can skip a DB round-trip.
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
      useSecureCookies: process.env.NODE_ENV === "production",
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
    },
    plugins: [nextCookies()],
  });
}

let instance: ReturnType<typeof createAuth> | null = null;

export function getAuth(): ReturnType<typeof createAuth> {
  instance ??= createAuth();
  return instance;
}
