# AGENTS.md
## Specs
Read [./spec](spec/) first. Update it with the code.
## Tests
Integration tests for every case in the spec, offline: GitHub answers from recordings.
End-to-end tests: the CLI on real repositories at fixed commits, compared with what
[tests/e2e/expected](tests/e2e/expected/) recorded. A change to the output is re-recorded, and the
diff reviewed.
## Definition of done
- All tests pass locally, the end-to-end ones too

## Commands
Node 24 or later (`package.json` engines): the CLI and the tests run `.ts` directly.
- `npm ci`: first, in a fresh checkout
- `npm test`: the tests
- `GITHUB_TOKEN=$(gh auth token) npm run test:e2e`: the end-to-end tests; skipped without a token
- `GITHUB_TOKEN=$(gh auth token) npm run e2e:record`: records their expected output again, for
  the repositories and commits in [tests/e2e/repositories.ts](tests/e2e/repositories.ts)
