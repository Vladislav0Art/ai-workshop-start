// The decisions in spec/analysis.md and spec/cli.md, checked on what the real command prints for
// ./fixture and for small GitHub repositories answered in tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { findSkills } from '../src/core/find.ts';
import { openGitHub } from '../src/core/github.ts';
import { parseSkill } from '../src/core/parse.ts';
import { replay } from '../src/core/replay.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE } from './helpers.ts';

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
