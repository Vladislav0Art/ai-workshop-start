// The web view's backend: the same core as the CLI (fetch → find → parse), over live GitHub from
// the page, with the token pasted into it, if any. Only GitHub repositories: a page cannot read a
// local directory.
import { AtlasError } from '../../../src/core/errors.ts';
import { openGitHub, parseGitHubUrl, type Fetch } from '../../../src/core/github.ts';
import { scan, type ScanResult } from '../../../src/core/scan.ts';

export type { ScanResult };
export { firstSentence, skillLink } from '../../../src/core/model.ts';

/**
 * With a token, as the CLI with GITHUB_TOKEN, a higher rate limit and private repositories; but
 * through the tree, not code search, which a browser cannot call.
 */
export async function scanRepository(
  input: string,
  token = '',
  fetch: Fetch = (url, init) => window.fetch(url, init),
): Promise<ScanResult> {
  if (!parseGitHubUrl(input)) throw new AtlasError(`Not a GitHub repository URL: ${input.trim()}`);
  return scan(await openGitHub(input, { fetch, token: token.trim() || undefined, codeSearch: false }));
}

/** What to tell the user: an AtlasError's own message, anything else as unexpected. */
export function describeError(error: unknown): string {
  // The page has no environment: the token goes into its field.
  if (error instanceof AtlasError) {
    return error.message.replace('set GITHUB_TOKEN', 'paste a GitHub token').replace('the token in GITHUB_TOKEN', 'the pasted token');
  }
  return `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
}
