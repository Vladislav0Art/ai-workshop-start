// End to end: the real CLI on real repositories, each at a fixed commit, over live GitHub. What
// it prints must be what tests/e2e/expected recorded. Needs the network and GITHUB_TOKEN: without
// a token, a tree too large for one answer is only partly listed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { expected, REPOSITORIES, scan } from './repositories.ts';

for (const url of REPOSITORIES) {
  test(`./skill-atlas scan ${url}`, { skip: !process.env.GITHUB_TOKEN && 'GITHUB_TOKEN is not set' }, () => {
    const result = scan(url);
    assert.equal(result.status, 0, result.stderr);
    const files = expected(url);
    assert.equal(result.stdout, readFileSync(files.stdout, 'utf8'));
    assert.equal(result.stderr, readFileSync(files.stderr, 'utf8'));
  });
}
