import { AtlasError } from './errors.ts';
import { SKILL_ROOTS } from './find.ts';
import { encodePath } from './model.ts';
import type { Source } from './scan.ts';

/** The part of `fetch` the core uses, so tests and the browser can pass their own. */
export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export type GitHubOptions = {
  fetch: Fetch;
  /**
   * With a token, skills on the default branch are found through code search, a tree too large
   * for one answer is listed a subtree at a time, and a private repository's files are read
   * through the API; without it, through the tree.
   */
  token?: string;
  /** False in a page: GitHub answers code search without CORS headers, so a browser blocks it. */
  codeSearch?: boolean;
};

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

/**
 * `https://github.com/owner/repo`, with or without the scheme, a trailing slash or `.git`;
 * `…/tree/<commit>` for a commit, or a branch, of one's own.
 */
export function parseGitHubUrl(input: string): { owner: string; repo: string; ref?: string } | undefined {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/(.+?))?\/?$/i.exec(
    input.trim(),
  );
  if (!match) return undefined;
  return match[3] ? { owner: match[1], repo: match[2], ref: match[3] } : { owner: match[1], repo: match[2] };
}

/** Resolves the commit in the URL, else the default branch, and lists the files that may be skills. */
export async function openGitHub(input: string, options: GitHubOptions): Promise<Source> {
  const name = parseGitHubUrl(input);
  if (!name) throw new AtlasError(`Not a GitHub repository URL: ${input}`);
  const github = client(options);
  const info = await github.json<{ full_name: string; default_branch: string }>(
    `${API}/repos/${name.owner}/${name.repo}`,
    `Repository not found: https://github.com/${name.owner}/${name.repo}`,
  );
  const id = info.full_name;
  const ref = name.ref ?? info.default_branch;
  const { sha } = await github.json<{ sha: string }>(
    `${API}/repos/${id}/commits/${encodePath(ref)}`,
    `Not found in https://github.com/${id}: ${ref}`,
  );
  const warnings: string[] = [];
  // Code search sees only the default branch's latest commit; any other is listed through its tree.
  const paths =
    options.token && options.codeSearch !== false && !name.ref
      ? await withoutLinks(github, id, sha, await searchPaths(github, id))
      : await treePaths(github, id, sha, warnings, Boolean(options.token));
  const [organization, repo] = id.split('/');
  return {
    repository: { id, organization, name: repo, url: `https://github.com/${id}`, commit: sha },
    paths,
    warnings,
    // raw.githubusercontent.com costs no API request, but answers 404 for a private repository's
    // files, and a page cannot send it a token: those are read through the API.
    read: async (path) =>
      (await github.raw(`${RAW}/${id}/${sha}/${encodePath(path)}`)) ??
      (options.token ? github.file(`${API}/repos/${id}/contents/${encodePath(path)}?ref=${sha}`) : undefined),
  };
}

/** Code search looks at the whole default branch, 100 results a page. */
async function searchPaths(github: Client, id: string): Promise<string[]> {
  const paths = new Set<string>(); // pages can repeat a result
  // GitHub returns at most 1000 results: ten pages.
  for (let page = 1; page <= 10; page++) {
    const result = await github.json<{ total_count: number; items: { path: string }[] }>(
      `${API}/search/code?q=filename:SKILL.md+repo:${id}&per_page=100&page=${page}`,
    );
    for (const item of result.items) paths.add(item.path);
    if (result.items.length < 100 || page * 100 >= result.total_count) break;
  }
  return [...paths];
}

/**
 * Code search finds symbolic links too, and cannot tell them apart: each SKILL.md's directory
 * tree, at the commit, says which ones are. The directories are asked for at the same time.
 */
async function withoutLinks(github: Client, id: string, sha: string, paths: string[]): Promise<string[]> {
  const kept = await Promise.all(
    paths.map(async (path) => {
      const slash = path.lastIndexOf('/');
      const tree = slash < 0 ? sha : `${sha}:${encodePath(path.slice(0, slash))}`;
      // Not at the scanned commit: kept, and reading it says so.
      const listing = await github.optional<Tree>(`${API}/repos/${id}/git/trees/${tree}`);
      const name = path.slice(slash + 1);
      return listing?.tree.some((item) => item.path === name && item.mode === LINK) ? [] : [path];
    }),
  );
  return kept.flat();
}

/** A symbolic link's mode in a Git tree. */
const LINK = '120000';

type Tree = { truncated: boolean; tree: { path: string; mode: string; type: string; sha: string }[] };

/**
 * The whole tree at once. When it is too large for one answer: `split`, a subtree at a time;
 * else only the skill roots, which costs fewer requests.
 */
