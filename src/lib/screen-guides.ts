// Screen guides explain each screen the first time a user opens it. The intro
// is shown in a dialog, then a spotlight tour highlights the core parts of the
// screen one at a time.
//
// To change a guide, edit its copy here, then bump its `version` so users who
// already saw it get the updated guide once. Each tour target is a
// `data-tour="..."` attribute in the source. The guide test fails when a target
// is missing from the source, and when a console route has no guide.
// Adding a screen means adding an entry to GUIDES, and a DETAIL_GUIDES entry
// if it has a detail page.

export type TourStep = {
  // Matches a `data-tour` attribute. Steps whose target is not on screen are
  // skipped.
  target: string;
  title: string;
  body: string;
};

export type ScreenGuide = {
  id: string;
  version: number;
  title: string;
  intro: string;
  tour: TourStep[];
};

// The header and sidebar appear on every screen, so they are explained once,
// at the start of the first screen a user opens.
const SHELL_TOUR: TourStep[] = [
  {
    target: "sidebar",
    title: "Navigation",
    body: "Every screen is listed here. Use Edit at the bottom of the sidebar to change the order.",
  },
  {
    target: "workspace-switch",
    title: "Workspace",
    body: "Switch workspaces or contexts here. Everything you see belongs to the workspace shown.",
  },
  {
    target: "search",
    title: "Search",
    body: "Find projects by name and tasks by title or description in the current workspace.",
  },
  {
    target: "create",
    title: "Create",
    body: "Add a new task or project from here.",
  },
  {
    target: "guide-help",
    title: "Guide",
    body: "Reopen the guide and its tour for any screen from here.",
  },
];

