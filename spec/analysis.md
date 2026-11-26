# Repository analysis
## Input
A **GitHub repository** URL, `…/tree/<commit>` for a fixed commit, or a local directory
## Output
Every `SKILL.md`: **name**, **description**, **link**
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The name: front matter, else the directory
- A *symbolic link* is not a skill: only the file it points to is listed
- *Test data* is not a skill: nothing under `test`, `tests`, `__tests__`, `testData`, `fixtures`,
  `testFixtures`, or a source set like `jvmTest`, `commonTest`, `AppTests`; the skill's own
  directory may have such a name
- The link pins the *scanned commit*: the one in the URL, else the default branch's latest
- Listing: *code search* for the default branch (with `GITHUB_TOKEN`), else the commit's *tree*;
  a tree too large for one answer goes subtree by subtree (with a token), or only the skill roots
- Unknown commit → a clear message, exit code 1
- Private repository (with a token): files are read through the API, raw GitHub does not serve them
- Malformed front matter → a *warning*, the scan goes on
- Unreachable repository → a clear message, exit code 1
