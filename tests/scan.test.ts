// The decisions in spec/analysis.md and spec/cli.md, checked on what the real command prints for
// ./fixture and for small GitHub repositories answered in tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { createBrowserBackend } from '../src/browser.ts';
import { findSkills } from '../src/core/find.ts';
import { openGitHub } from '../src/core/github.ts';
import { parseSkill } from '../src/core/parse.ts';
import { scan } from '../src/core/scan.ts';
import { replay } from '../src/core/replay.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE, PINNED_COMMIT } from './helpers.ts';

const fixture = await atlas(['scan', FIXTURE]);
const example = await atlas(['scan', 'github.com/JetBrains/example']);
const linked = await atlas(['scan', 'github.com/JetBrains/linked']);

test('malformed front matter → the directory name, no description and a warning', () => {
  const parsed = parseSkill(readFileSync(join(FIXTURE, '.agents/skills/release-checklist/SKILL.md'), 'utf8'));
  assert.equal(parsed.name, undefined);
  assert.equal(parsed.description, '');
  assert.equal(
    parsed.warning,
    'malformed front matter: Nested mappings are not allowed in compact mappings at line 3, column 14; using the directory name',
  );
});

test('scan prints the repository, then each skill with its first sentence and pinned link', () => {
  assert.equal(example.code, 0, example.stderr);
  assert.equal(
    example.stdout,
    [
      'JetBrains/example · 1 skill',
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
    ].join('\n'),
  );
});

