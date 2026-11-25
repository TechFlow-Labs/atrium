/**
 * Category + type pairs for new issues, and the subtasks each pair always needs.
 * Subtasks are human steps. Lint, formatting, and "CI is green" stay out.
 */

export type IssueCategoryId = "software" | "product" | "design" | "operations" | "general";

export type IssueSubtask = {
  title: string;
  description: string;
};

export type IssueType = {
  id: string;
  label: string;
  description: string;
  subtasks: readonly IssueSubtask[];
};

export type IssueCategory = {
  id: IssueCategoryId;
  label: string;
  description: string;
  types: readonly IssueType[];
};

export const ISSUE_CATEGORIES: readonly IssueCategory[] = [
  {
    id: "software",
    label: "Software",
    description: "Change the product or the system that runs it",
    types: [
      {
        id: "frontend",
        label: "Frontend",
        description: "Screens, client behavior, and what people see",
        subtasks: [
          {
            title: "Confirm acceptance criteria",
            description: "Agree what done looks like before you build, so review has a clear bar.",
          },
          {
            title: "Open a draft pull request",
            description: "Start the change in a branch early so others can see progress and give feedback.",
          },
          {
            title: "Cover the change with a UI test",
            description: "Lock the critical path so a later edit does not silently break what people click.",
          },
          {
            title: "Check empty, error, and keyboard states",
            description: "Walk the less-happy paths so the screen still works when data or input fails.",
          },
          {
            title: "Request code review",
            description: "Get a second set of eyes before the change lands where customers see it.",
          },
          {
            title: "Verify it in the running app",
            description: "Click through the real UI once more after merge so the shipped version matches intent.",
          },
        ],
      },
      {
        id: "backend",
        label: "Backend",
        description: "APIs, jobs, and server behavior",
        subtasks: [
          {
            title: "Confirm the contract and edge cases",
            description: "Write down inputs, outputs, and failure modes so callers and tests share one story.",
          },
          {
            title: "Open a draft pull request",
            description: "Share the change early so review can catch contract or migration issues sooner.",
          },
          {
            title: "Add or update tests",
            description: "Cover the happy path and the edges you named so regressions show up in CI.",
          },
          {
            title: "Note migrations and how to reverse them",
            description: "Document schema or data moves and the undo path before anyone runs them.",
          },
          {
            title: "Request code review",
            description: "Ask someone else to check correctness, safety, and operational risk.",
          },
          {
            title: "Verify it after deploy",
            description: "Confirm the live service behaves as expected once the change is out.",
          },
        ],
      },
      {
        id: "mobile",
        label: "Mobile",
        description: "iOS, Android, or a shared mobile client",
        subtasks: [
          {
            title: "Confirm the platforms and acceptance criteria",
            description: "Decide which devices matter and what done looks like on each of them.",
          },
          {
            title: "Open a draft pull request",
            description: "Put the work in review while it is still easy to reshape.",
          },
          {
            title: "Add or update tests",
            description: "Protect the flows you changed so future releases do not reopen the bug.",
          },
          {
            title: "Capture screenshots for review",
            description: "Show reviewers what changed visually without forcing them to build locally.",
          },
          {
            title: "Request code review",
            description: "Get a pass on logic, platform quirks, and release readiness.",
          },
          {
            title: "Verify it on a device build",
            description: "Run a real install so store builds and device constraints are not a surprise.",
          },
        ],
      },
      {
        id: "infrastructure",
        label: "Infrastructure",
        description: "Deploys, environments, and platform changes",
        subtasks: [
          {
            title: "Write the change and how to roll it back",
            description: "Spell out what will change in production and the fastest safe undo.",
          },
          {
            title: "Open a draft pull request",
            description: "Put infra diffs in review so others can catch blast-radius issues.",
          },
          {
            title: "Request review",
            description: "Have someone who knows the environment sanity-check timing and risk.",
          },
          {
            title: "Roll it out",
            description: "Apply the change in the planned window with monitoring open.",
          },
          {
            title: "Watch errors and latency after the change",
            description: "Stay with the system long enough to catch delayed fallout.",
          },
        ],
      },
      {
        id: "data",
        label: "Data",
        description: "Pipelines, metrics, and datasets",
        subtasks: [
          {
            title: "Define the question and the source",
            description: "Name what decision this data supports and where trustworthy rows come from.",
          },
          {
            title: "Validate a sample",
            description: "Check a slice of results by hand so joins and filters are not quietly wrong.",
          },
          {
            title: "Document caveats",
            description: "Record known gaps, delays, and definitions so later readers do not misuse the numbers.",
          },
          {
            title: "Request review",
            description: "Ask someone close to the domain to confirm the answer is usable.",
          },
        ],
      },
      {
        id: "security",
        label: "Security",
        description: "Risk, auth, and sensitive data",
        subtasks: [
          {
            title: "Write the impact and who is affected",
            description: "Describe the risk plainly so priority and scope are obvious.",
          },
          {
            title: "Open a draft pull request",
            description: "Share the fix early while the threat model is still fresh.",
          },
          {
            title: "Add a regression test",
            description: "Prove the hole stays closed when someone changes nearby code later.",
          },
          {
            title: "Request security review",
            description: "Get a specialist or owner to confirm the fix and residual risk.",
          },
          {
            title: "Verify the fix",
            description: "Re-run the attack path or check in a safe environment after deploy.",
          },
        ],
      },
      {
        id: "bug",
        label: "Bug",
        description: "Something that already shipped is wrong",
        subtasks: [
          {
            title: "Reproduce and record the steps",
            description: "Capture a reliable path so anyone can see the failure without guessing.",
          },
          {
            title: "Write a failing test",
            description: "Pin the bug in automation before you change code so the fix is proven.",
          },
          {
            title: "Open a pull request with the fix",
            description: "Ship the smallest change that makes the failing test pass.",
          },
          {
            title: "Request code review",
            description: "Confirm the root cause is fixed and no new edge case was introduced.",
          },
          {
            title: "Confirm it no longer reproduces",
            description: "Re-run the original steps in a build that includes the fix.",
          },
        ],
      },
      {
        id: "docs",
        label: "Documentation",
        description: "Docs, changelog, or a runbook",
        subtasks: [
          {
            title: "Find the page that is wrong or missing",
            description: "Locate the source of truth so you update one place, not three forks.",
          },
          {
            title: "Draft the update",
            description: "Write the corrected steps or explanation in the same voice as nearby docs.",
          },
          {
            title: "Request review",
            description: "Have someone who uses the doc confirm it matches reality.",
          },
          {
            title: "Publish it",
            description: "Ship the page where people actually look for it.",
          },
        ],
      },
    ],
  },
  {
    id: "product",
    label: "Product",
    description: "Decide what to build and whether it landed",
    types: [
      {
        id: "discovery",
        label: "Discovery",
        description: "Understand the problem before building",
        subtasks: [
          {
            title: "Write the problem and who has it",
            description: "Frame the pain and the audience so the team is solving the same thing.",
          },
          {
            title: "Talk to the people affected",
            description: "Check the problem against real users before locking a solution.",
          },
          {
            title: "Capture options and a recommendation",
            description: "List credible paths and pick one with clear reasons.",
          },
        ],
      },
      {
        id: "spec",
        label: "Spec",
        description: "Define the change before implementation",
        subtasks: [
          {
            title: "Write acceptance criteria",
            description: "Define testable outcomes so engineering and design share a finish line.",
          },
          {
            title: "Note what is out of scope",
            description: "Call out what this change will not do so scope stays honest.",
          },
          {
            title: "Review it with design and engineering",
            description: "Align on feasibility and UX before anyone starts building.",
          },
        ],
      },
      {
        id: "launch",
        label: "Launch",
        description: "Ship something people will notice",
        subtasks: [
          {
            title: "Write the rollout plan",
            description: "Decide who gets it when, and what success or rollback looks like.",
          },
          {
            title: "Prepare the changelog or announcement",
            description: "Tell the right audience what changed in language they can use.",
          },
          {
            title: "Verify it in production",
            description: "Confirm the live experience matches the plan after release.",
          },
          {
            title: "File follow-up issues",
            description: "Capture polish and debt discovered during launch so they are not lost.",
          },
        ],
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    description: "Shape how the work looks, reads, and feels",
    types: [
      {
        id: "interface",
        label: "Interface",
        description: "Screens and interaction",
        subtasks: [
          {
            title: "Sketch the flow",
            description: "Map the screens and decisions so the interaction story is clear.",
          },
          {
            title: "Review it with engineering",
            description: "Check constraints early so the design can ship without last-minute cuts.",
          },
          {
            title: "Check empty, loading, and error states",
            description: "Design the in-between moments so the product still feels cared for.",
          },
          {
            title: "Hand off the final screens",
            description: "Deliver specs and assets in a form engineering can implement without guessing.",
          },
        ],
      },
      {
        id: "research",
        label: "Research",
        description: "Learn from people using the product",
        subtasks: [
          {
            title: "Write the question",
            description: "Name what you need to learn so sessions stay focused.",
          },
          {
            title: "Run the sessions or the review",
            description: "Gather evidence from people or artifacts instead of guessing.",
          },
          {
            title: "Summarize what should change",
            description: "Turn findings into a short recommendation the team can act on.",
          },
        ],
      },
      {
        id: "content",
        label: "Content",
        description: "Words in the product",
        subtasks: [
          {
            title: "Draft the copy",
            description: "Write the words people will see in the product flow.",
          },
          {
            title: "Review tone and accuracy",
            description: "Check voice, clarity, and facts before the strings go live.",
          },
          {
            title: "Place it in the product",
            description: "Get the final copy into the screens or strings where it belongs.",
          },
        ],
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    description: "Keep the system running and the release honest",
    types: [
      {
        id: "incident",
        label: "Incident",
        description: "Something is broken in production",
        subtasks: [
          {
            title: "Record the impact and when it started",
            description: "Capture severity and timeline so responders share one picture.",
          },
          {
            title: "Mitigate",
            description: "Stop the bleeding first; deep root cause can wait a beat.",
          },
          {
            title: "Write the cause",
            description: "Document what broke and why so the follow-up is grounded.",
          },
          {
            title: "File the follow-up",
            description: "Create the lasting fix or process change before the incident is closed.",
          },
        ],
      },
      {
        id: "release",
        label: "Release",
        description: "Ship a known set of changes",
        subtasks: [
          {
            title: "List what is shipping",
            description: "Enumerate the changes in this cut so nothing rides along unnoticed.",
          },
          {
            title: "Write the changelog",
            description: "Summarize user-facing impact for support and customers.",
          },
          {
            title: "Deploy and verify",
            description: "Push the build and confirm the critical paths still work.",
          },
          {
            title: "Watch errors after release",
            description: "Monitor for a while so silent failures get caught early.",
          },
        ],
      },
      {
        id: "maintenance",
        label: "Maintenance",
        description: "Planned upkeep with a rollback",
        subtasks: [
          {
            title: "Write what will change and how to undo it",
            description: "Plan the work and the exit before you start the window.",
          },
          {
            title: "Schedule the window",
            description: "Pick a time that matches risk and who needs to be around.",
          },
          {
            title: "Do the work and verify",
            description: "Execute the plan and confirm the system is healthy afterward.",
          },
          {
            title: "Note anything left over",
            description: "Record leftovers so the next pass does not rediscover them.",
          },
        ],
      },
    ],
  },
  {
    id: "general",
    label: "General",
    description: "Work that is not a product change",
    types: [
      {
        id: "admin",
        label: "Admin",
        description: "Paperwork, accounts, and records",
        subtasks: [
          {
            title: "Gather what is needed",
            description: "Collect the forms, access, or facts before you start filling things in.",
          },
          {
            title: "Complete the update",
            description: "Do the admin work itself while the materials are in hand.",
          },
          {
            title: "Confirm it is filed",
            description: "Check that the record landed where others will find it later.",
          },
        ],
      },
      {
        id: "errand",
        label: "Errand",
        description: "Something to do outside the tracker",
        subtasks: [
          {
            title: "Confirm the place and time",
            description: "Lock logistics so the trip is not wasted.",
          },
          {
            title: "Do the errand",
            description: "Complete the offline task.",
          },
          {
            title: "Note the outcome",
            description: "Write what happened so the issue can close with a clear result.",
          },
        ],
      },
      {
        id: "research",
        label: "Research",
        description: "A question to answer",
        subtasks: [
          {
            title: "Write the question",
            description: "State what you need to know so the search stays bounded.",
          },
          {
            title: "Collect sources",
            description: "Gather enough credible material to answer without padding.",
          },
          {
            title: "Summarize a recommendation",
            description: "Turn the reading into a short answer someone can act on.",
          },
        ],
      },
    ],
  },
];

export function issueCategory(id: string | null | undefined): IssueCategory | null {
  if (!id) return null;
  return ISSUE_CATEGORIES.find((category) => category.id === id) ?? null;
}

export function issueType(categoryId: string | null | undefined, typeId: string | null | undefined): IssueType | null {
  const category = issueCategory(categoryId);
  if (!category || !typeId) return null;
  return category.types.find((type) => type.id === typeId) ?? null;
}

export function issueKindLabel(categoryId: string | null | undefined, typeId: string | null | undefined): string | null {
  const category = issueCategory(categoryId);
  const type = issueType(categoryId, typeId);
  if (!category || !type) return null;
  return `${category.label} · ${type.label}`;
}

export function issueSubtaskTitles(type: IssueType | null | undefined): string[] {
  return type?.subtasks.map((subtask) => subtask.title) ?? [];
}
