/** Static shell inspection only: no expansion, filesystem access or execution. */
export const EXPLAIN_LIMITS = { characters: 4096, tokens: 128, stages: 24, depth: 8 } as const;
export type ShellKind = 'command' | 'word' | 'assignment' | 'operator' | 'redirect' | 'redirectTarget' | 'glob' | 'expansion' | 'comment' | 'unknown';
export type ShellToken = { kind: ShellKind; text: string; value: string; start: number; end: number; dynamic: boolean };
export type ShellStage = { id: number; parent: number | null; relation: 'list' | 'subshell' | 'substitution' | 'wrapper' | 'exec'; tokens: ShellToken[] };
export type ShellParse = { stages: ShellStage[]; diagnostics: string[] };
const OPERATORS = ['&&', '||', '|&', '>>', '<<-', '<<<', '<<', '<>', '>&', '<&', '>|', '&>', '&>>', '|', ';', '&', '(', ')', '>', '<', '\n'];
const WRAPPER_ARGUMENTS: Record<string, Set<string>> = {
  sudo: new Set(['-u', '--user', '-g', '--group', '-h', '--host', '-p', '--prompt', '-C', '-T', '-R', '-D']),
  env: new Set(['-u', '--unset', '-C', '--chdir', '-a', '--argv0']),
  xargs: new Set(['-I', '-n', '--max-args', '-P', '--max-procs', '-d', '--delimiter', '-s', '--max-chars', '-E', '-L', '--max-lines', '-a', '--arg-file']),
};

