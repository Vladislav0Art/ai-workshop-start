# Skill Atlas

Every agent skill in a repository: `./skill-atlas scan` finds each `SKILL.md` and prints its name,
description and link.

```console
$ npm ci
$ ./skill-atlas scan https://github.com/JetBrains/kotlin
JetBrains/kotlin · 6 skills
…
build-tools-bump-gradle-api — Bumps the Gradle API version that Kotlin Gradle plugins are compiled against in the Kotlin compiler repository.
  https://github.com/JetBrains/kotlin/blob/5ab6270ab772d113e8ad52ebfcaa0109c522ae00/.claude/skills/build-tools-bump-gradle-api/SKILL.md
…
```

`./skill-atlas scan https://github.com/JetBrains/kotlin/tree/<commit>` scans that commit.
`--filter <text>` keeps only the skills with the text in their name, description, path or copies, and
highlights it.

Set `GITHUB_TOKEN` for a higher GitHub rate limit.

The same in a page: `npm run web`, open http://localhost:5173 and paste a repository link, and a GitHub
token if you hit the rate limit or the repository is private
(React, TypeScript and [shadcn/ui](https://ui.shadcn.com), in [web/](web/)). `npm run build` puts it in `web/dist`.

`npm test` runs the tests; the first time, `npx playwright install chromium` for the web view's. `npm run test:e2e`, with
`GITHUB_TOKEN`, the end-to-end tests on real repositories.

- [spec/](spec/): what it does; [spec/web.md](spec/web.md) for the page. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
