"use client";

import Link from "next/link";
import { Suspense, use, useActionState } from "react";
import { resetPasswordAction, type ActionState } from "@/app/actions";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm searchParams={searchParams} />
    </Suspense>
  );
}

function ResetPasswordForm({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = use(searchParams);
  const [state, action, pending] = useActionState<ActionState, FormData>(resetPasswordAction, {});
  const token = params.token ?? "";
  const invalid = params.error === "INVALID_TOKEN" || !token;
  return (
    <AuthShell
      title="Choose a new password"
      description="Use at least 12 characters, with a letter and a number. This signs you out of other browsers."
    >
      {invalid ? (
        <div className="space-y-4 rounded-lg border border-border/80 bg-card/70 p-5 backdrop-blur-sm sm:p-6">
          <p className="text-sm text-destructive">This reset link is invalid or has expired.</p>
          <Link href="/forgot-password" className="text-sm text-foreground underline underline-offset-4">
            Request a new link
          </Link>
        </div>
      ) : (
        <form action={action} className="space-y-4 rounded-lg border border-border/80 bg-card/70 p-5 backdrop-blur-sm sm:p-6">
          <input type="hidden" name="token" value={token} />
          <div>
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={12} className="mt-1" />
          </div>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <Button disabled={pending} type="submit" className="w-full sm:w-auto">
            {pending ? "Saving…" : "Update password"}
          </Button>
        </form>
      )}
      <p className="mt-4 text-sm text-muted">
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
