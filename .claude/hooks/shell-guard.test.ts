import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refuse } from './shell-guard.mjs';

const main = '/Users/dk/Developer/game-portolan';
const tree = `${main}/.claude/worktrees/agent-x`;

test('the shell guard lets the ordinary commands through', () => {
  for (const c of [
    'npm test',
    'npm test 2>&1 | tail -5',
    'npm run budget',
    'npx tsc --noEmit',
    'git status --short',
    'git add -A && git commit -qm "a long message; with && and | and sed -i and rm -rf / inside it, which is only text"',
    'node tools/capture.ts --dpr=3 "?screen=match&ships=6"',
    'git log --oneline | head -5',
    'pgrep -fl "headless|vite"',
    'rm tools/_tap.ts',
    'rm -rf /private/tmp/claude-501/x/scratchpad/dd',
  ]) assert.equal(refuse(c, main), null, c);
  assert.equal(refuse('git reset --hard overnight', tree), null);
  assert.equal(refuse('rm -r captures/old', tree), null);
});

test('and turns back what would prompt or destroy, saying what to do instead', () => {
  for (const c of [
    'cat src/main.ts',
    'sed -n 1,40p src/main.ts',
    "sed -i '' s/a/b/ src/main.ts",
    'echo hi > src/x.ts',
    "python3 - <<'EOF'\nprint(1)\nEOF",
    'node -e "console.log(1)"',
    'npm test && npx tsc --noEmit && npm run build && npm run budget',
    'rm -rf src',
    'rm -rf ~/Developer',
    'rm ../other/file',
    'rm *.png',
    'git reset --hard HEAD~1',
    'git clean -fd',
    'git push --force origin main',
    'git stash',
    'caffeinate -i npm test',
    'open http://localhost:5173',
  ]) assert.equal(typeof refuse(c, main), 'string', c);
});
