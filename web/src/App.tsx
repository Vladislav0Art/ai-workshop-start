import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, ExternalLink, FileText, GitCommit, Loader2, Search, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { describeError, firstSentence, scanRepository, skillLink, type ScanResult } from '@/lib/atlas';

type State =
  | { status: 'idle' }
  | { status: 'loading'; input: string }
  | { status: 'done'; result: ScanResult }
  | { status: 'error'; message: string };

/** The scanned repository is in the address (`?repo=`), so a result can be shared; nothing is stored. */
function repoFromAddress(): string {
  return new URLSearchParams(window.location.search).get('repo') ?? '';
}

export function App() {
  const [input, setInput] = useState(repoFromAddress);
  const [state, setState] = useState<State>({ status: 'idle' });
  const latest = useRef(0);

  const run = useCallback(async (repo: string) => {
    const request = ++latest.current;
    setState({ status: 'loading', input: repo });
    const url = new URL(window.location.href);
    url.searchParams.set('repo', repo.trim());
    window.history.replaceState(null, '', url);
    try {
      const result = await scanRepository(repo);
      if (request === latest.current) setState({ status: 'done', result });
    } catch (error) {
      if (request === latest.current) setState({ status: 'error', message: describeError(error) });
    }
  }, []);

  useEffect(() => {
    const initial = repoFromAddress();
    if (initial) void run(initial);
  }, [run]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (input.trim()) void run(input);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Skill Atlas</h1>
        <p className="text-muted-foreground">Every agent skill in a GitHub repository: paste its link to list each SKILL.md.</p>
      </header>

      <form onSubmit={submit} className="flex gap-2" aria-label="Scan a repository">
        <Input
          aria-label="GitHub repository URL"
          placeholder="https://github.com/JetBrains/kotlin"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="h-10"
          autoFocus
        />
        <Button type="submit" className="h-10" disabled={!input.trim() || state.status === 'loading'}>
          {state.status === 'loading' ? <Loader2 className="animate-spin" /> : <Search />}
          Scan
        </Button>
      </form>

      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Cannot scan the repository</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state.status === 'done' && <Result result={state.result} />}
    </main>
  );
}

function Loading() {
  return (
    <section aria-label="Scanning" aria-busy="true" className="space-y-3">
      <Skeleton className="h-7 w-64" />
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-28 w-full rounded-xl" />
      ))}
    </section>
  );
}

function Result({ result: { repository, skills, warnings } }: { result: ScanResult }) {
  return (
    <section aria-label="Skills" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">
          <a href={repository.url} target="_blank" rel="noreferrer" className="hover:underline">
            {repository.id}
          </a>
        </h2>
        <Badge variant="secondary" data-testid="skill-count">
          {skills.length} {skills.length === 1 ? 'skill' : 'skills'}
        </Badge>
        {repository.commit && (
          <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground" title={repository.commit}>
            <GitCommit className="size-3.5" />
            {repository.commit.slice(0, 7)}
          </span>
        )}
      </div>

      {warnings.length > 0 && (
        <Alert>
          <TriangleAlert />
          <AlertTitle>{warnings.length === 1 ? 'Warning' : `${warnings.length} warnings`}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {skills.length === 0 ? (
        <p className="text-muted-foreground">No SKILL.md in this repository.</p>
      ) : (
        <ul className="grid gap-3">
          {skills.map((skill) => {
            const link = skillLink(repository, skill);
            return (
              <li key={skill.id}>
                <Card className="gap-3 py-5 transition-colors hover:border-ring" data-testid="skill">
                  <CardHeader className="px-5">
                    <CardTitle role="heading" aria-level={3} className="flex items-center gap-2">
                      <FileText className="size-4 text-muted-foreground" />
                      <a href={link} target="_blank" rel="noreferrer" className="hover:underline">
                        {skill.name}
                      </a>
                    </CardTitle>
                    {skill.description && (
                      <CardDescription title={skill.description}>{firstSentence(skill.description)}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-2 px-5">
                    <Badge variant="outline" className="font-mono">
                      {skill.path}
                    </Badge>
                    {skill.copies.length > 0 && (
                      <span className="text-xs text-muted-foreground">also in {skill.copies.join(', ')}</span>
                    )}
                    <Button asChild variant="ghost" size="sm" className="ml-auto">
                      <a href={link} target="_blank" rel="noreferrer" aria-label={`Open ${skill.name} on GitHub`}>
                        Open <ExternalLink />
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
