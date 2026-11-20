import { providerFetch } from "./http";
import { mapStatusFromProvider, mapStatusToProvider } from "./mappings";
import { ProviderError, type FieldMappings, type TaskStatus } from "./types";

const GQL = "https://api.github.com/graphql";

type GqlErrorBody = { data?: unknown; errors?: Array<{ message: string }> };

type StatusOption = { id: string; name: string };

type ProjectStatusInfo = {
  projectNodeId: string;
  projectTitle: string;
  itemId: string;
  statusFieldId: string;
  statusName: string | null;
  options: StatusOption[];
};

async function githubGraphql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await providerFetch(GQL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as GqlErrorBody;
  if (body.errors?.length) {
    const message = body.errors.map((error) => error.message).join("; ");
    const auth = /scope|permission|forbidden|unauthorized/i.test(message);
    throw new ProviderError(message, auth ? "unauthorized" : "validation", false, response.status);
  }
  if (!body.data) throw new ProviderError("GitHub GraphQL returned an empty response", "unavailable", true);
  return body.data as T;
}

function splitRepo(providerProjectId: string): { owner: string; name: string } {
  const [owner, name] = providerProjectId.split("/");
  if (!owner || !name) {
    throw new ProviderError("GitHub repository must look like owner/name", "validation", false);
  }
  return { owner, name };
}

type ProjectV2Node = { id: string; title: string; number: number; url: string };

type OwnerProjectNode = ProjectV2Node & {
  repositories?: { nodes: Array<{ nameWithOwner: string } | null> | null } | null;
};

function asProjectNodes(
  nodes: Array<ProjectV2Node | null> | null | undefined,
): ProjectV2Node[] {
  return (nodes ?? []).filter(
    (node): node is ProjectV2Node => Boolean(node?.id && node.url),
  );
}

/**
 * Lists GitHub Projects v2 boards for a repository.
 * Repo-linked boards come first. When `includeOwnerProjects` is true, also appends
 * org/user boards (linked-to-this-repo first, then the rest) so Manage/create can
 * pick org-level boards that repository.projectsV2 alone omits.
 */
export async function listRepositoryProjectsV2(
  token: string,
  providerProjectId: string,
  options?: { includeOwnerProjects?: boolean },
): Promise<ProjectV2Node[]> {
  const { owner, name } = splitRepo(providerProjectId);
  const fullName = `${owner}/${name}`;
  const includeOwner = Boolean(options?.includeOwnerProjects);

  if (!includeOwner) {
    const data = await githubGraphql<{
      repository: { projectsV2: { nodes: Array<ProjectV2Node | null> } } | null;
    }>(
      token,
      `query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          projectsV2(first: 20) {
            nodes { id title number url }
          }
        }
      }`,
      { owner, name },
    );
    return asProjectNodes(data.repository?.projectsV2.nodes);
  }

  const data = await githubGraphql<{
    repository: {
      projectsV2: { nodes: Array<ProjectV2Node | null> };
      owner: {
        projectsV2?: { nodes: Array<OwnerProjectNode | null> };
      } | null;
    } | null;
  }>(
    token,
    `query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        projectsV2(first: 20) {
          nodes { id title number url }
        }
        owner {
          ... on Organization {
            projectsV2(first: 40, orderBy: { field: UPDATED_AT, direction: DESC }) {
              nodes {
                id title number url
                repositories(first: 20) { nodes { nameWithOwner } }
              }
            }
          }
          ... on User {
            projectsV2(first: 40, orderBy: { field: UPDATED_AT, direction: DESC }) {
              nodes {
                id title number url
                repositories(first: 20) { nodes { nameWithOwner } }
              }
            }
          }
        }
      }
    }`,
    { owner, name },
  );

  const repoLinked = asProjectNodes(data.repository?.projectsV2.nodes);
  const ownerNodes = (data.repository?.owner?.projectsV2?.nodes ?? []).filter(
    (node): node is OwnerProjectNode => Boolean(node?.id && node.url),
  );
  const ownerLinked: ProjectV2Node[] = [];
  const ownerOther: ProjectV2Node[] = [];
  for (const node of ownerNodes) {
    const linked = (node.repositories?.nodes ?? []).some(
      (repo) => repo?.nameWithOwner?.toLowerCase() === fullName.toLowerCase(),
    );
    const entry = { id: node.id, title: node.title, number: node.number, url: node.url };
    if (linked) ownerLinked.push(entry);
    else ownerOther.push(entry);
  }

  const seen = new Set(repoLinked.map((board) => board.id));
  const merged = [...repoLinked];
  for (const board of [...ownerLinked, ...ownerOther]) {
    if (seen.has(board.id)) continue;
    seen.add(board.id);
    merged.push(board);
  }
  return merged;
}

