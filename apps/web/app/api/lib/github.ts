/**
 * GitHub API utility for working with docs repository without cloning
 */

const GITHUB_API = 'https://api.github.com';

export interface GitHubFile {
  content: string;
  sha: string;
}

/**
 * Fetch a file from the docs repository
 */
export async function fetchFile(
  githubToken: string,
  repo: string,
  filePath: string,
  branch: string = 'main'
): Promise<GitHubFile> {
  const url = `${GITHUB_API}/repos/${repo}/contents/${filePath}?ref=${branch}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch file ${filePath}: ${response.status} ${error}`);
  }

  const data = await response.json();

  // Decode base64 content
  const content = Buffer.from(data.content, 'base64').toString('utf-8');

  return {
    content,
    sha: data.sha,
  };
}

/**
 * Get the SHA of the default branch (main)
 */
export async function getBranchSha(
  githubToken: string,
  repo: string,
  branch: string = 'main'
): Promise<string> {
  const url = `${GITHUB_API}/repos/${repo}/git/ref/heads/${branch}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get branch SHA: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.object.sha;
}

/**
 * Create a new branch
 */
export async function createBranch(
  githubToken: string,
  repo: string,
  branchName: string,
  fromSha: string
): Promise<void> {
  const url = `${GITHUB_API}/repos/${repo}/git/refs`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: fromSha,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create branch: ${response.status} ${error}`);
  }
}

/**
 * Update a file via GitHub API
 */
export async function updateFile(
  githubToken: string,
  repo: string,
  filePath: string,
  content: string,
  message: string,
  branch: string,
  sha: string
): Promise<void> {
  const url = `${GITHUB_API}/repos/${repo}/contents/${filePath}`;

  // Encode content as base64
  const encodedContent = Buffer.from(content, 'utf-8').toString('base64');

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      content: encodedContent,
      sha,
      branch,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update file: ${response.status} ${error}`);
  }
}

/**
 * Create a pull request
 */
export async function createPullRequest(
  githubToken: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string = 'main'
): Promise<{ url: string; number: number }> {
  const url = `${GITHUB_API}/repos/${repo}/pulls`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      body,
      head,
      base,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create PR: ${response.status} ${error}`);
  }

  const data = await response.json();
  return {
    url: data.html_url,
    number: data.number,
  };
}

/**
 * Reset branch to match base branch (equivalent to git reset --hard origin/main)
 */
export async function resetBranch(
  githubToken: string,
  repo: string,
  branch: string,
  toSha: string
): Promise<void> {
  const url = `${GITHUB_API}/repos/${repo}/git/refs/heads/${branch}`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sha: toSha,
      force: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to reset branch: ${response.status} ${error}`);
  }
}
