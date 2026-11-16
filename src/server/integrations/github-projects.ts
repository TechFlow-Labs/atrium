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

export async function listRepositoryProjectsV2(
  token: string,
  providerProjectId: string,
): Promise<Array<{ id: string; title: string; number: number }>> {
  const { owner, name } = splitRepo(providerProjectId);
  const data = await githubGraphql<{
    repository: { projectsV2: { nodes: Array<{ id: string; title: string; number: number } | null> } } | null;
  }>(
    token,
    `query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        projectsV2(first: 20) {
          nodes { id title number }
        }
      }
    }`,
    { owner, name },
  );
  return (data.repository?.projectsV2.nodes ?? []).filter(
    (node): node is { id: string; title: string; number: number } => Boolean(node?.id),
  );
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
