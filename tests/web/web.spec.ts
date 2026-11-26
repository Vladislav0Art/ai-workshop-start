// The cases in spec/web.md, on the real page in a browser. GitHub answers from recordings: the
// files of ./fixture as JetBrains/fixture, through the tree, since the page has no token. Its
// symbolic links and test data are not skills, so the page shows 4 of them.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Recording } from '../../src/core/replay.ts';
import { EXAMPLE_COMMIT as COMMIT, FIXTURE } from '../helpers.ts';

const API = 'https://api.github.com/repos';
const RAW = 'https://raw.githubusercontent.com';

/** What GitHub answers for `owner/name` with these files, and these symbolic links, at COMMIT. */
function repository(
  id: string,
  files: Record<string, string>,
  options: { truncated?: boolean; links?: string[] } = {},
): Recording {
  const blobs = Object.keys(files).map((path) => ({ path, mode: '100644', type: 'blob', sha: path }));
  const links = (options.links ?? []).map((path) => ({ path, mode: '120000', type: 'blob', sha: path }));
  const recording: Recording = {
    [`${API}/${id}`]: { status: 200, body: { full_name: id, default_branch: 'main' } },
    [`${API}/${id}/commits/main`]: { status: 200, body: { sha: COMMIT } },
    [`${API}/${id}/git/trees/${COMMIT}?recursive=1`]: {
      status: 200,
      body: {
        truncated: !!options.truncated,
        tree: [...blobs, ...links],
      },
    },
  };
  for (const [path, text] of Object.entries(files)) recording[`${RAW}/${id}/${COMMIT}/${path}`] = { status: 200, body: text };
  return recording;
}

/**
 * ./fixture as JetBrains/fixture, the way Git stores it: a symbolic link is one entry of its own,
 * and nothing under a linked directory is a file of the repository.
 */
function fixture(): Recording {
  const files: Record<string, string> = {};
  const links: string[] = [];
  for (const entry of readdirSync(FIXTURE, { recursive: true, withFileTypes: true })) {
    const path = relative(FIXTURE, join(entry.parentPath, entry.name)).split(sep).join('/');
    if (entry.isSymbolicLink()) links.push(path);
    else if (entry.isFile()) files[path] = readFileSync(join(FIXTURE, path), 'utf8');
  }
  // Recursive readdir follows a linked directory: what it found there is the link's target.
  for (const path of Object.keys(files)) if (links.some((link) => path.startsWith(`${link}/`))) delete files[path];
  return repository('JetBrains/fixture', files, { links });
}

/** GitHub, for this page, answers from the recording; anything else does not reach the network. */
async function github(page: Page, recording: Recording) {
  const requests: string[] = [];
  await page.route(/^https:\/\/(api\.github\.com|raw\.githubusercontent\.com)\//, async (route) => {
    const url = route.request().url();
    requests.push(url);
    const answer = recording[url];
    if (!answer) return route.abort('internetdisconnected');
    await route.fulfill({
      status: answer.status,
      headers: { 'access-control-allow-origin': '*' },
      body: typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body),
    });
  });
  return requests;
}

async function scan(page: Page, url: string) {
  await page.goto('/');
  await page.getByLabel('GitHub repository URL').fill(url);
  await page.getByRole('button', { name: 'Scan' }).click();
}

const errorBox = (page: Page) => page.getByRole('alert').filter({ hasText: 'Cannot scan the repository' });

test('a pasted link → the repository, then each skill by name with its first sentence and pinned link', async ({ page }) => {
  await github(page, fixture());
  await scan(page, 'https://github.com/JetBrains/fixture');

  const skills = page.getByRole('region', { name: 'Skills' });
  await expect(skills.getByRole('heading', { name: 'JetBrains/fixture' })).toBeVisible();
  await expect(page.getByTestId('skill-count')).toHaveText('4 skills');
  await expect(skills.getByText(COMMIT.slice(0, 7))).toBeVisible();

  const cards = page.getByTestId('skill');
  await expect(cards.getByRole('heading')).toHaveText(['code-style', 'commits', 'release-checklist', 'tests']);
  await expect(cards.nth(0)).toContainText("Follow the project's code style.");
  await expect(cards.nth(1)).toContainText('Write commit messages the way this repository does.');
  await expect(cards.nth(1)).not.toContainText('Use for every commit');
  await expect(cards.nth(1).getByRole('link', { name: 'Open commits on GitHub' })).toHaveAttribute(
    'href',
    `https://github.com/JetBrains/fixture/blob/${COMMIT}/.claude/skills/commits/SKILL.md`,
  );
  await expect(cards.nth(1)).toContainText('.claude/skills/commits/SKILL.md');
});

