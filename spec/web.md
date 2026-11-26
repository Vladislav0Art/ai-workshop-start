# Web view
`npm run web`, then open http://localhost:5173: the same scan as `skill-atlas scan`, in a page.
React + TypeScript + shadcn/ui; the same core, from the browser, *no server of its own*.
## Input
A **GitHub repository** URL, pasted into the field; a local directory is not available.
`?repo=<URL>` in the address scans at once, so a result can be shared. *Nothing is stored.*
A **GitHub token**, optional, in a password field: a higher rate limit and private repositories.
Sent only to `api.github.com`; *never in the address, never stored*.
## Output
- A heading: `<owner>/<repo>`, `N skills`, the scanned commit
- One card a skill, **sorted by name**: name, the description's *first sentence*, path, link
- The link pins the *scanned commit*; `also in <paths>` for copies
- Warnings (malformed front matter, a tree too large to list) in a *warning box*; the scan goes on
- No skills → `No SKILL.md in this repository.`
## Errors
In an error box, with the CLI's message: not a GitHub URL, repository not found,
GitHub unreachable, rate limit (→ *paste a GitHub token*), a rejected token.
Always the GitHub tree, *not code search*: GitHub answers it without CORS headers, so a browser
blocks it. With a token, a tree too large for one answer goes subtree by subtree.
