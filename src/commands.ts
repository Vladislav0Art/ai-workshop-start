// The skill-atlas commands. The same code serves the Node CLI and the browser
// terminal: everything that differs between them comes in through the context.
import { AtlasError } from './core/errors.ts';
import { skillLink, type Repository, type Skill } from './core/model.ts';
import { scan, type Source } from './core/scan.ts';

export type Context = {
  /** Opens what the user asked to scan. */
  open(input: string): Promise<Source>;
  print(text: string): void;
  /** Errors and warnings. */
  error(text: string): void;
  /** Marks a match of `--filter`; the text as it is when there is no color to show it in. */
  highlight?(text: string): string;
};

const usage = `Usage: skill-atlas <command>

  scan <GitHub URL | directory>   find every SKILL.md in a repository and print it
    --filter <text>               only the skills with the text in their name, description,
                                  path or copies; the matches are highlighted
  help                            show this help`;

/** Runs one command; returns its exit code. */
export async function run(args: string[], context: Context): Promise<number> {
  const [command = 'help', ...rest] = args;
  try {
    if (command === 'scan') await scanCommand(rest, context);
    else if (command === 'help') context.print(usage);
    else throw new AtlasError(`Unknown command: ${command}\n\n${usage}`);
    return 0;
  } catch (error) {
    if (!(error instanceof AtlasError)) throw error;
    context.error(error.message);
    return 1;
  }
}

async function scanCommand(args: string[], context: Context) {
  const { input, filter } = scanArguments(args);
  const result = await scan(await context.open(input));
  printRepository(result.repository, result.skills, context, filter);
  for (const warning of result.warnings) context.error(`warning: ${warning}`);
}

const scanUsage = 'Usage: skill-atlas scan <GitHub URL | directory> [--filter <text>]';

/** The one input, anywhere among the options; `--filter <text>` or `--filter=<text>`. */
function scanArguments(args: string[]): { input: string; filter?: string } {
  const inputs: string[] = [];
  let filter: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--filter' || arg.startsWith('--filter=')) {
      if (filter !== undefined) throw new AtlasError(`--filter is given twice\n${scanUsage}`);
      filter = arg === '--filter' ? args[++index] : arg.slice('--filter='.length);
      if (!filter) throw new AtlasError(`--filter needs a text\n${scanUsage}`);
    } else inputs.push(arg);
  }
  if (inputs.length !== 1) throw new AtlasError(scanUsage);
  return { input: inputs[0], filter };
}

/**
 * `<owner>/<repo> · N skills`, then each skill's name, first sentence and link. With a filter,
 * `<owner>/<repo> · M of N skills match "<text>"`, then only the skills that have the text.
 */
function printRepository(repository: Repository, skills: Skill[], context: Context, filter?: string) {
  const all = skills.map((skill) => skillTexts(repository, skill));
  const count = `${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}`;
  if (!filter) {
    context.print(`${repository.id} · ${count}`);
    for (const texts of all) printSkill({ ...texts, description: firstSentence(texts.description) }, context.print);
    return;
  }
  const shown = all.filter(({ link, ...texts }) => Object.values(texts).some((text) => matches(text, filter)));
  context.print(`${repository.id} · ${shown.length} of ${count} ${shown.length === 1 ? 'matches' : 'match'} ${JSON.stringify(filter)}`);
  const mark = context.highlight;
  const marked = (text: string) => (mark ? text.replace(pattern(filter), (match) => mark(match)) : text);
  for (const texts of shown) {
    // The whole description when the text is in it, but not in its first sentence.
    const sentence = firstSentence(texts.description);
    const description = matches(texts.description, filter) && !matches(sentence, filter) ? texts.description : sentence;
    // In the link, only the path is searched, so only the path is highlighted.
    const link = mark ? texts.link.slice(0, -encodePath(texts.path).length) + markedPath(texts.path, filter, mark) : texts.link;
    printSkill({ ...texts, name: marked(texts.name), description: marked(description), link, copies: marked(texts.copies) }, context.print);
  }
}

/**
 * What a skill is printed with. `--filter` looks in all but the link: in its path instead, so
 * that the host, the owner, the commit or the checkout's directory match no skill.
 */
type SkillTexts = { name: string; description: string; path: string; copies: string; link: string };

function skillTexts(repository: Repository, skill: Skill): SkillTexts {
  return {
    name: skill.name,
    description: skill.description.replace(/\s+/g, ' ').trim(),
    path: skill.path,
    copies: skill.copies.join(', '),
    link: skillLink(repository, skill),
  };
}

function printSkill({ name, description, link, copies }: SkillTexts, print: Context['print']) {
  print(description ? `${name} — ${description}` : name);
  print(`  ${link}`);
  if (copies) print(`  also in ${copies}`);
}

/** As the link writes the path, the matches marked. */
function markedPath(path: string, filter: string, mark: (text: string) => string): string {
  let result = '';
  let end = 0;
  for (const match of path.matchAll(pattern(filter))) {
    result += encodePath(path.slice(end, match.index)) + mark(encodePath(match[0]));
    end = match.index + match[0].length;
  }
  return result + encodePath(path.slice(end));
}

/** As `skillLink` writes a path: each segment URL-encoded. */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** The filter, as plain text, in any case. */
function pattern(filter: string): RegExp {
  return new RegExp(filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
}

function matches(text: string, filter: string): boolean {
  return pattern(filter).test(text);
}

function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}