test('malformed front matter → the directory name, no description, a warning; the scan goes on', async ({ page }) => {
  await github(page, fixture());
  await scan(page, 'github.com/JetBrains/fixture');

  const malformed = page.getByTestId('skill').filter({ hasText: 'release-checklist' });
  await expect(malformed.getByRole('heading')).toHaveText('release-checklist');
  await expect(malformed.locator('[data-slot="card-description"]')).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: 'Warning' })).toContainText(
    '.agents/skills/release-checklist/SKILL.md: malformed front matter: ',
  );
  await expect(page.getByTestId('skill')).toHaveCount(4);
});

test('a tree too large to list → only the skill roots, with a warning', async ({ page }) => {
  const id = 'JetBrains/large';
  const recording = repository(id, { 'README.md': '# Large\n' }, { truncated: true });
  const root = { path: '.claude', mode: '040000', type: 'tree', sha: 'claude' };
  recording[`${API}/${id}/git/trees/${COMMIT}`] = { status: 200, body: { truncated: false, tree: [root] } };
  recording[`${API}/${id}/git/trees/claude`] = {
    status: 200,
    body: { truncated: false, tree: [{ path: 'skills', mode: '040000', type: 'tree', sha: 'skills' }] },
  };
  recording[`${API}/${id}/git/trees/skills?recursive=1`] = {
    status: 200,
    body: { truncated: false, tree: [{ path: 'deploy/SKILL.md', mode: '100644', type: 'blob', sha: 'x' }] },
  };
  recording[`${RAW}/${id}/${COMMIT}/.claude/skills/deploy/SKILL.md`] = {
    status: 200,
    body: '---\nname: deploy\ndescription: Deploys it.\n---\n',
  };
  await github(page, recording);
  await scan(page, `https://github.com/${id}`);

  await expect(page.getByTestId('skill').getByRole('heading')).toHaveText(['deploy']);
  await expect(page.getByRole('alert').filter({ hasText: 'Warning' })).toContainText('the tree is too large to list at once');
});

test('no SKILL.md → says so', async ({ page }) => {
  await github(page, repository('JetBrains/empty', { 'README.md': '# Empty\n' }));
  await scan(page, 'https://github.com/JetBrains/empty');
  await expect(page.getByTestId('skill-count')).toHaveText('0 skills');
  await expect(page.getByText('No SKILL.md in this repository.')).toBeVisible();
});

test('?repo= in the address scans at once, and nothing is stored', async ({ page }) => {
  await github(page, fixture());
  await page.goto(`/?repo=${encodeURIComponent('https://github.com/JetBrains/fixture')}`);
  await expect(page.getByLabel('GitHub repository URL')).toHaveValue('https://github.com/JetBrains/fixture');
  await expect(page.getByTestId('skill')).toHaveCount(4);

  const { cookies, origins } = await page.context().storageState();
  expect(cookies).toEqual([]);
  expect(origins).toEqual([]); // no localStorage
  expect(await page.evaluate('sessionStorage.length')).toBe(0);
});

test('a scan puts the repository in the address', async ({ page }) => {
  await github(page, fixture());
  await scan(page, 'https://github.com/JetBrains/fixture');
  await expect(page.getByTestId('skill')).toHaveCount(4);
  expect(new URL(page.url()).searchParams.get('repo')).toBe('https://github.com/JetBrains/fixture');
});

test('not a GitHub URL → a clear message, nothing asked of GitHub', async ({ page }) => {
  const requests = await github(page, {});
  await scan(page, 'https://gitlab.com/JetBrains/kotlin');
  await expect(errorBox(page)).toContainText('Not a GitHub repository URL: https://gitlab.com/JetBrains/kotlin');
  expect(requests).toEqual([]);
});

test('repository not found → a clear message', async ({ page }) => {
  await github(page, { [`${API}/JetBrains/no-such-repository`]: { status: 404, body: { message: 'Not Found' } } });
  await scan(page, 'https://github.com/JetBrains/no-such-repository');
  await expect(errorBox(page)).toContainText('Repository not found: https://github.com/JetBrains/no-such-repository');
});

test('GitHub unreachable → a clear message', async ({ page }) => {
  await github(page, {});
  await scan(page, 'https://github.com/JetBrains/not-answered');
  await expect(errorBox(page)).toContainText('Cannot reach GitHub: ');
});

test('rate limit → a clear message', async ({ page }) => {
  await github(page, {
    [`${API}/JetBrains/MPS`]: { status: 403, body: { message: 'API rate limit exceeded for 192.0.2.1.' } },
  });
  await scan(page, 'https://github.com/JetBrains/MPS');
  await expect(errorBox(page)).toContainText('GitHub rate limit reached');
});