async function treePaths(github: Client, id: string, sha: string, warnings: string[], split: boolean): Promise<string[]> {
  const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}?recursive=1`);
  if (!tree.truncated) return files(tree);
  if (split) return subtreePaths(github, id, sha, '');
  warnings.push(`the tree is too large to list at once; looked only in ${SKILL_ROOTS.join(', ')} (GITHUB_TOKEN searches everywhere)`);
  const paths: string[] = [];
  for (const root of SKILL_ROOTS) {
    const rootSha = await directory(github, id, sha, root);
    if (!rootSha) continue;
    const subtree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${rootSha}?recursive=1`);
    paths.push(...files(subtree).map((path) => `${root}/${path}`));
  }
  return paths;
}

/** One level of a tree, then each subtree at once; a subtree too large for one answer is split again. */
async function subtreePaths(github: Client, id: string, sha: string, prefix: string): Promise<string[]> {
  const level = await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}`);
  const lists = await Promise.all(
    level.tree.map(async (item) => {
      const path = `${prefix}${item.path}`;
      if (item.type !== 'tree') return item.type === 'blob' && item.mode !== LINK ? [path] : [];
      const subtree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${item.sha}?recursive=1`);
      if (subtree.truncated) return subtreePaths(github, id, item.sha, `${path}/`);
      return files(subtree).map((file) => `${path}/${file}`);
    }),
  );
  return lists.flat();
}

/** Walks down one level at a time; the directory's tree, or undefined if it does not exist. */
async function directory(github: Client, id: string, sha: string, path: string): Promise<string | undefined> {
  let current = sha;
  for (const segment of path.split('/')) {
    const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${current}`);
    const entry = tree.tree.find((item) => item.path === segment && item.type === 'tree');
    if (!entry) return undefined;
    current = entry.sha;
  }
  return current;
}

/** Regular files only: a symbolic link's content is its target, not a SKILL.md. */
function files(tree: Tree): string[] {
  return tree.tree.filter((item) => item.type === 'blob' && item.mode !== LINK).map((item) => item.path);
}

type Client = ReturnType<typeof client>;

function client({ fetch, token }: GitHubOptions) {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const answers = new Map<string, Promise<unknown>>(); // the root tree is asked for once per skill root

  async function get(url: string, init?: { headers: Record<string, string> }): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      throw new AtlasError(`Cannot reach GitHub: ${describe(error)}`);
    }
  }

  /** Without `notFound`, a 404 is undefined. */
  async function request(url: string, notFound?: string): Promise<unknown> {
    const response = await get(url, { headers });
    if (response.ok) return response.json();
    return failure(url, response, notFound);
  }

  async function failure(url: string, response: Response, notFound?: string): Promise<undefined> {
    const body: unknown = await response.json().catch(() => undefined);
    const message = (body as { message?: unknown } | undefined)?.message;
    const text = typeof message === 'string' ? message : '';
    // 422: no such commit, branch or tag.
    if (response.status === 404 || (response.status === 422 && /no commit found/i.test(text))) {
      if (notFound === undefined) return undefined;
      throw new AtlasError(notFound);
    }
    if ((response.status === 403 || response.status === 429) && /rate limit/i.test(text)) {
      throw new AtlasError(`GitHub rate limit reached; ${token ? 'try again in a minute' : 'set GITHUB_TOKEN'}`);
    }
    if (response.status === 401) throw new AtlasError('GitHub rejected the token in GITHUB_TOKEN');
    throw new AtlasError(`GitHub answered ${response.status} for ${url}${text && `: ${text}`}`);
  }

  return {
    /** A GitHub API answer; `notFound` explains a 404. */
    json<T>(url: string, notFound = `Not found on GitHub: ${url}`): Promise<T> {
      if (!answers.has(url)) answers.set(url, request(url, notFound));
      return answers.get(url) as Promise<T>;
    },
    /** A GitHub API answer, or undefined for a 404. */
    optional<T>(url: string): Promise<T | undefined> {
      const key = `optional ${url}`;
      if (!answers.has(key)) answers.set(key, request(url));
      return answers.get(key) as Promise<T | undefined>;
    },
    /** A file's bytes through the API, as they are; undefined for a 404. */
    async file(url: string): Promise<Uint8Array | undefined> {
      const response = await get(url, { headers: { ...headers, Accept: 'application/vnd.github.raw+json' } });
      if (!response.ok) return failure(url, response);
      return new Uint8Array(await response.arrayBuffer());
    },
    /** A file's bytes at the scanned commit, or undefined if it is not there. */
    async raw(url: string): Promise<Uint8Array | undefined> {
      const response = await get(url);
      if (response.status === 404) return undefined;
      if (!response.ok) throw new AtlasError(`GitHub answered ${response.status} for ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}
