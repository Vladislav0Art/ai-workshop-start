// The web view's backend: the same core as the CLI (fetch → find → parse), over live GitHub from
// the page, without a token. Only GitHub repositories: a page cannot read a local directory.
import { AtlasError } from '../../../src/core/errors.ts';
import { openGitHub, parseGitHubUrl, type Fetch } from '../../../src/core/github.ts';
import { scan, type ScanResult } from '../../../src/core/scan.ts';

export type { ScanResult };
export { firstSentence, skillLink } from '../../../src/core/model.ts';

export async function scanRepository(input: string, fetch: Fetch = (url, init) => window.fetch(url, init)): Promise<ScanResult> {
  if (!parseGitHubUrl(input)) throw new AtlasError(`Not a GitHub repository URL: ${input.trim()}`);
  return scan(await openGitHub(input, { fetch }));
}

/** What to tell the user: an AtlasError's own message, anything else as unexpected. */
export function describeError(error: unknown): string {
  if (error instanceof AtlasError) return error.message;
  return `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
}
