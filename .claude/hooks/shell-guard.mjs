// Before any shell command runs (the main session's and every subagent's): turn back the ones that would stop for a
// permission prompt nobody is there to answer, or that could destroy work, and say what to do instead. Exit 2 with a
// message on stderr blocks the command and hands the message to the agent.
import { readFileSync } from 'node:fs';

const SCRATCH = '/private/tmp/claude-501/';
const WORKTREE = '/.claude/worktrees/';

/** Why this command is turned back, or null if it may run. `cwd` is where it would run. */
export function refuse(command, cwd = '') {
  if (/<<-?\s*['"]?\w+/.test(command)) return 'No heredocs or inline scripts: write the file with the Write tool, then run it in its own call.';
  // quoted text (commit messages, patterns) is not counted or matched
  const bare = command.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, '""');
  const steps = bare.split(/&&|\|\||;|\n/).map((s) => s.trim()).filter(Boolean);
  if (steps.length > 3) return `${steps.length} steps chained: one action per call (three short steps at most). Split it into separate Bash calls.`;
  if (bare.length > 300) return 'Too long: split it into separate Bash calls, or put it in a script file (Write) and run that.';
  const inWorktree = cwd.includes(WORKTREE);
  for (const step of steps) {
    const first = step.split('|')[0].trim().replace(/^(\w+=\S*\s+)+/, '');
    const word = first.split(/\s+/)[0];
    if (['cat', 'head', 'tail', 'less', 'more'].includes(word)) return `Read files with the Read tool, not ${word}. (Piping a command's output into head/tail is fine.)`;
    if (['sed', 'awk', 'perl'].includes(word)) return `Edit files with the Edit tool and read them with Read, not ${word}.`;
    if (/\b(sed|perl)\s+(-\w*\s+)*-\w*i/.test(step)) return 'No in-place sed/perl: use the Edit tool.';
    if (/^(echo|printf)\b/.test(first) && /(^|[^0-9&])>{1,2}\s*[^&\s]/.test(step)) return 'Write files with the Write tool, not echo/printf redirection.';
    if (/^(python3?|node)\s+(-c|-e|-)\b/.test(first)) return 'No inline scripts: write the file with the Write tool (in the scratchpad), then run it.';
    if (word === 'rm') {
      const args = first.split(/\s+/).slice(1);
      const paths = args.filter((a) => !a.startsWith('-'));
      const recursive = args.some((a) => /^-\w*[rR]/.test(a));
      const safe = (p) => p.startsWith(SCRATCH) || p.includes(WORKTREE) || (!p.startsWith('/') && !p.startsWith('~') && !p.includes('..') && !p.includes('*') && (inWorktree || !recursive));
      if (!paths.length || !paths.every(safe)) return 'rm only inside your own worktree or the scratchpad, by exact path (no globs, no .., nothing recursive in the main checkout).';
    }
    if (/^git\s+(-C\s+\S+\s+)?(reset\s+--hard|clean\b|checkout\s+--\s|restore\b)/.test(first) && !inWorktree && !/-C\s+\S*\.claude\/worktrees\//.test(first)) {
      return 'No git reset --hard / clean / restore in the main checkout: only in your own worktree.';
    }
    if (/^git\s.*\bpush\b.*(--force|-f\b|--force-with-lease)/.test(first)) return 'No force pushes.';
    if (/^git\s.*\bstash\s*(pop|drop|clear)?\s*$/.test(first)) return 'No bare git stash / pop: the stash is shared across worktrees. Use a WIP commit.';
    if (/^(sudo|caffeinate)\b/.test(first)) return `${word} is not allowed here (no caffeinate, no sudo).`;
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (input.tool_name === 'Bash') {
    const why = refuse(String(input.tool_input?.command ?? ''), String(input.cwd ?? ''));
    if (why) {
      process.stderr.write(`Turned back by .claude/hooks/shell-guard.mjs: ${why}\n`);
      process.exit(2);
    }
  }
}