/**
 * Picks a likely board when none is saved.
 * Only suggests when there is a single board, or a unique title match on a repo name token.
 */
export function suggestGithubBoard(
  boards: ProjectV2Node[],
  providerProjectId: string,
): ProjectV2Node | null {
  if (boards.length === 0) return null;
  if (boards.length === 1) return boards[0] ?? null;

  const shortName = providerProjectId.split("/")[1]?.toLowerCase() ?? "";
  const tokens = shortName
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 4);
  if (tokens.length === 0) return null;

  const matches = boards.filter((board) => {
    const title = board.title.toLowerCase();
    return tokens.some((token) => title.includes(token));
  });
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

export async function getGithubProjectUrl(
  token: string,
  projectNodeId: string,
): Promise<string | null> {
  const data = await githubGraphql<{
    node: { url?: string | null } | null;
  }>(
    token,
    `query($id: ID!) {
      node(id: $id) {
        ... on ProjectV2 { url }
      }
    }`,
    { id: projectNodeId },
  );
  return data.node?.url ?? null;
}

export async function resolveGithubProjectNodeId(
  token: string,
  providerProjectId: string,
  mappings: FieldMappings,
): Promise<string | null> {
  const configured = mappings.githubProjectNodeId?.trim();
  if (configured) return configured;
  const projects = await listRepositoryProjectsV2(token, providerProjectId);
  return projects[0]?.id ?? null;
}

async function loadProjectStatusField(
  token: string,
  projectNodeId: string,
): Promise<{ fieldId: string; options: StatusOption[] } | null> {
  const data = await githubGraphql<{
    node: {
      field: { id: string; options: StatusOption[] } | null;
    } | null;
  }>(
    token,
    `query($id: ID!) {
      node(id: $id) {
        ... on ProjectV2 {
          field(name: "Status") {
            ... on ProjectV2SingleSelectField {
              id
              options { id name }
            }
          }
        }
      }
    }`,
    { id: projectNodeId },
  );
  const field = data.node?.field;
  if (!field?.id) return null;
  return { fieldId: field.id, options: field.options ?? [] };
}