export function parseShell(input: string): ShellParse {
  if (input.length > EXPLAIN_LIMITS.characters) throw new Error('EXPLAIN_INPUT_TOO_LONG');
  const result: ShellParse = { stages: [], diagnostics: [] };
  let count = 0;
  const create = (parent: number | null, relation: ShellStage['relation']) => {
    if (result.stages.length >= EXPLAIN_LIMITS.stages) throw new Error('EXPLAIN_TOO_MANY_STAGES');
    const stage: ShellStage = { id: result.stages.length, parent, relation, tokens: [] };
    result.stages.push(stage);
    return stage;
  };
  function scan(start: number, parent: number | null, relation: ShellStage['relation'], stop: string | null, depth: number): number {
    if (depth > EXPLAIN_LIMITS.depth) throw new Error('EXPLAIN_TOO_DEEP');
    let stage = create(parent, relation), i = start;
    const add = (kind: ShellKind, a: number, b: number, value = input.slice(a, b), dynamic = false) => {
      if (++count > EXPLAIN_LIMITS.tokens) throw new Error('EXPLAIN_TOO_MANY_TOKENS');
      stage.tokens.push({ kind, text: input.slice(a, b), value, start: a, end: b, dynamic });
    };
    while (i < input.length) {
      if (stop && input.startsWith(stop, i)) return i;
      if (/[\t \r]/.test(input[i])) { i++; continue; }
      const a = i;
      if (input[i] === '#') {
        while (i < input.length && input[i] !== '\n') i++;
        add('comment', a, i); continue;
      }
      const fd = /^\d+(?=[<>])/.exec(input.slice(i));
      const opStart = i + (fd?.[0].length ?? 0);
      const op = [...OPERATORS].sort((a, b) => b.length - a.length).find(op => input.startsWith(op, opStart));
      if (op) {
        if (['|', '|&', '&&', '||'].includes(op) && !stage.tokens.some(token => ['word', 'glob', 'expansion'].includes(token.kind) || token.value === ')')) result.diagnostics.push(`Missing command before ${op}`);
        i = opStart + op.length;
        if (op === '(') {
          add('operator', a, i);
          i = scan(i, stage.id, 'subshell', ')', depth + 1);
          if (input[i] === ')') { add('operator', i, i + 1); i++; }
          else result.diagnostics.push('Unclosed subshell');
        } else {
          add(/[<>]/.test(op) ? 'redirect' : 'operator', a, i);
          if (['|', '|&', '&&', '||', ';', '&', '\n'].includes(op)) stage = create(parent, relation);
          if (op === ')') result.diagnostics.push('Unexpected closing parenthesis');
          // Here-doc bodies need delimiter-aware parsing; never label them as commands.
          if (op === '<<' || op === '<<-') {
            add('unknown', i, input.length); result.diagnostics.push('Here-document body is not interpreted'); return input.length;
          }
        }
        continue;
      }
      let quote: string | null = null, value = '', dynamic = false, glob = false;
      while (i < input.length) {
        const ch = input[i];
        if (!quote && (/[\s]/.test(ch) || OPERATORS.some(op => input.startsWith(op, i)) || (stop && input.startsWith(stop, i)))) break;
        if (ch === "'" && quote !== '"') { quote = quote ? null : "'"; i++; continue; }
        if (ch === '"' && quote !== "'") { quote = quote ? null : '"'; i++; continue; }
        if (ch === '\\' && quote !== "'") {
          if (i + 1 === input.length) { result.diagnostics.push('Trailing escape'); i++; break; }
          const next = input[i + 1];
          if (!quote || '$`"\\\n'.includes(next)) { if (next !== '\n') value += next; i += 2; continue; }
        }
        if (quote !== "'" && ((ch === '$' && input[i + 1] === '(') || ch === '`')) {
          if (input.startsWith('$((', i)) {
            const end = input.indexOf('))', i + 3);
            value += input.slice(i, end < 0 ? input.length : end + 2);
            i = end < 0 ? input.length : end + 2; dynamic = true;
            result.diagnostics.push('Arithmetic expansion is not interpreted');
            continue;
          }
          dynamic = true;
          const closing = ch === '`' ? '`' : ')';
          const bodyStart = i + (ch === '`' ? 1 : 2);
          const end = scan(bodyStart, stage.id, 'substitution', closing, depth + 1);
          value += input.slice(i, end + (input[end] === closing ? 1 : 0));
          i = end;
          if (input[i] === closing) i++; else result.diagnostics.push('Unclosed command substitution');
          continue;
        }
        if (quote !== "'" && input.startsWith('${', i)) {
          let end = i + 2, braces = 1;
          for (; end < input.length && braces; end++) {
            if (input[end] === '\\') { end++; continue; }
            if (input[end] === '{') braces++;
            if (input[end] === '}') braces--;
          }
          value += input.slice(i, end); i = end; dynamic = true;
          result.diagnostics.push('Parameter expansion is not interpreted'); continue;
        }
        if (quote !== "'" && ch === '$') dynamic = true;
        if (!quote && '*?['.includes(ch)) glob = true;
        value += ch; i++;
      }
      if (quote) result.diagnostics.push('Unclosed quote');
      if (i === a) { i++; add('unknown', a, i); continue; }
      if (!value && /^(?:\\\n)+$/.test(input.slice(a, i))) continue;
      const previous = stage.tokens.at(-1);
      const kind: ShellKind = previous?.kind === 'redirect' ? 'redirectTarget' : dynamic ? 'expansion' : glob ? 'glob' : 'word';
      add(kind, a, i, value, dynamic);
    }
    return i;
  }
  scan(0, null, 'list', null, 0);
  for (const stage of result.stages) {
    const last = stage.tokens.at(-1);
    if (last?.kind === 'operator' && ['|', '|&', '&&', '||'].includes(last.value)) {
      const next = result.stages.find(candidate => candidate.id > stage.id && candidate.parent === stage.parent);
      if (!next?.tokens.length) result.diagnostics.push(`Missing command after ${last.value}`);
    }
    stage.tokens.forEach((token, index) => {
      if (token.kind === 'redirect' && stage.tokens[index + 1]?.kind !== 'redirectTarget') result.diagnostics.push(`Missing redirection target for ${token.text}`);
    });
  }
  for (let index = 0; index < result.stages.length; index++) {
    const stage = result.stages[index];
    // Remove lexer-created empty list stages while keeping stable IDs/parent references.
    let command = stage.tokens.findIndex(token => !['operator', 'redirect', 'redirectTarget', 'comment'].includes(token.kind));
    while (command >= 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(stage.tokens[command].value)) {
      stage.tokens[command].kind = 'assignment'; command++;
      while (command < stage.tokens.length && ['redirect', 'redirectTarget'].includes(stage.tokens[command].kind)) command++;
      if (command >= stage.tokens.length) { command = -1; break; }
    }
    if (command < 0 || !stage.tokens[command] || ['operator', 'redirect', 'redirectTarget', 'comment'].includes(stage.tokens[command].kind)) continue;
    const token = stage.tokens[command];
    if (token.dynamic || token.kind === 'glob') { token.kind = 'unknown'; continue; }
    token.kind = 'command';
    const name = token.value.split('/').at(-1)!;
    if (['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac', 'function', '{', '}'].includes(name)) {
      token.kind = 'unknown'; result.diagnostics.push('Shell control structures are not interpreted'); continue;
    }
    if (WRAPPER_ARGUMENTS[name]) {
      let end = command + 1;
      while (end < stage.tokens.length) {
        const t = stage.tokens[end];
        if (t.kind === 'operator' || t.kind === 'redirect') break;
        if (t.value === '--') { end++; break; }
        if (name === 'env' && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t.value)) { t.kind = 'assignment'; end++; continue; }
        if (!t.value.startsWith('-')) break;
        // Options that execute shell strings cannot be safely unwrapped as argv.
        if ((name === 'env' && /^(?:-S|--split-string(?:=|$))/.test(t.value)) || (name === 'sudo' && ['-s', '-i', '--shell', '--login'].includes(t.value))) {
          result.diagnostics.push(`Cannot statically unwrap ${name} ${t.value}`); end = stage.tokens.length; break;
        }
        end += WRAPPER_ARGUMENTS[name].has(t.value) ? 2 : 1;
      }
      if (end < stage.tokens.length && !['operator', 'redirect', 'comment'].includes(stage.tokens[end].kind)) {
        const child = create(stage.id, 'wrapper'); child.tokens = stage.tokens.splice(end);
      }
    } else if (name === 'find') {
      let after = command;
      while (true) {
        const exec = stage.tokens.findIndex((t, n) => n > after && ['-exec', '-execdir', '-ok', '-okdir'].includes(t.value));
        if (exec < 0) break;
        const end = stage.tokens.findIndex((t, n) => n > exec && [';', '+'].includes(t.value));
        if (end > exec + 1) {
          const child = create(stage.id, 'exec'); child.tokens = stage.tokens.splice(exec + 1, end - exec - 1);
          after = exec + 1;
        } else { result.diagnostics.push('Unterminated find execution expression'); break; }
      }
    }
  }
  return result;
}

