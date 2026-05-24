/**
 * GitHub Automation Package
 * 
 * PR automation, issue management, and CI helpers.
 */

import { z } from 'zod';

// Input schemas
export const CreatePRSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  title: z.string(),
  body: z.string(),
  head: z.string(),
  base: z.string().default('main'),
});

export const ListIssuesSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  state: z.enum(['open', 'closed', 'all']).default('open'),
  labels: z.string().optional(),
});

export const AddIssueCommentSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  issueNumber: z.number(),
  body: z.string(),
});

// GitHub API helpers using raw fetch (no external deps)
const GITHUB_API = 'https://api.github.com';

async function ghFetch(path: string, options: RequestInit = {}) {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(options.headers as Record<string, string>),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${error}`);
  }
  
  return response.json();
}

// Create a pull request
export async function createPR(input: z.infer<typeof CreatePRSchema>) {
  const { owner, repo, title, body, head, base } = CreatePRSchema.parse(input);
  
  return ghFetch(`/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, head, base }),
  });
}

// List issues
export async function listIssues(input: z.infer<typeof ListIssuesSchema>) {
  const { owner, repo, state, labels } = ListIssuesSchema.parse(input);
  
  const params = new URLSearchParams({ state });
  if (labels) params.set('labels', labels);
  
  return ghFetch(`/repos/${owner}/${repo}/issues?${params}`);
}

// Add issue comment
export async function addIssueComment(input: z.infer<typeof AddIssueCommentSchema>) {
  const { owner, repo, issueNumber, body } = AddIssueCommentSchema.parse(input);
  
  return ghFetch(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
}

// Get repository info
export async function getRepoInfo(owner: string, repo: string) {
  return ghFetch(`/repos/${owner}/${repo}`);
}

// Get workflow runs
export async function getWorkflowRuns(owner: string, repo: string) {
  return ghFetch(`/repos/${owner}/${repo}/actions/runs`);
}

// Re-run a workflow
export async function rerunWorkflow(owner: string, repo: string, runId: number) {
  return ghFetch(`/repos/${owner}/${repo}/actions/runs/${runId}/rerun`, {
    method: 'POST',
  });
}

// Export schemas for validation
export const schemas = {
  createPR: CreatePRSchema,
  listIssues: ListIssuesSchema,
  addIssueComment: AddIssueCommentSchema,
};