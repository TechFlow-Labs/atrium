// The first-login app tour walks through Atrium once. Per-screen guides stay
// available for the help button's optional "this screen" restart, but they are
// never auto-opened on enter.
//
// To change the app tour, edit APP_TOUR and bump its `version` so users who
// already finished it see the update once. Each tour target is a
// `data-tour="..."` attribute in the source. Steps may set `href` so the tour
// navigates before looking for the target.

export type TourStep = {
  // Matches a `data-tour` attribute. Steps whose target is not on screen are
  // skipped.
  target: string;
  title: string;
  body: string;
  // Optional console path to open before locating the target.
  href?: string;
};

export type ScreenGuide = {
  id: string;
  version: number;
  title: string;
  intro: string;
  tour: TourStep[];
};

const SHELL_TOUR: TourStep[] = [
  {
    href: "/home",
    target: "sidebar",
    title: "Navigation",
    body: "Every screen is listed here. Use Edit at the bottom of the sidebar to change the order.",
  },
  {
    href: "/home",
    target: "workspace-switch",
    title: "Workspace",
    body: "Switch workspaces or contexts here. Everything you see belongs to the workspace shown.",
  },
  {
    href: "/home",
    target: "search",
    title: "Search",
    body: "Find projects by name and tasks by title or description in the current workspace.",
  },
  {
    href: "/home",
    target: "create",
    title: "Create",
    body: "Add a new task or project from here.",
  },
  {
    href: "/home",
    target: "guide-help",
    title: "Tour",
    body: "Reopen this tour any time from here.",
  },
];

// Shown once after the first successful login (or after onboarding ends).
export const APP_TOUR: ScreenGuide = {
  id: "app",
  version: 2,
  title: "Welcome to Atrium",
  intro:
    "Atrium is one place for personal and work projects. This short tour walks through the main screens once. You can reopen it later from the help button in the header.",
  tour: [
    ...SHELL_TOUR,
    {
      href: "/home",
      target: "home-stats",
      title: "Attention counts",
      body: "These counts show work that needs attention, is due this week, is blocked, or was finished recently. Select one to open the matching task list.",
    },
    {
      href: "/home",
      target: "home-panels",
      title: "Priority panels",
      body: "Lists of the most urgent work. Each panel links to its full task list.",
    },
    {
      href: "/projects",
      target: "projects-board",
      title: "Projects",
      body: "Projects group related tasks. Native projects are edited here. Provider-linked projects mirror issues from Linear, Jira, GitHub, GitLab, or Gitea.",
    },
    {
      href: "/tasks",
      target: "task-filters",
      title: "Tasks",
      body: "Search and filter every task you can see across the workspace.",
    },
    {
      href: "/tasks",
      target: "task-view",
      title: "List and board",
      body: "Switch between a list and a board grouped by status.",
    },
    {
      href: "/schedule",
      target: "schedule-body",
      title: "Schedule",
      body: "Dated work appears here. Tasks without a due date do not show on this screen.",
    },
    {
      href: "/chats",
      target: "chats-feed",
      title: "Chats",
      body: "Today's messages from Slack channels the bot has been invited to. Atrium only reads messages.",
    },
    {
      href: "/notes",
      target: "notes-list",
      title: "Notes",
      body: "Markdown from an Obsidian vault, plus notes you save from the button at the bottom right. Vault files stay read-only.",
    },
    {
      href: "/integrations",
      target: "integrations-providers",
      title: "Integrations",
      body: "Connect providers with OAuth or a token. Only owners and admins can connect providers.",
    },
    {
      href: "/sync",
      target: "sync-health",
      title: "Sync",
      body: "Connection health, conflicts, and failed jobs for linked providers.",
    },
    {
      href: "/workspaces",
      target: "workspace-contexts",
      title: "Workspaces",
      body: "Keep projects, tasks, and people separate per workspace. Contexts group them, such as Personal and Work.",
    },
    {
      href: "/settings",
      target: "settings-appearance",
      title: "Settings",
      body: "Your profile, appearance, and notification choices. They apply only to your account.",
    },
  ],
};