export const GUIDES = {
  home: {
    id: "home",
    version: 2,
    title: "Welcome to Atrium",
    intro:
      "Atrium is one place for your personal and work projects. Native tasks are edited here. Tasks from Linear, Jira, GitHub, GitLab, and Gitea stay owned by those providers, and Atrium keeps a synchronized copy. The tour starts with the layout, then covers this page.",
    tour: [
      ...SHELL_TOUR,
      {
        target: "home-stats",
        title: "Attention counts",
        body: "These counts show work that needs attention, is due this week, is blocked, or was finished in the last seven days. Select one to open the matching task list.",
      },
      {
        target: "home-panels",
        title: "Priority panels",
        body: "Lists of the most urgent work: Needs attention, Due this week, and Blocked. Each panel links to its full task list.",
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
    intro:
      "Projects group related tasks. Native projects are created and edited in Atrium. Projects linked from a provider mirror that provider's issues.",
    tour: [
      {
        target: "project-status",
        title: "Project status",
        body: "Switch between Active, Archived, and All projects.",
      },
      {
        target: "projects-board",
        title: "Your projects",
        body: "Each card is one project. Select a project to see its status, updates, and tasks. Create a native project from the plus button in the header.",
      },
    ],
  },
  project: {
    id: "project",
    version: 2,
    title: "Project",
    intro:
      "A project page shows the status of its tasks, the latest updates, and the task list. Native tasks save here. Provider-linked tasks follow the provider's rules.",
    tour: [
      {
        target: "project-counts",
        title: "Status at a glance",
        body: "Counts of tasks that need attention, are in progress, or are blocked. Select one to filter the task list.",
      },
      {
        target: "project-updates",
        title: "Recent tasks",
        body: "The latest changes across this project's tasks.",
      },
      {
        target: "project-manage",
        title: "Manage project",
        body: "Admins can change the project name and nickname. For linked projects, this is also where you map provider fields and publish changes. Milestones stay with the provider.",
      },
    ],
  },
  tasks: {
    id: "tasks",
    version: 2,
    title: "Tasks",
    intro:
      "Every task you can see across your workspace, from native projects and connected providers. Native tasks are edited here. Provider tasks show where they came from and only offer actions that the provider supports.",
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
        body: "Create a task on a native project. Viewers can read tasks. Members and above can create and edit them.",
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
    intro:
      "A task holds its details, its discussion, and its source. Native tasks save here. For tasks from a provider, the source is shown and only the supported changes are offered.",
    tour: [
      {
        target: "task-form",
        title: "Details",
        body: "Edit the title, description, status, and priority, then save. Provider tasks only allow the changes the provider supports.",
      },
      {
        target: "task-comments",
        title: "Activity",
        body: "Comments and activity for this task. Use the comment box here to record progress or questions for your team.",
      },
      {
        target: "task-provider",
        title: "Open in provider",
        body: "For a provider task, this opens the original issue, where the provider's rules apply.",
      },
    ],
  },
  schedule: {
    id: "schedule",
    version: 2,
    title: "Schedule",
    intro:
      "Schedule shows when dated work is due. It replaces the old Calendar page, which now redirects here.",
    tour: [
      {
        target: "schedule-nav",
        title: "Move through time",
        body: "Use the arrows, or the month and year controls, to move between months and years.",
      },
      {
        target: "schedule-view",
        title: "Month or timeline",
        body: "Month shows the tasks due on each day. Timeline lays tasks out over time, which helps you spot overlapping work.",
      },
      {
        target: "schedule-body",
        title: "Dated work",
        body: "Tasks with a due date appear here. Tasks without one do not show on this screen.",
      },
    ],
  },
  chats: {
    id: "chats",
    version: 2,
    title: "Chats",
    intro:
      "Chats shows today's messages from the Slack channels you invited the bot to. It only reads messages. It does not post in Slack.",
    tour: [
      {
        target: "chats-feed",
        title: "Today's messages",
        body: "Messages from today in the channels the Slack bot has been invited to.",
      },
      {
        target: "chats-manage",
        title: "Slack connection",
        body: "Connect or manage the Slack bot on the Integrations page. Only owners and admins can connect providers.",
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
    intro:
      "Connect the tools where your work already lives. Atrium syncs issues into projects and keeps them up to date.",
    tour: [
      {
        target: "integrations-providers",
        title: "Providers",
        body: "Choose a provider to connect it with OAuth or an access token. Connected providers show their status here. Only owners and admins can connect providers.",
      },
      {
        target: "integrations-mcp",
        title: "MCP for AI tools",
        body: "Create a personal token for AI clients such as Claude or Cursor. The token is shown once, so copy it right away.",
      },
    ],
  },
  integration: {
    id: "integration",
    version: 2,
    title: "Connection",
    intro:
      "This page is one provider connection. It lists the projects the provider returned and lets you link them into Atrium.",
    tour: [
      {
        target: "connection-status",
        title: "Connection status",
        body: "The provider, its status, and whether a credential is stored.",
      },
      {
        target: "connection-test",
        title: "Test connection",
        body: "Checks that the stored credentials still work. Owners and admins can run this check.",
      },
      {
        target: "connection-link",
        title: "Link a project",
        body: "Choose a provider project to mirror into Atrium. Linking starts an initial sync right away.",
      },
    ],
  },
  sync: {
    id: "sync",
    version: 2,
    title: "Sync",
    intro:
      "Sync shows whether connected providers are keeping up, and what needs your attention.",
    tour: [
      {
        target: "sync-health",
        title: "Connection health",
        body: "Each connected provider with its latest sync status.",
      },
      {
        target: "sync-conflicts",
        title: "Conflicts",
        body: "The same field changed in Atrium and in the provider. Resolve a conflict to pick the value to keep.",
      },
      {
        target: "sync-dead",
        title: "Failed jobs",
        body: "Jobs that failed repeatedly. Owners and admins can retry them once the cause is fixed.",
      },
    ],
  },
  workspaces: {
    id: "workspaces",
    version: 2,
    title: "Workspaces",
    intro:
      "A workspace keeps its projects, tasks, and people separate from other workspaces. Contexts group workspaces, such as Personal and Work.",
    tour: [
      {
        target: "workspace-contexts",
        title: "Contexts",
        body: "Group your workspaces, such as Personal and Work. Create new contexts here, and manage the existing ones.",
      },
      {
        target: "workspace-people",
        title: "People and roles",
        body: "Owner, admin, member, and viewer each allow a different level of access. Owners and admins can change roles and remove members.",
      },
      {
        target: "workspace-invite",
        title: "Invite people",
        body: "An invitation is a link, not an email. The link is shown once, so copy it right away.",
      },
    ],
  },
  audit: {
    id: "audit",
    version: 2,
    title: "Audit",
    intro:
      "The audit log records permission changes, integration changes, and other important actions in this workspace. It never stores secrets.",
    tour: [
      {
        target: "audit-log",
        title: "Audit log",
        body: "Recent permission changes, integration changes, and important actions, with who made them. Only owners and admins can read this log.",
      },
    ],
  },
  settings: {
    id: "settings",
    version: 2,
    title: "Settings",
    intro:
      "Your profile, appearance, and notification choices. They apply only to your account.",
    tour: [
      {
        target: "settings-appearance",
        title: "Appearance",
        body: "Light or dark mode, the color palette, whether animations play, and how provider tiles look.",
      },
      {
        target: "settings-profile",
        title: "Profile",
        body: "Your display name and timezone. Password changes are in the form next to this one.",
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
    intro:
      "Search finds projects and tasks in the current workspace by name and text.",
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

// Pages whose first path segment is a list screen, but whose second segment
// is one record. Each maps to its own guide.
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