export type DestructiveSignal = { description: string; dryRun: string | null };
/** These describe requested operations, never an assertion that execution or loss occurred. */
export function destructiveSignals(stage: ShellStage, resolvedFlags?: string[]): DestructiveSignal[] {
  if (stage.tokens.some(t => t.dynamic || t.kind === 'unknown')) return [];
  const command = stage.tokens.find(t => t.kind === 'command')?.value;
  const name = command?.split('/').at(-1);
  const args = stage.tokens.filter(t => ['word', 'glob'].includes(t.kind)).map(t => t.value);
  const beforeEnd = args.slice(0, args.includes('--') ? args.indexOf('--') : args.length);
  const flags = resolvedFlags ?? beforeEnd;
  if (beforeEnd.includes('--help') || beforeEnd.includes('--version')) return [];
  const signals: DestructiveSignal[] = [];
  const flag = (long: string, short = '') => flags.includes(long) || (short && flags.some(a => /^-[A-Za-z]+$/.test(a) && a.slice(1).includes(short)));
  if (name === 'rm' && (flag('--recursive', 'r') || flag('--force', 'f') || flag('--recursive', 'R'))) signals.push({ description: `rm requests ${flag('--recursive', 'r') || flag('--recursive', 'R') ? 'recursive file and directory removal' : 'file removal'}${flag('--force', 'f') ? ' with force, suppressing prompts and ignoring nonexistent operands' : ''}.`, dryRun: null });
  if (name === 'find' && flags.includes('-delete')) signals.push({ description: 'find -delete requests deletion of matching files or empty directories.', dryRun: null });
  if (name === 'dd' && args.some(a => /^of=.+/.test(a))) signals.push({ description: 'dd of= requests writing to the specified output file or device; existing contents may be overwritten.', dryRun: null });
  if (name && /^(?:mkfs(?:\.[a-z0-9]+)?|truncate|shred)$/.test(name) && args.some(a => !a.startsWith('-'))) signals.push({ description: `${name} requests a filesystem or file-content modification that can destroy data.`, dryRun: null });
  if (name === 'tar' && flags.includes('--remove-files')) signals.push({ description: 'tar --remove-files requests removal of source files after adding them to an archive.', dryRun: null });
  for (let i = 0; i < stage.tokens.length; i++) {
    const token = stage.tokens[i], target = stage.tokens[i + 1];
    if (/^\d*>$/.test(token.text) && target?.kind === 'redirectTarget' && !/^(?:&\d+|\/dev\/null)$/.test(target.value)) signals.push({ description: `The ${token.text} redirection opens its destination for writing and may truncate it if it already exists. File existence and shell noclobber settings are unknown.`, dryRun: null });
  }
  return signals;
}
