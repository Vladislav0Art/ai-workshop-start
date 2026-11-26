// Records what the CLI prints for each repository in tests/e2e/repositories.ts: the expected
// output of the end-to-end tests. Run it when a repository's commit or the output changes, and
// review the diff.
import { writeFileSync } from 'node:fs';
import { expected, REPOSITORIES, scan } from './repositories.ts';

for (const url of REPOSITORIES) {
  const result = scan(url);
  if (result.status !== 0) {
    console.error(`${url}: exit code ${result.status}\n${result.stderr}`);
    process.exit(1);
  }
  const files = expected(url);
  writeFileSync(files.stdout, result.stdout);
  writeFileSync(files.stderr, result.stderr);
  console.log(`${url}: ${result.stdout.split('\n')[0]}`);
}
