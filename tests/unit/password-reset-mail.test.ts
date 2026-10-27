import { describe, expect, it } from "vitest";
import { passwordResetMessage, readSmtpConfig } from "@/server/auth/mail";

const complete = {
  SMTP_HOST: "linux230.papaki.gr",
  SMTP_PORT: "465",
  SMTP_USER: "support@techflowlabs.gr",
  SMTP_PASSWORD: "secret-value",
  SMTP_FROM: "Atrium <support@techflowlabs.gr>",
};

describe("password reset mail", () => {
  it("reads implicit TLS on port 465", () => {
    expect(readSmtpConfig(complete)).toEqual({
      host: "linux230.papaki.gr",
      port: 465,
      secure: true,
      user: "support@techflowlabs.gr",
      password: "secret-value",
      from: "Atrium <support@techflowlabs.gr>",
    });
  });

  it("uses STARTTLS when port 587 is marked insecure", () => {
    const config = readSmtpConfig({ ...complete, SMTP_PORT: "587", SMTP_SECURE: "false" });
    expect(config?.port).toBe(587);
    expect(config?.secure).toBe(false);
  });

  it("stays disabled until host, user, password, and from are all set", () => {
    expect(readSmtpConfig({ ...complete, SMTP_PASSWORD: "" })).toBeNull();
    expect(readSmtpConfig({ ...complete, SMTP_FROM: "  " })).toBeNull();
    expect(readSmtpConfig({ ...complete, SMTP_PORT: "0" })).toBeNull();
  });

  it("puts the reset link in the message and escapes it in html", () => {
    const url = "https://atrium.example.com/api/auth/reset-password/abc?callbackURL=%2Freset-password&x=<tag>";
    const message = passwordResetMessage(url);
    expect(message.subject).toBe("Reset your Atrium password");
    expect(message.text).toContain(url);
    expect(message.html).toContain("&amp;x=&lt;tag&gt;");
    expect(message.html).not.toContain("<tag>");
  });
});