export async function getIssueProjectStatus(
  token: string,
  providerProjectId: string,
  issueNumber: number,
  projectNodeId: string,
): Promise<ProjectStatusInfo | null> {
  const { owner, name } = splitRepo(providerProjectId);
  const data = await githubGraphql<{
    repository: {
      issue: {
        id: string;
        projectItems: {
          nodes: Array<{
            id: string;
            project: { id: string; title: string };
            fieldValues: {
              nodes: Array<{
                name?: string;
                field?: { id?: string; name?: string } | null;
              } | null>;
            };
          } | null>;
        };
      } | null;
    } | null;
  }>(
    token,
    `query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        issue(number: $number) {
          id
          projectItems(first: 30) {
            nodes {
              id
              project { id title }
              fieldValues(first: 30) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field {
                      ... on ProjectV2SingleSelectField { id name }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { owner, name, number: issueNumber },
  );

  const issue = data.repository?.issue;
  if (!issue) return null;
  const item = (issue.projectItems.nodes ?? []).find((node) => node?.project?.id === projectNodeId);
  if (!item) return null;

  const statusValue = (item.fieldValues.nodes ?? []).find(
    (node) => node?.field?.name?.toLowerCase() === "status" && node.name,
  );
  const statusField = await loadProjectStatusField(token, projectNodeId);
  if (!statusField) return null;

  return {
    projectNodeId,
    projectTitle: item.project.title,
    itemId: item.id,
    statusFieldId: statusField.fieldId,
    statusName: statusValue?.name ?? null,
    options: statusField.options,
  };
}

function pickStatusOption(
  options: StatusOption[],
  atriumStatus: TaskStatus,
  mappings: FieldMappings,
): StatusOption | null {
  const mapped = mapStatusToProvider(mappings, atriumStatus).trim();
  const exact =
    options.find((option) => option.name === mapped)
    ?? options.find((option) => option.id === mapped)
    ?? options.find((option) => option.name.toLowerCase() === mapped.toLowerCase());
  if (exact) return exact;

  const aliases: Record<TaskStatus, string[]> = {
    open: ["todo", "backlog", "ready", "new", "triage", "open"],
    in_progress: ["in progress", "in_progress", "doing", "started", "progress"],
    blocked: ["blocked", "on hold", "waiting"],
    done: ["done", "complete", "completed", "finished", "closed"],
    cancelled: ["cancelled", "canceled", "won't do", "wont do", "duplicate"],
  };
  const wanted = aliases[atriumStatus];
  return (
    options.find((option) => wanted.some((alias) => option.name.toLowerCase() === alias))
    ?? options.find((option) => wanted.some((alias) => option.name.toLowerCase().includes(alias)))
    ?? null
  );
}

export function atriumStatusFromProjectName(
  statusName: string | null | undefined,
  mappings: FieldMappings,
  issueClosed: boolean,
): TaskStatus {
  if (statusName) return mapStatusFromProvider(mappings, statusName);
  return issueClosed ? mapStatusFromProvider(mappings, "closed") : mapStatusFromProvider(mappings, "open");
}

async function ensureProjectItem(
  token: string,
  projectNodeId: string,
  issueNodeId: string,
): Promise<string> {
  const data = await githubGraphql<{
    addProjectV2ItemById: { item: { id: string } | null } | null;
  }>(
    token,
    `mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }`,
    { projectId: projectNodeId, contentId: issueNodeId },
  );
  const itemId = data.addProjectV2ItemById?.item?.id;
  if (!itemId) throw new ProviderError("Could not add the issue to the GitHub Project", "unavailable", true);
  return itemId;
}

export async function setIssueProjectStatus(
  token: string,
  providerProjectId: string,
  issueNumber: number,
  issueNodeId: string | null,
  atriumStatus: TaskStatus,
  mappings: FieldMappings,
  projectNodeId: string,
): Promise<{ statusName: string; projectTitle: string } | null> {
  let info = await getIssueProjectStatus(token, providerProjectId, issueNumber, projectNodeId);
  if (!info) {
    if (!issueNodeId) return null;
    const itemId = await ensureProjectItem(token, projectNodeId, issueNodeId);
    const statusField = await loadProjectStatusField(token, projectNodeId);
    if (!statusField) return null;
    info = {
      projectNodeId,
      projectTitle: "",
      itemId,
      statusFieldId: statusField.fieldId,
      statusName: null,
      options: statusField.options,
    };
  }

  const option = pickStatusOption(info.options, atriumStatus, mappings);
  if (!option) {
    throw new ProviderError(
      `No GitHub Project Status option matches Atrium status "${atriumStatus}" (mapped as "${mapStatusToProvider(mappings, atriumStatus)}")`,
      "validation",
      false,
    );
  }

  await githubGraphql(
    token,
    `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: { singleSelectOptionId: $optionId }
        }
      ) {
        projectV2Item { id }
      }
    }`,
    {
      projectId: projectNodeId,
      itemId: info.itemId,
      fieldId: info.statusFieldId,
      optionId: option.id,
    },
  );

  return { statusName: option.name, projectTitle: info.projectTitle };
}

export async function resolveIssueFromNodeId(
  token: string,
  issueNodeId: string,
): Promise<{ providerProjectId: string; number: number; title: string; body: string; state: "open" | "closed"; url: string; updatedAt: string; labels: string[]; assignee: string | null; nodeId: string } | null> {
  const data = await githubGraphql<{
    node: {
      number: number;
      title: string;
      body?: string | null;
      state: string;
      url: string;
      updatedAt: string;
      id: string;
      repository: { nameWithOwner: string };
      labels: { nodes: Array<{ name: string } | null> };
      assignees: { nodes: Array<{ login: string } | null> };
    } | null;
  }>(
    token,
    `query($id: ID!) {
      node(id: $id) {
        ... on Issue {
          id
          number
          title
          body
          state
          url
          updatedAt
          repository { nameWithOwner }
          labels(first: 30) { nodes { name } }
          assignees(first: 1) { nodes { login } }
        }
      }
    }`,
    { id: issueNodeId },
  );
  const issue = data.node;
  if (!issue?.repository?.nameWithOwner) return null;
  return {
    providerProjectId: issue.repository.nameWithOwner,
    number: issue.number,
    title: issue.title,
    body: issue.body ?? "",
    state: issue.state?.toLowerCase() === "closed" ? "closed" : "open",
    url: issue.url,
    updatedAt: issue.updatedAt,
    labels: (issue.labels.nodes ?? []).map((node) => node?.name).filter((name): name is string => Boolean(name)),
    assignee: issue.assignees.nodes[0]?.login ?? null,
    nodeId: issue.id,
  };
}
