"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordResetAction, type ActionState } from "@/app/actions";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestPasswordResetAction, {});
  return (
    <AuthShell
      title="Reset your password"
      description="Enter the email on your account. If it matches, a link arrives within a few minutes and expires in one hour."
    >
      <form action={action} className="space-y-4 rounded-lg border border-border/80 bg-card/70 p-5 backdrop-blur-sm sm:p-6">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required className="mt-1" />
        </div>
        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        {state.notice ? <p className="text-sm text-foreground">{state.notice}</p> : null}
        <Button disabled={pending} type="submit" className="w-full sm:w-auto">
          {pending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <p className="mt-4 text-sm text-muted">
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
