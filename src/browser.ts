// The browser entry: the same commands, printed into the page, over live GitHub without a
// token. No Node APIs here.
import { run } from './commands.ts';
import { openGitHub, type Fetch } from './core/github.ts';

export type BrowserOptions = {
  /** Live GitHub; the page's own fetch by default. */
  fetch?: Fetch;
};

export function createBrowserBackend(options: BrowserOptions = {}) {
  const live = options.fetch ?? ((url, init) => fetch(url, init));
  const open = (input: string) => openGitHub(input, { fetch: live });

  return {
    /** Runs a typed command line, such as `skill-atlas scan <URL>`, and returns what it printed. */
    async run(commandLine: string): Promise<string> {
      const output: string[] = [];
      const write = (text: string) => output.push(text);
      try {
        await run(words(commandLine), { open, print: write, error: write });
      } catch (error) {
        write(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
      }
      return output.join('\n');
    },
  };
}

/**
 * The words of a command line; the leading `$` and `skill-atlas` are optional. Quotes, single or
 * double, keep a word's spaces: `--filter "code style"`, `--filter="code style"`.
 */
function words(commandLine: string): string[] {
  // A word is pieces, quoted or not, with no space between: `--filter="code style"` is one.
  const words = [...commandLine.matchAll(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)].map((match) =>
    match[0].replace(/"([^"]*)"|'([^']*)'/g, '$1$2'),
  );
  if (words[0] === '$') words.shift();
  if (words[0] === 'skill-atlas') words.shift();
  return words;
}
