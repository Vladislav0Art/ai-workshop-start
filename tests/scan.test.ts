// The decisions in spec/analysis.md and spec/cli.md, checked on what the real command prints for
// ./fixture and for a small GitHub repository answered in tests/helpers.ts. The edge cases of
// where skills live are yours to add.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { openGitHub } from '../src/core/github.ts';
import { parseSkill } from '../src/core/parse.ts';
import { replay } from '../src/core/replay.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE } from './helpers.ts';

const fixture = await atlas(['scan', FIXTURE]);
const example = await atlas(['scan', 'github.com/JetBrains/example']);

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
      'fixture · 3 skills',
      "code-style — Follow the project's code style.",
      `  ${root}/.github/skills/code-style/SKILL.md`,
      'commits — Write commit messages the way this repository does.',
      `  ${root}/.claude/skills/commits/SKILL.md`,
      'release-checklist',
      `  ${root}/.agents/skills/release-checklist/SKILL.md`,
    ].join('\n'),
  );
  assert.match(fixture.stderr, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
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
      'fixture · 1 of 3 skills matches "COMMITS"',
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
      'fixture · 1 of 3 skills matches "kotlin"',
      "code-style — Follow the project's code style. Use before committing Kotlin or Java changes.",
      `  ${pathToFileURL(FIXTURE).href}/.github/skills/code-style/SKILL.md`,
    ].join('\n'),
  );
});

test('--filter looks in the link', async () => {
  const filtered = await atlas(['scan', FIXTURE, '--filter', '.agents/']);
  assert.equal(filtered.code, 0, filtered.stderr);
  assert.equal(
    filtered.stdout,
    ['fixture · 1 of 3 skills matches ".agents/"', 'release-checklist', `  ${pathToFileURL(FIXTURE).href}/.agents/skills/release-checklist/SKILL.md`].join('\n'),
  );

  const example = await atlas(['scan', 'github.com/JetBrains/example', '--filter', EXAMPLE_COMMIT.slice(0, 7)]);
  assert.equal(example.code, 0, example.stderr);
  assert.match(example.stdout, /^JetBrains\/example · 1 of 1 skill matches "5ab6270"\ncommits — /);
});

test('--filter is plain text: no match → no skills, exit code 0', async () => {
  const filtered = await atlas(['scan', FIXTURE, '--filter', '.*']);
  assert.equal(filtered.code, 0, filtered.stderr);
  assert.equal(filtered.stdout, 'fixture · 0 of 3 skills match ".*"');
});

test('--filter highlights every match in the name, description and link, as it is written', async () => {
  const filtered = await atlas(['scan', FIXTURE, '--filter', 'Code'], marked);
  assert.equal(filtered.code, 0, filtered.stderr);
  assert.equal(
    filtered.stdout,
    [
      'fixture · 1 of 3 skills matches "Code"',
      "[code]-style — Follow the project's [code] style.",
      `  ${pathToFileURL(FIXTURE).href}/.github/skills/[code]-style/SKILL.md`,
    ].join('\n'),
  );

  const committing = await atlas(['scan', FIXTURE, '--filter', 'commit'], marked);
  assert.equal(
    committing.stdout,
    [
      'fixture · 2 of 3 skills match "commit"',
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
  assert.match(plain.stdout, /^fixture · 1 of 3 skills matches "commits"\ncommits — /);
});

test('--filter without a text, or twice → the usage, exit code 1', async () => {
  for (const args of [
    ['scan', FIXTURE, '--filter'],
    ['scan', FIXTURE, '--filter='],
    ['scan', FIXTURE, '--filter', 'a', '--filter', 'b'],
    ['scan', '--filter', 'a'],
  ]) {
    const failed = await atlas(args);
    assert.equal(failed.code, 1, args.join(' '));
    assert.equal(failed.stdout, '');
    assert.match(failed.stderr, /Usage: skill-atlas scan <GitHub URL \| directory> \[--filter <text>\]$/);
  }
  assert.match((await atlas(['help'])).stdout, /--filter <text>/);
});
