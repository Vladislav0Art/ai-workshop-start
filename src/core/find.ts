/** A skill found in a repository: its SKILL.md, its name and its copies. */
export type SkillFile = { path: string; name: string; copies: string[] };

/** Where agents keep a repository's own skills. */
export const SKILL_ROOTS = ['.agents/skills', '.claude/skills', '.github/skills', 'agent/skills'];

/** Directories of tests and their data, in any case: a SKILL.md in them is a fixture. */
const TEST_DIRECTORIES = new Set([
  'test', 'tests', '__tests__', 'testdata', 'test-data', 'test_data', 'testresources',
  'testfixtures', 'fixture', 'fixtures', '__fixtures__',
]);

/** A source set or target named after its tests: jvmTest, commonTest, androidUnitTest, AppTests. */
const TEST_SOURCE_SET = /^[A-Za-z0-9]+Tests?$/;

/**
 * Every file named exactly SKILL.md, named after its directory (a SKILL.md at the
 * root after the repository), except test data. Each copy is a skill of its own.
 */
export function findSkills(paths: string[], repositoryName: string): SkillFile[] {
  return paths
    .filter((path) => path.split('/').at(-1) === 'SKILL.md' && !inTests(path))
    .sort()
    .map((path) => ({ path, name: path.split('/').at(-2) ?? repositoryName, copies: [] }));
}

/** Under a test directory. The skill's own directory does not count: a skill may be named `tests`. */
function inTests(path: string): boolean {
  return path
    .split('/')
    .slice(0, -2)
    .some((name) => TEST_DIRECTORIES.has(name.toLowerCase()) || TEST_SOURCE_SET.test(name));
}
