"use client";

import Link from "next/link";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction, type ActionState } from "@/app/actions";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Label } from "@/components/ui/field";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(loginAction, {});
  const passwordUpdated = useSearchParams().get("reset") === "1";
  return (
    <AuthShell
      title="Sign in"
      description="Use the account you created on this Atrium server."
    >
      <form action={action} className="space-y-4 rounded-lg border border-border/80 bg-card/70 p-5 backdrop-blur-sm sm:p-6">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required className="mt-1" />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required className="mt-1" />
        </div>
        <label className="flex items-start gap-2.5 text-sm leading-snug">
          <Checkbox name="rememberMe" defaultChecked className="mt-0.5" />
          <span>
            Keep me signed in on this browser
            <span className="mt-0.5 block text-xs text-muted">Caches your session here for two weeks. Uncheck for a session that ends when you close the browser.</span>
          </span>
        </label>
        {passwordUpdated ? <p className="text-sm text-foreground">Password updated. Sign in with the new one.</p> : null}
        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={pending} type="submit" className="w-full sm:w-auto">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          <Link href="/forgot-password" className="text-sm text-muted underline underline-offset-4">
            Forgot password?
          </Link>
        </div>
      </form>
      <p className="mt-4 text-sm text-muted">
        New here?{" "}
        <Link href="/register" className="text-foreground underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
