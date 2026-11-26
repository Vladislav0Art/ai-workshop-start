# fixture

A small repository for the tests.

| Path | Case |
| --- | --- |
| `.claude/skills/commits` | a skill |
| `.github/skills/code-style` | a skill in another agent's folder |
| `.agents/skills/release-checklist` | malformed front matter |
| `.claude/skills/tests` | a skill named like a test directory: listed |
| `.claude/skills/code-style/SKILL.md` | a symbolic link to `.github/skills/code-style/SKILL.md`: not listed |
| `.agents/skills/commits` | a symbolic link to `.claude/skills/commits`: not listed |
| `src/jvmTest/resources/skills/sample` | in a test source set: not listed |
| `plugins/markdown/test/testData/frontend` | in test data: not listed |
