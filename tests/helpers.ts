// Runs the commands the way the CLI does, with GitHub answering from EXAMPLE and LINKED below.
import { fileURLToPath } from 'node:url';
import { run } from '../src/commands.ts';
import { openGitHub, parseGitHubUrl } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { openDirectory } from '../src/local.ts';

export const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));
export const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

/** The commit GitHub answers for JetBrains/example. */
export const EXAMPLE_COMMIT = '5ab6270ab772d113e8ad52ebfcaa0109c522ae00';

/** A SKILL.md's directory at the commit, as the trees API lists it: mode 120000 is a symbolic link. */
const tree = (mode: string) => ({ status: 200, body: { truncated: false, tree: [{ path: 'SKILL.md', mode, type: 'blob', sha: '0' }] } });

/** What GitHub answers for a small repository, JetBrains/example, with one skill. */
const EXAMPLE: Recording = {
  'https://api.github.com/repos/JetBrains/example': { status: 200, body: { full_name: 'JetBrains/example', default_branch: 'main' } },
  'https://api.github.com/repos/JetBrains/example/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
  'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/example&per_page=100&page=1': {
    status: 200,
    body: { total_count: 1, items: [{ path: '.claude/skills/commits/SKILL.md' }] },
  },
  [`https://api.github.com/repos/JetBrains/example/git/trees/${EXAMPLE_COMMIT}:.claude/skills/commits`]: tree('100644'),
  [`https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`]: {
    status: 200,
    body: '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n',
  },
};

/**
 * JetBrains/linked: code search finds one skill, a symbolic link to it from another agent's
 * folder, and a skill in a test source set.
 */
const LINKED: Recording = {
  'https://api.github.com/repos/JetBrains/linked': { status: 200, body: { full_name: 'JetBrains/linked', default_branch: 'main' } },
  'https://api.github.com/repos/JetBrains/linked/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
  'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/linked&per_page=100&page=1': {
    status: 200,
    body: {
      total_count: 3,
      items: [
        { path: '.claude/skills/code-style/SKILL.md' },
        { path: '.github/skills/code-style/SKILL.md' },
        { path: 'src/jvmTest/resources/skills/sample/SKILL.md' },
      ],
    },
  },
  [`https://api.github.com/repos/JetBrains/linked/git/trees/${EXAMPLE_COMMIT}:.claude/skills/code-style`]: tree('120000'),
  [`https://api.github.com/repos/JetBrains/linked/git/trees/${EXAMPLE_COMMIT}:.github/skills/code-style`]: tree('100644'),
  [`https://api.github.com/repos/JetBrains/linked/git/trees/${EXAMPLE_COMMIT}:src/jvmTest/resources/skills/sample`]: tree('100644'),
  // A symbolic link's content is its target.
  [`https://raw.githubusercontent.com/JetBrains/linked/${EXAMPLE_COMMIT}/.claude/skills/code-style/SKILL.md`]: {
    status: 200,
    body: '../../../.github/skills/code-style/SKILL.md',
  },
  [`https://raw.githubusercontent.com/JetBrains/linked/${EXAMPLE_COMMIT}/.github/skills/code-style/SKILL.md`]: {
    status: 200,
    body: "---\nname: code-style\ndescription: Follow the project's code style. Use before committing.\n---\n",
  },
  [`https://raw.githubusercontent.com/JetBrains/linked/${EXAMPLE_COMMIT}/src/jvmTest/resources/skills/sample/SKILL.md`]: {
    status: 200,
    body: '---\nname: sample\ndescription: A skill the tests read.\n---\n',
  },
};

const github = replay({ ...EXAMPLE, ...LINKED });

/** `skill-atlas <args>`, as the CLI runs it, with GitHub answering from EXAMPLE and LINKED. */
export async function atlas(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(args, {
    // With a token, through code search, as EXAMPLE answers it.
    open: (input) => (parseGitHubUrl(input) ? openGitHub(input, { fetch: github, token: 'test' }) : openDirectory(input)),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}