test('./fixture: every skill, sorted by name, linked to its file, with a warning for the malformed one', () => {
  const root = pathToFileURL(FIXTURE).href;
  assert.equal(fixture.code, 0);
  assert.equal(
    fixture.stdout,
    [
      'fixture · 4 skills',
      "code-style — Follow the project's code style.",
      `  ${root}/.github/skills/code-style/SKILL.md`,
      'commits — Write commit messages the way this repository does.',
      `  ${root}/.claude/skills/commits/SKILL.md`,
      'release-checklist',
      `  ${root}/.agents/skills/release-checklist/SKILL.md`,
      'tests — Run the tests before every push.',
      `  ${root}/.claude/skills/tests/SKILL.md`,
    ].join('\n'),
  );
  assert.equal(fixture.stderr, fixture.stderr.split('\n')[0]); // the malformed skill's warning only
  assert.match(fixture.stderr, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
});

test('symbolic link → only the file it points to', () => {
  // ./fixture links .claude/skills/code-style/SKILL.md and the directory .agents/skills/commits.
  assert.doesNotMatch(fixture.stdout, /\.claude\/skills\/code-style|\.agents\/skills\/commits/);
  // GitHub code search finds a linked SKILL.md as well; its directory's tree says it is a link.
  assert.equal(linked.code, 0, linked.stderr);
  assert.equal(linked.stderr, '');
  assert.equal(
    linked.stdout,
    [
      'JetBrains/linked · 1 skill',
      "code-style — Follow the project's code style.",
      `  https://github.com/JetBrains/linked/blob/${EXAMPLE_COMMIT}/.github/skills/code-style/SKILL.md`,
    ].join('\n'),
  );
});

test('skills in test directories are test data, not listed; a skill named like one is', () => {
  // ./fixture: src/jvmTest/… and plugins/markdown/test/testData/…; JetBrains/linked: src/jvmTest/….
  for (const output of [fixture.stdout, linked.stdout]) assert.doesNotMatch(output, /sample|jvmTest|testData/);
  assert.match(fixture.stdout, /^tests — /m);
  for (const path of [
    'src/test/resources/skills/x/SKILL.md',
    'tests/x/SKILL.md',
    'core/__tests__/x/SKILL.md',
    'testdata/x/SKILL.md',
    'module/src/commonTest/resources/x/SKILL.md',
    'module/src/androidUnitTest/x/SKILL.md',
    'module/src/integrationTest/x/SKILL.md',
    'app/MyAppTests/x/SKILL.md',
    'lib/src/testFixtures/x/SKILL.md',
    'web/fixtures/x/SKILL.md',
  ]) {
    assert.deepEqual(findSkills([path], 'repo'), [], path);
  }
  for (const path of ['.claude/skills/tests/SKILL.md', '.agents/skills/writing-tests/SKILL.md', 'contest/skills/x/SKILL.md', 'latest/x/SKILL.md']) {
    assert.equal(findSkills([path], 'repo').length, 1, path);
  }
});

test('<URL>/tree/<commit> → that commit, through its tree, a subtree at a time when too large', async () => {
  const pinned = await atlas(['scan', `https://github.com/JetBrains/pinned/tree/${PINNED_COMMIT}`]);
  assert.equal(pinned.code, 0, pinned.stderr);
  assert.equal(pinned.stderr, '');
  assert.equal(
    pinned.stdout,
    [
      'JetBrains/pinned · 2 skills',
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/pinned/blob/${PINNED_COMMIT}/.claude/skills/commits/SKILL.md`,
      'search — Search the code through MCP.',
      `  https://github.com/JetBrains/pinned/blob/${PINNED_COMMIT}/modules/mcp/skills/search/SKILL.md`,
    ].join('\n'),
  );

  const unknown = await atlas(['scan', 'https://github.com/JetBrains/pinned/tree/no-such-branch']);
  assert.equal(unknown.code, 1);
  assert.equal(unknown.stderr, 'Not found in https://github.com/JetBrains/pinned: no-such-branch');
});

test('a private repository → its files through the API, with the token', async () => {
  // raw.githubusercontent.com answers 404 for a private repository's files.
  const id = 'JetBrains/private';
  const path = '.claude/skills/commits/SKILL.md';
  const github = replay({
    [`https://api.github.com/repos/${id}`]: { status: 200, body: { full_name: id, default_branch: 'main' } },
    [`https://api.github.com/repos/${id}/commits/${EXAMPLE_COMMIT}`]: { status: 200, body: { sha: EXAMPLE_COMMIT } },
    [`https://api.github.com/repos/${id}/git/trees/${EXAMPLE_COMMIT}?recursive=1`]: {
      status: 200,
      body: { truncated: false, tree: [{ path, mode: '100644', type: 'blob', sha: 'x' }] },
    },
    [`https://raw.githubusercontent.com/${id}/${EXAMPLE_COMMIT}/${path}`]: { status: 404, body: '404: Not Found' },
    [`https://api.github.com/repos/${id}/contents/${path}?ref=${EXAMPLE_COMMIT}`]: {
      status: 200,
      body: '---\nname: commits\ndescription: Write commit messages.\n---\n',
    },
  });
  const source = await openGitHub(`https://github.com/${id}/tree/${EXAMPLE_COMMIT}`, { fetch: github, token: 'test' });
  const result = await scan(source);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(
    result.skills.map((skill) => [skill.name, skill.description]),
    [['commits', 'Write commit messages.']],
  );
});

test('the CLI prints the result at once and stores nothing', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const scanned = spawnSync(process.execPath, [CLI, 'scan', FIXTURE], { cwd, encoding: 'utf8' });
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.equal(scanned.stdout, `${fixture.stdout}\n`);
  assert.deepEqual(readdirSync(cwd), []);
});

