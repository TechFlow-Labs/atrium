import nodemailer from "nodemailer";
import { logError, logInfo } from "../log";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

export function readSmtpConfig(env: Record<string, string | undefined> = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim() ?? "";
  const user = env.SMTP_USER?.trim() ?? "";
  const password = env.SMTP_PASSWORD ?? "";
  const from = env.SMTP_FROM?.trim() ?? "";
  if (!host || !user || !password || !from) return null;
  const port = Number(env.SMTP_PORT?.trim() || "465");
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const secureFlag = env.SMTP_SECURE?.trim().toLowerCase();
  const secure = secureFlag === "true" || secureFlag === "1" || (secureFlag !== "false" && secureFlag !== "0" && port === 465);
  return { host, port, secure, user, password, from };
}

export function passwordResetMessage(url: string): { subject: string; text: string; html: string } {
  const subject = "Reset your Atrium password";
  const text = [
    "A password reset was requested for your Atrium account.",
    "",
    "Open this link within one hour to choose a new password:",
    url,
    "",
    "If you did not ask for this, you can ignore the email. Your password will stay the same.",
  ].join("\n");
  const safeUrl = escapeHtml(url);
  const html = `<p>A password reset was requested for your Atrium account.</p><p><a href="${safeUrl}">Choose a new password</a>. This link expires in one hour.</p><p>If you did not ask for this, you can ignore the email. Your password will stay the same.</p>`;
  return { subject, text, html };
}

export async function sendPasswordResetEmail(to: string, url: string, env: Record<string, string | undefined> = process.env): Promise<void> {
  const config = readSmtpConfig(env);
  if (!config) {
    if (env.NODE_ENV !== "production") {
      logInfo("password reset link (SMTP is not configured)", { to, link: url });
      return;
    }
    logError("password reset email skipped because SMTP is not configured", { to });
    throw new Error("SMTP is not configured");
  }
  const message = passwordResetMessage(url);
  try {
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
    });
    await transport.sendMail({
      from: config.from,
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (error) {
    logError("password reset email failed", {
      to,
      host: config.host,
      port: config.port,
      error: error instanceof Error ? error.message : "send failed",
    });
    throw new Error("Could not send the reset email");
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