export const GUIDES = {
  home: {
    id: "home",
    version: 2,
    title: "Home",
    intro: "Your workspace dashboard with attention counts and priority panels.",
    tour: [
      {
        target: "home-stats",
        title: "Attention counts",
        body: "These counts show work that needs attention, is due this week, is blocked, or was finished in the last seven days.",
      },
      {
        target: "home-panels",
        title: "Priority panels",
        body: "Lists of the most urgent work. Each panel links to its full task list.",
      },
      {
        target: "source-filter",
        title: "Sources",
        body: "Show all work, only Atrium tasks, or tasks from one connected provider.",
      },
    ],
  },
  projects: {
    id: "projects",
    version: 2,
    title: "Projects",
    intro: "Projects group related tasks from Atrium and connected providers.",
    tour: [
      {
        target: "project-status",
        title: "Project status",
        body: "Switch between Active, Archived, and All projects.",
      },
      {
        target: "projects-board",
        title: "Your projects",
        body: "Each card is one project. Select a project to see its status, updates, and tasks.",
      },
    ],
  },
  project: {
    id: "project",
    version: 2,
    title: "Project",
    intro: "A project page shows status, updates, and the task list.",
    tour: [
      {
        target: "project-counts",
        title: "Status at a glance",
        body: "Counts of tasks that need attention, are in progress, or are blocked.",
      },
      {
        target: "project-updates",
        title: "Recent tasks",
        body: "The latest changes across this project's tasks.",
      },
      {
        target: "project-manage",
        title: "Manage project",
        body: "Admins can change the project name and nickname, and map provider fields for linked projects.",
      },
    ],
  },
  tasks: {
    id: "tasks",
    version: 2,
    title: "Tasks",
    intro: "Every task you can see across your workspace.",
    tour: [
      {
        target: "task-filters",
        title: "Find tasks",
        body: "Search by text, then narrow the list by status, priority, project, and source.",
      },
      {
        target: "task-view",
        title: "List and board",
        body: "Switch between a list and a board. The board groups tasks into columns by status.",
      },
      {
        target: "new-task",
        title: "New task",
        body: "Create a task on a native project.",
      },
      {
        target: "task-bulk",
        title: "Bulk actions",
        body: "Select several tasks in the list, then set their status or priority together.",
      },
      {
        target: "task-list",
        title: "Task list",
        body: "Select a task to open its details, comments, and source.",
      },
    ],
  },
  task: {
    id: "task",
    version: 2,
    title: "Task",
    intro: "A task holds its details, discussion, and source.",
    tour: [
      {
        target: "task-form",
        title: "Details",
        body: "Edit the title, description, status, and priority, then save.",
      },
      {
        target: "task-comments",
        title: "Activity",
        body: "Comments and activity for this task.",
      },
      {
        target: "task-provider",
        title: "Open in provider",
        body: "For a provider task, this opens the original issue.",
      },
    ],
  },
  schedule: {
    id: "schedule",
    version: 2,
    title: "Schedule",
    intro: "Schedule shows when dated work is due.",
    tour: [
      {
        target: "schedule-nav",
        title: "Move through time",
        body: "Use the arrows, or the month and year controls, to move between months and years.",
      },
      {
        target: "schedule-view",
        title: "Month or timeline",
        body: "Month shows the tasks due on each day. Timeline lays tasks out over time.",
      },
      {
        target: "schedule-body",
        title: "Dated work",
        body: "Tasks with a due date appear here.",
      },
    ],
  },
  chats: {
    id: "chats",
    version: 2,
    title: "Chats",
    intro: "Today's messages from Slack channels the bot has been invited to.",
    tour: [
      {
        target: "chats-feed",
        title: "Today's messages",
        body: "Messages from today in the channels the Slack bot has been invited to.",
      },
      {
        target: "chats-manage",
        title: "Slack connection",
        body: "Connect or manage the Slack bot on the Integrations page.",
      },
    ],
  },
  notes: {
    id: "notes",
    version: 3,
    title: "Notes",
    intro:
      "Notes lists markdown from a connected Obsidian vault, plus notes you save from the quick-actions button. Atrium reads the vault and does not change those files.",
    tour: [
      {
        target: "notes-filters",
        title: "Find a note",
        body: "Search, or filter by folder, to narrow the list.",
      },
      {
        target: "notes-list",
        title: "Notes",
        body: "Select a note to read it.",
      },
      {
        target: "notes-reader",
        title: "Reader",
        body: "The note's contents. Obsidian files stay read-only. Notes you saved in Atrium open here too.",
      },
    ],
  },
  integrations: {
    id: "integrations",
    version: 2,
    title: "Integrations",
    intro: "Connect the tools where your work already lives.",
    tour: [
      {
        target: "integrations-providers",
        title: "Providers",
        body: "Choose a provider to connect it with OAuth or an access token.",
      },
      {
        target: "integrations-mcp",
        title: "MCP for AI tools",
        body: "Create a personal token for AI clients such as Claude or Cursor.",
      },
    ],
  },
  integration: {
    id: "integration",
    version: 2,
    title: "Connection",
    intro: "One provider connection and the projects it returned.",
    tour: [
      {
        target: "connection-status",
        title: "Connection status",
        body: "The provider, its status, and whether a credential is stored.",
      },
      {
        target: "connection-test",
        title: "Test connection",
        body: "Checks that the stored credentials still work.",
      },
      {
        target: "connection-link",
        title: "Link a project",
        body: "Choose a provider project to mirror into Atrium.",
      },
    ],
  },
  sync: {
    id: "sync",
    version: 2,
    title: "Sync",
    intro: "Whether connected providers are keeping up, and what needs attention.",
    tour: [
      {
        target: "sync-health",
        title: "Connection health",
        body: "Each connected provider with its latest sync status.",
      },
      {
        target: "sync-conflicts",
        title: "Conflicts",
        body: "The same field changed in Atrium and in the provider.",
      },
      {
        target: "sync-dead",
        title: "Failed jobs",
        body: "Jobs that failed repeatedly. Owners and admins can retry them.",
      },
    ],
  },
  workspaces: {
    id: "workspaces",
    version: 2,
    title: "Workspaces",
    intro: "A workspace keeps its projects, tasks, and people separate.",
    tour: [
      {
        target: "workspace-contexts",
        title: "Contexts",
        body: "Group your workspaces, such as Personal and Work.",
      },
      {
        target: "workspace-people",
        title: "People and roles",
        body: "Owner, admin, member, and viewer each allow a different level of access.",
      },
      {
        target: "workspace-invite",
        title: "Invite people",
        body: "An invitation is a link, not an email. The link is shown once.",
      },
    ],
  },
  audit: {
    id: "audit",
    version: 2,
    title: "Audit",
    intro: "Permission changes, integration changes, and other important actions.",
    tour: [
      {
        target: "audit-log",
        title: "Audit log",
        body: "Recent important actions, with who made them.",
      },
    ],
  },
  settings: {
    id: "settings",
    version: 2,
    title: "Settings",
    intro: "Your profile, appearance, and notification choices.",
    tour: [
      {
        target: "settings-appearance",
        title: "Appearance",
        body: "Light or dark mode, the color palette, animations, and provider tile styles.",
      },
      {
        target: "settings-profile",
        title: "Profile",
        body: "Your display name and timezone.",
      },
      {
        target: "settings-notifications",
        title: "Notifications",
        body: "Show sync errors on the home page, or highlight tasks assigned to you.",
      },
    ],
  },
  search: {
    id: "search",
    version: 2,
    title: "Search",
    intro: "Find projects and tasks in the current workspace.",
    tour: [
      {
        target: "search-input",
        title: "Search box",
        body: "Type at least two characters. Results stay inside the current workspace.",
      },
      {
        target: "search-results",
        title: "Results",
        body: "Matching projects and tasks, grouped by type.",
      },
    ],
  },
} satisfies Record<string, ScreenGuide>;

export type GuideId = keyof typeof GUIDES;

const DETAIL_GUIDES: Record<string, GuideId> = {
  projects: "project",
  tasks: "task",
  integrations: "integration",
};

const LIST_GUIDE_IDS = new Set<string>(Object.keys(GUIDES));

export function guideIdForPath(pathname: string): GuideId | null {
  const [first, second] = pathname.split("/").filter(Boolean);
  if (!first) return null;
  if (second && DETAIL_GUIDES[first]) return DETAIL_GUIDES[first];
  return LIST_GUIDE_IDS.has(first) ? (first as GuideId) : null;
}

export function resolveGuide(guideId: string, version: number): ScreenGuide | null {
  if (guideId === APP_TOUR.id && version === APP_TOUR.version) return APP_TOUR;
  if (!Object.hasOwn(GUIDES, guideId)) return null;
  const guide = GUIDES[guideId as GuideId];
  return guide.version === version ? guide : null;
}
