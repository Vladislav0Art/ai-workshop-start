// The real repositories the end-to-end tests scan, each at a fixed commit, and what the CLI
// printed for them, in tests/e2e/expected. `npm run e2e:record` prints it again.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CLI } from '../helpers.ts';

export const REPOSITORIES = [
  'https://github.com/JetBrains/MPS/tree/1cbf7f783dbc5c74c8e5231d31f61b02829143de',
  'https://github.com/JetBrains/koog/tree/709079e4a34d6c9234583352550e6a2b88a0bb85',
];

/** `tests/e2e/expected/<owner>-<repo>.stdout.txt` and `.stderr.txt`. */
export function expected(url: string): { stdout: string; stderr: string } {
  const [owner, repo] = new URL(url).pathname.split('/').slice(1, 3);
  const file = (stream: string) => fileURLToPath(new URL(`expected/${owner}-${repo}.${stream}.txt`, import.meta.url));
  return { stdout: file('stdout'), stderr: file('stderr') };
}

/** `./skill-atlas scan <url>`, the real CLI over live GitHub; GITHUB_TOKEN from the environment. */
export function scan(url: string) {
  const { status, stdout, stderr, error } = spawnSync(process.execPath, [CLI, 'scan', url], { encoding: 'utf8' });
  if (error) throw error;
  return { status, stdout, stderr };
}