test('unreachable repository → a clear message, exit code 1', async () => {
  const missing = spawnSync(process.execPath, [CLI, 'scan', join(FIXTURE, 'no-such-directory')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^Not a GitHub URL or a readable directory: .*no-such-directory\n$/);

  // What GitHub answers for a repository that does not exist.
  const notFound = replay({ 'https://api.github.com/repos/JetBrains/no-such-repository': { status: 404, body: { message: 'Not Found' } } });
  await assert.rejects(openGitHub('https://github.com/JetBrains/no-such-repository', { fetch: notFound }), {
    message: 'Repository not found: https://github.com/JetBrains/no-such-repository',
  });

  const offline = await atlas(['scan', 'https://github.com/JetBrains/not-answered']);
  assert.equal(offline.code, 1);
  assert.match(offline.stderr, /^Cannot reach GitHub: not recorded: https:\/\/api\.github\.com\/repos\/JetBrains\/not-answered$/);
});

test('rate limit → a message that asks for GITHUB_TOKEN', async () => {
  const limited = replay({
    'https://api.github.com/repos/JetBrains/MPS': {
      status: 403,
      body: { message: 'API rate limit exceeded for 192.0.2.1. (But here is the good news: ...)' },
    },
  });
  await assert.rejects(openGitHub('https://github.com/JetBrains/MPS', { fetch: limited }), {
    message: 'GitHub rate limit reached; set GITHUB_TOKEN',
  });
});

// scan --filter: spec/cli.md, "Filter".
const marked = (text: string) => `[${text}]`;

test('--filter keeps the skills with the text in their name, in any case, and counts them', async () => {
  const filtered = await atlas(['scan', FIXTURE, '--filter', 'COMMITS']);
  assert.equal(filtered.code, 0, filtered.stderr);
  assert.equal(
    filtered.stdout,
    [
      'fixture · 1 of 4 skills matches "COMMITS"',
      'commits — Write commit messages the way this repository does.',
      `  ${pathToFileURL(FIXTURE).href}/.claude/skills/commits/SKILL.md`,
    ].join('\n'),
  );
  // Warnings are not filtered.
  assert.match(filtered.stderr, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
});

test('--filter looks in the whole description, and prints it whole when the text is past the first sentence', async () => {
  const filtered = await atlas(['scan', FIXTURE, '--filter=kotlin']);
  assert.equal(filtered.code, 0, filtered.stderr);
  assert.equal(
    filtered.stdout,
    [
      'fixture · 1 of 4 skills matches "kotlin"',
      "code-style — Follow the project's code style. Use before committing Kotlin or Java changes.",
      `  ${pathToFileURL(FIXTURE).href}/.github/skills/code-style/SKILL.md`,
    ].join('\n'),
  );
});

test('--filter looks in the path, and highlights only the path in the link', async () => {
  const filtered = await atlas(['scan', FIXTURE, '--filter', '.agents/'], marked);
  assert.equal(filtered.code, 0, filtered.stderr);
  assert.equal(
    filtered.stdout,
    ['fixture · 1 of 4 skills matches ".agents/"', 'release-checklist', `  ${pathToFileURL(FIXTURE).href}/[.agents/]skills/release-checklist/SKILL.md`].join('\n'),
  );

  const example = await atlas(['scan', 'github.com/JetBrains/example', '--filter', 'claude/skills'], marked);
  assert.equal(example.code, 0, example.stderr);
  assert.equal(
    example.stdout,
    [
      'JetBrains/example · 1 of 1 skill matches "claude/skills"',
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.[claude/skills]/commits/SKILL.md`,
    ].join('\n'),
  );
});

test('--filter does not look in the rest of the link: the host, the owner, the commit, the directory', async () => {
  for (const filter of ['github', 'JetBrains', 'blob', EXAMPLE_COMMIT.slice(0, 7), 'ab']) {
    const example = await atlas(['scan', 'github.com/JetBrains/example', '--filter', filter]);
    assert.equal(example.stdout, `JetBrains/example · 0 of 1 skill match ${JSON.stringify(filter)}`);
  }
  // The x of "fixture", the scanned directory.
  assert.equal((await atlas(['scan', FIXTURE, '--filter', 'x'])).stdout, 'fixture · 0 of 4 skills match "x"');
});

test('--filter highlights a path as the link writes it, URL-encoded', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.claude/skills/my skill'), { recursive: true });
  writeFileSync(join(root, '.claude/skills/my skill/SKILL.md'), '---\nname: spaced\ndescription: A skill.\n---\n');
  const filtered = await atlas(['scan', root, '--filter', 'my skill'], marked);
  assert.equal(filtered.code, 0, filtered.stderr);
  assert.equal(filtered.stdout.split('\n')[2], `  ${pathToFileURL(root).href}/.claude/skills/[my%20skill]/SKILL.md`);
});

test('--filter is plain text: no match → no skills, exit code 0', async () => {
  const filtered = await atlas(['scan', FIXTURE, '--filter', '.*']);
  assert.equal(filtered.code, 0, filtered.stderr);
  assert.equal(filtered.stdout, 'fixture · 0 of 4 skills match ".*"');
});

test('--filter highlights every match in the name, description and link, as it is written', async () => {
  const filtered = await atlas(['scan', FIXTURE, '--filter', 'Code'], marked);
  assert.equal(filtered.code, 0, filtered.stderr);
  assert.equal(
    filtered.stdout,
    [
      'fixture · 1 of 4 skills matches "Code"',
      "[code]-style — Follow the project's [code] style.",
      `  ${pathToFileURL(FIXTURE).href}/.github/skills/[code]-style/SKILL.md`,
    ].join('\n'),
  );

  const committing = await atlas(['scan', FIXTURE, '--filter', 'commit'], marked);
  assert.equal(
    committing.stdout,
    [
      'fixture · 2 of 4 skills match "commit"',
      "code-style — Follow the project's code style. Use before [commit]ting Kotlin or Java changes.",
      `  ${pathToFileURL(FIXTURE).href}/.github/skills/code-style/SKILL.md`,
      '[commit]s — Write [commit] messages the way this repository does.',
      `  ${pathToFileURL(FIXTURE).href}/.claude/skills/[commit]s/SKILL.md`,
    ].join('\n'),
  );

  // Without --filter, nothing is highlighted.
  assert.equal((await atlas(['scan', FIXTURE], marked)).stdout, fixture.stdout);
});

test('the CLI highlights matches black on yellow where it shows colors, and not otherwise', () => {
  const { FORCE_COLOR, NO_COLOR, ...env } = process.env;
  const colored = spawnSync(process.execPath, [CLI, 'scan', FIXTURE, '--filter', 'commits'], { env: { ...env, FORCE_COLOR: '1' }, encoding: 'utf8' });
  assert.equal(colored.status, 0, colored.stderr);
  const yellow = (text: string) => `\x1b[30m\x1b[43m${text}\x1b[49m\x1b[39m`;
  assert.equal(
    colored.stdout.split('\n')[1],
    `${yellow('commits')} — Write commit messages the way this repository does.`,
  );

  const plain = spawnSync(process.execPath, [CLI, 'scan', FIXTURE, '--filter', 'commits'], { env: { ...env, NO_COLOR: '1' }, encoding: 'utf8' });
  assert.equal(plain.status, 0, plain.stderr);
  assert.doesNotMatch(plain.stdout, /\x1b/);
  assert.match(plain.stdout, /^fixture · 1 of 4 skills matches "commits"\ncommits — /);
});

test('--filter without a text, or twice → the usage, exit code 1', async () => {
  for (const args of [
    ['scan', FIXTURE, '--filter'],
    ['scan', FIXTURE, '--filter='],
    ['scan', FIXTURE, '--filter', 'a', '--filter', 'b'],
    ['scan', FIXTURE, '--filter', '--filter=x'],
    ['scan', FIXTURE, '--filter', '--filter', 'x'],
    ['scan', '--filter', 'a'],
  ]) {
    const failed = await atlas(args);
    assert.equal(failed.code, 1, args.join(' '));
    assert.equal(failed.stdout, '');
    assert.match(failed.stderr, /Usage: skill-atlas scan <GitHub URL \| directory> \[--filter <text>\]$/);
  }
  assert.match((await atlas(['help'])).stdout, /--filter <text>/);
});

test('the browser terminal takes a quoted --filter with spaces', async () => {
  const tree = `https://api.github.com/repos/JetBrains/example/git/trees/${EXAMPLE_COMMIT}?recursive=1`;
  const browser = createBrowserBackend({
    fetch: replay({
      'https://api.github.com/repos/JetBrains/example': { status: 200, body: { full_name: 'JetBrains/example', default_branch: 'main' } },
      'https://api.github.com/repos/JetBrains/example/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
      [tree]: { status: 200, body: { truncated: false, tree: [{ path: '.claude/skills/commits/SKILL.md', mode: '100644', type: 'blob', sha: 'x' }] } },
      [`https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`]: {
        status: 200,
        body: '---\nname: commits\ndescription: Write commit messages the way this repository does.\n---\n',
      },
    }),
  });
  for (const filter of ['--filter "commit messages"', "--filter 'commit messages'", '--filter="commit messages"', "--filter='commit messages'"]) {
    const output = await browser.run(`$ skill-atlas scan github.com/JetBrains/example ${filter}`);
    assert.match(output, /^JetBrains\/example · 1 of 1 skill matches "commit messages"\ncommits — /);
  }
  assert.match(await browser.run('scan github.com/JetBrains/example --filter "no such text"'), /· 0 of 1 skill match "no such text"$/);
  assert.match(await browser.run('scan github.com/JetBrains/example --filter ""'), /^--filter needs a text\n/);
});
