# Command line
`./skill-atlas scan <GitHub URL | directory> [--filter <text>]`
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
## Output
```
JetBrains/kotlin · 6 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…
```
- Sorted by **name**; the description's *first sentence*
- `also in <paths>` for copies; warnings go to *stderr*
## Filter
`--filter <text>` (or `--filter=<text>`): only the skills with the text in **any text field**:
the name, the *whole* description, the link, the copies.
```
JetBrains/kotlin · 2 of 6 skills match "gradle"
```
- Plain text, *any case*; no match → no skills, exit code 0
- Every match is **highlighted**: black on *yellow*, where stdout shows colors (a terminal, not
  `NO_COLOR`, or `FORCE_COLOR`)
- A match past the first sentence → the whole description, so the match shows
- Warnings are not filtered; no text, or `--filter` twice → the usage, exit code 1
