"use client";

import { useActionState, useState, useTransition, type ComponentProps, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  completeOnboardingAction,
  onboardingProfileAction,
  onboardingWorkspaceAction,
} from "@/app/actions";
import { AtriumLogo } from "@/components/atrium-logo";
import { IntegrationsOnboarding } from "@/components/integrations-onboarding";
import { McpPanel } from "@/components/mcp-panel";
import { ThemeSettings } from "@/components/theme-settings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Label } from "@/components/ui/field";

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "profile", label: "Profile" },
  { id: "appearance", label: "Appearance" },
  { id: "workspace", label: "Workspace" },
  { id: "integrations", label: "Integrations" },
  { id: "mcp", label: "AI access" },
  { id: "finish", label: "Done" },
] as const;

type Props = {
  userName: string;
  profile: { timezone: string; notifySync: boolean; notifyAssignments: boolean };
  appearance: ComponentProps<typeof ThemeSettings>;
  workspace: { id: string; name: string };
  canAdmin: boolean;
  integrations: ComponentProps<typeof IntegrationsOnboarding>["integrations"];
  providers: string[];
  oauth: Record<string, boolean>;
  mcp: ComponentProps<typeof McpPanel>;
  callbackBase: string;
};

// Setup that runs before the console. Every step is optional, and the whole
// flow can be skipped. Steps save as they go, so skipping keeps earlier work.
export function OnboardingWizard(props: Props) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [finishing, startFinish] = useTransition();
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  const next = () => setIndex((current) => Math.min(current + 1, STEPS.length - 1));
  const back = () => setIndex((current) => Math.max(current - 1, 0));
  const finish = () => startFinish(() => completeOnboardingAction());

  return (
    <div className="h-dvh overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-8 md:px-6">
        <header className="flex items-center justify-between gap-3">
          <AtriumLogo markClassName="size-7 text-primary" />
          <div className="flex items-center gap-3">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              Step {index + 1} of {STEPS.length}
            </p>
            {last ? null : (
              <Button type="button" variant="ghost" size="sm" disabled={finishing} onClick={finish}>
                Skip setup
              </Button>
            )}
          </div>
        </header>

        <div className="mt-8 flex-1 rounded-lg border bg-card p-5 md:p-7">
          {step.id === "welcome" ? (
            <WelcomeStep userName={props.userName} onStart={next} onSkip={finish} skipping={finishing} />
          ) : null}
          {step.id === "profile" ? (
            <ProfileStep profile={props.profile} userName={props.userName} onDone={next} />
          ) : null}
          {step.id === "appearance" ? (
            <div className="space-y-6">
              <StepHeading title="Appearance" body="Choose how Atrium looks. Each choice saves as you make it." />
              <ThemeSettings {...props.appearance} />
              <StepFooter onBack={back} onNext={next} onSkip={next} />
            </div>
          ) : null}
          {step.id === "workspace" ? (
            <WorkspaceStep onBack={back} onDone={next} onCreated={() => router.refresh()} />
          ) : null}
          {step.id === "integrations" ? (
            <div className="space-y-6">
              <StepHeading
                title="Connect your tools"
                body="Connect the providers you use, such as Linear or GitHub, Slack for chats, or an Obsidian vault for notes. OAuth connections send you to the provider and back to the connection page."
              />
              <IntegrationsOnboarding
                callbackBase={props.callbackBase}
                workspaceId={props.workspace.id}
                integrations={props.integrations}
                providers={props.providers}
                oauth={props.oauth}
                canAdmin={props.canAdmin}
                error={null}
              />
              <StepFooter onBack={back} onNext={next} onSkip={next} />
            </div>
          ) : null}
          {step.id === "mcp" ? (
            <div className="space-y-6">
              <StepHeading
                title="AI access"
                body="Create a personal token so AI tools such as Claude or Cursor can read your workspace. The token is shown once."
              />
              <McpPanel {...props.mcp} />
              <StepFooter onBack={back} onNext={next} onSkip={next} />
            </div>
          ) : null}
          {step.id === "finish" ? (
            <div className="space-y-6">
              <StepHeading
                title="You are set up"
                body="Anything you skipped is still available in Settings, Workspaces, and Integrations. Atrium will now show a short tour of each screen the first time you open it."
              />
              <div className="flex items-center justify-between gap-2">
                <Button type="button" variant="outline" onClick={back}>
                  Back
                </Button>
                <Button type="button" disabled={finishing} onClick={finish}>
                  Open Atrium
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StepHeading({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h1 className="text-3xl">{title}</h1>
      <p className="mt-2 text-sm text-muted">{body}</p>
    </div>
  );
}

function StepFooter({ onBack, onNext, onSkip }: { onBack: () => void; onNext: () => void; onSkip: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-5">
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" variant="ghost" onClick={onSkip}>
          Skip this step
        </Button>
      </div>
      <Button type="button" onClick={onNext}>
        Continue
      </Button>
    </div>
  );
}

function WelcomeStep({
  userName,
  onStart,
  onSkip,
  skipping,
}: {
  userName: string;
  onStart: () => void;
  onSkip: () => void;
  skipping: boolean;
}) {
  return (
    <div className="space-y-6">
      <StepHeading
        title={`Welcome, ${userName}`}
        body="Atrium keeps your personal and work projects in one place. Before you start, you can set up your profile, appearance, workspace, connected tools, and AI access."
      />
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        <li>Everything here is optional.</li>
        <li>Each step saves as you go, and you can skip any step.</li>
        <li>You can change all of it later in Settings, Workspaces, and Integrations.</li>
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-5">
        <Button type="button" variant="ghost" disabled={skipping} onClick={onSkip}>
          Skip setup
        </Button>
        <Button type="button" onClick={onStart}>
          Start setup
        </Button>
      </div>
    </div>
  );
}

function ProfileStep({
  profile,
  userName,
  onDone,
}: {
  profile: Props["profile"];
  userName: string;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startSave] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startSave(async () => {
      const result = await onboardingProfileAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <StepHeading title="Your profile" body="Set how Atrium shows your name and dates, and which alerts you want." />
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="onboarding-name">Display name</Label>
          <Input id="onboarding-name" name="name" defaultValue={userName} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="onboarding-timezone">Timezone</Label>
          <Input id="onboarding-timezone" name="timezone" defaultValue={profile.timezone} className="mt-1" />
        </div>
      </div>
      <div className="space-y-3">
        <label className="flex items-center gap-2.5 text-sm">
          <Checkbox name="notifySync" defaultChecked={profile.notifySync} />
          Show sync errors on the home page
        </label>
        <label className="flex items-center gap-2.5 text-sm">
          <Checkbox name="notifyAssignments" defaultChecked={profile.notifyAssignments} />
          Highlight tasks assigned to me
        </label>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-5">
        <Button type="button" variant="ghost" onClick={onDone}>
          Skip this step
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save and continue"}
        </Button>
      </div>
    </form>
  );
}

function WorkspaceStep({
  onBack,
  onDone,
  onCreated,
}: {
  onBack: () => void;
  onDone: () => void;
  onCreated: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (previous: Awaited<ReturnType<typeof onboardingWorkspaceAction>>, formData: FormData) => {
      const result = await onboardingWorkspaceAction(previous, formData);
      if (!result.error) {
        onCreated();
        onDone();
      }
      return result;
    },
    {},
  );

  return (
    <div className="space-y-6">
      <StepHeading
        title="A work workspace"
        body="You already have a personal workspace. Add a work workspace for a team or a company. Workspaces keep their projects, tasks, and people separate."
      />
      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="onboarding-workspace">Workspace name</Label>
          <Input id="onboarding-workspace" name="name" placeholder="For example, Northwind Studio" className="mt-1" />
        </div>
        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-5">
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onBack}>
              Back
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              Skip this step
            </Button>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating" : "Create and continue"}
          </Button>
        </div>
      </form>
    </div>
  );
}
