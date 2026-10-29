import { SUPPORTED_SHELL_GRAMMAR, shellGrammarDiagnostics, isUnsupportedShellKeyword, hasUnquotedBrace, hasUnquotedTilde } from './_shellGrammar';
import {wrapperBoundary} from './_shellWrappers';
import { manualCommandName, SHELL_BUILTINS, MODELED_EXTERNAL_SHELL_NAMES } from './_commandConventions';
export class ShellParseError extends Error {
  constructor(readonly code: string) { super(code); }
}
/** Static shell inspection only: no expansion, filesystem access or execution. */
export const EXPLAIN_LIMITS = { characters: 4096, tokens: 128, stages: 24, depth: 8 } as const;
export type ShellKind = 'command' | 'word' | 'assignment' | 'operator' | 'redirect' | 'redirectTarget' | 'glob' | 'expansion' | 'comment' | 'unknown';
export type ShellToken = { kind: ShellKind; text: string; value: string; start: number; end: number; dynamic: boolean; replacement?: {marker: string; source: 'find' | 'xargs'} };
export type ShellStage = { id: number; parent: number | null; relation: 'list' | 'subshell' | 'substitution' | 'wrapper' | 'exec'; executionContext: 'shell' | 'command' | 'external'; environmentCleared: boolean; tokens: ShellToken[] };
export type ShellParse = { stages: ShellStage[]; diagnostics: string[] };
const OPERATORS = ['&&', '||', '|&', '>>', '<<-', '<<<', '<<', '<>', '>&', '<&', '>|', '&>', '&>>', '|', ';', '&', '(', ')', '>', '<', '\n'];
const WRAPPER_ARGUMENTS = Object.fromEntries(Object.entries(SUPPORTED_SHELL_GRAMMAR.wrappers).map(([name,args])=>[name,new Set(args)]));

export function parseShell(input: string): ShellParse {
  if (input.length > EXPLAIN_LIMITS.characters) throw new ShellParseError('EXPLAIN_INPUT_TOO_LONG');
  const result: ShellParse = { stages: [], diagnostics: [] };
  let count = 0;
  const create = (parent: number | null, relation: ShellStage['relation']) => {
    if (result.stages.length >= EXPLAIN_LIMITS.stages) throw new ShellParseError('EXPLAIN_TOO_MANY_STAGES');
    const stage: ShellStage = { id: result.stages.length, parent, relation, executionContext: parent===null ? 'shell' : 'external', environmentCleared: false, tokens: [] };
    result.stages.push(stage);
    return stage;
  };
  function scan(start: number, parent: number | null, relation: ShellStage['relation'], stop: string | null, depth: number): number {
    if (depth > EXPLAIN_LIMITS.depth) throw new ShellParseError('EXPLAIN_TOO_DEEP');
    let stage = create(parent, relation), i = start;
    const add = (kind: ShellKind, a: number, b: number, value = input.slice(a, b), dynamic = false) => {
      if (++count > EXPLAIN_LIMITS.tokens) throw new ShellParseError('EXPLAIN_TOO_MANY_TOKENS');
      stage.tokens.push({ kind, text: input.slice(a, b), value, start: a, end: b, dynamic });
    };
    while (i < input.length) {
      if (stop && input.startsWith(stop, i)) return i;
      if (/[ ]/.test(input[i])) { i++; continue; }
      const a = i;
      if (input[i] === '#') {
        while (i < input.length && input[i] !== '\n') i++;
        add('comment', a, i); continue;
      }
      const fd = /^\d+(?=[<>])/.exec(input.slice(i));
      const opStart = i + (fd?.[0].length ?? 0);
      const op = [...OPERATORS].sort((a, b) => b.length - a.length).find(op => input.startsWith(op, opStart));
      if (op && !input.startsWith('<(', i) && !input.startsWith('>(', i)) {
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
        if (!quote && (/[\s]/.test(ch) || (OPERATORS.some(op => input.startsWith(op, i)) && !input.startsWith('<(', i) && !input.startsWith('>(', i)) || (stop && input.startsWith(stop, i)))) break;
        if (quote === 'ansi') {
          if (ch === "'") { quote = null; i++; continue; }
          if (ch === '\\' && i + 1 < input.length) {
            const next = input[i+1];
            const escapes: Record<string,string> = {n:'\n',r:'\r',t:'\t',a:'\x07',b:'\b',e:'\x1b',f:'\f',v:'\v',"'":"'",'"':'"','\\':'\\'};
            const numeric = /^(?:x([0-9a-f]{1,2})|u([0-9a-f]{4})|U([0-9a-f]{8})|([0-7]{1,3}))/i.exec(input.slice(i+1));
            if (numeric) {
              const point = Number.parseInt(numeric[1] ?? numeric[2] ?? numeric[3] ?? numeric[4], numeric[4] ? 8 : 16);
              value += point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '\ufffd'; i += numeric[0].length + 1;
            } else {value += escapes[next] ?? `\\${next}`; i+=2;}
            continue;
          }
          value += ch; i++; continue;
        }
        if (!quote && input.startsWith("$'", i)) {quote = 'ansi'; i+=2; continue;}
        if (!quote && (input.startsWith('<(', i) || input.startsWith('>(', i))) {
          const end = scan(i+2, stage.id, 'substitution', ')', depth+1);
          value += input.slice(i, end + (input[end] === ')' ? 1 : 0)); i=end; dynamic=true;
          if (input[i] === ')') i++; else result.diagnostics.push('Unclosed process substitution');
          continue;
        }
        if (ch === "'" && quote !== '"') { quote = quote ? null : "'"; i++; continue; }
        if (ch === '"' && quote !== "'") { quote = quote ? null : '"'; i++; continue; }
        if (ch === '\\' && quote !== "'") {
          if (i + 1 === input.length) { result.diagnostics.push('Trailing escape'); i++; break; }
          const next = input[i + 1];
          if (!quote && next === '$' && input[i+2] === '(') { add('unknown', a, input.length); result.diagnostics.push('Escaped dollar is not a command substitution'); return input.length; }
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
      const kind: ShellKind = glob ? 'glob' : previous?.kind === 'redirect' ? 'redirectTarget' : dynamic ? 'expansion' : 'word';
      add(kind, a, i, value, dynamic);
    }
    return i;
  }
  scan(0, null, 'list', null, 0);
  for (const stage of result.stages) {
    const last = stage.tokens.at(-1);
    if (last?.kind === 'operator' && ['|', '|&', '&&', '||'].includes(last.value)) {
      const next = result.stages.find(candidate => candidate.id > stage.id && candidate.parent === stage.parent);
      if (!next?.tokens.some(token=>token.kind!=='comment')) result.diagnostics.push(`Missing command after ${last.value}`);
    }
    stage.tokens.forEach((token, index) => {
      if (token.kind === 'redirect' && !['redirectTarget','glob'].includes(stage.tokens[index + 1]?.kind)) result.diagnostics.push(`Missing redirection target for ${token.text}`);
    });
  }
  result.diagnostics.push(...shellGrammarDiagnostics(input,result.stages));
  if(result.diagnostics.some(message=>message.includes('control character'))) {
    for(const stage of result.stages) for(const token of stage.tokens) if(!['operator','redirect','redirectTarget','comment'].includes(token.kind)) token.kind='unknown';
  }
  // Shell redirects belong to the simple command even between wrapper options
  // and their values. Keep source spans, but lift pairs out of the argv view.
  for(const stage of result.stages) {
    const argv:ShellToken[]=[],redirects:ShellToken[]=[];
    for(let i=0;i<stage.tokens.length;i++) {
      const token=stage.tokens[i];
      if(token.kind==='redirect' && stage.tokens[i+1] && ['redirectTarget','glob'].includes(stage.tokens[i+1].kind)) {redirects.push(token,stage.tokens[++i]);}
      else argv.push(token);
    }
    const boundary=argv.findIndex(t=>['operator','comment'].includes(t.kind));
    argv.splice(boundary<0 ? argv.length : boundary,0,...redirects);
    stage.tokens=argv;
  }
  for (let index = 0; index < result.stages.length; index++) {
    const stage = result.stages[index];
    // Remove lexer-created empty list stages while keeping stable IDs/parent references.
    let command = stage.tokens.findIndex((token,i) => !['operator', 'redirect', 'redirectTarget', 'comment'].includes(token.kind) && stage.tokens[i-1]?.kind !== 'redirect');
    while (command >= 0 && stage.parent===null && stage.relation==='list' && stage.tokens[command].kind !== 'unknown' && /^[A-Za-z_][A-Za-z0-9_]*=/.test(stage.tokens[command].text)) {
      stage.tokens[command].kind = 'assignment'; command++;
      while (command < stage.tokens.length && (['redirect', 'redirectTarget'].includes(stage.tokens[command].kind) || stage.tokens[command-1]?.kind === 'redirect')) command++;
      if (command >= stage.tokens.length) { command = -1; break; }
    }
    if (command < 0 || !stage.tokens[command] || ['operator', 'redirect', 'redirectTarget', 'comment'].includes(stage.tokens[command].kind)) continue;
    const token = stage.tokens[command];
    if (token.kind === 'unknown') continue;
    if(stage.parent!==null && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token.value) || token.value.startsWith('-'))) {
      token.kind='unknown';result.diagnostics.push('Unsupported wrapper executable: assignment or option-like program name');continue;
    }
    if (token.dynamic || token.kind === 'glob') { token.kind = 'unknown'; continue; }
    token.kind = 'command';
    const name = manualCommandName(token.value);
    if (!name) {token.kind = 'unknown'; continue;}
    if(SHELL_BUILTINS.has(name) && (stage.executionContext==='external' || token.value.includes('/')) && !MODELED_EXTERNAL_SHELL_NAMES.has(name)) {
      token.kind='unknown';result.diagnostics.push('Unsupported external executable: shell builtin name');continue;
    }
    if (isUnsupportedShellKeyword(name)) {
      token.kind = 'unknown'; result.diagnostics.push('Shell control structures are not interpreted'); continue;
    }
    const ancestors:ShellStage[]=[];
    for(let parent=stage.parent;parent!==null;) {const ancestor=result.stages[parent];ancestors.push(ancestor);parent=ancestor.parent;}
    if(name==='xargs' && ancestors.some(ancestor=>ancestor.tokens.some(t=>t.kind==='command' && manualCommandName(t.value)==='xargs'))) {result.diagnostics.push('Unsupported nested xargs input dependency');continue;}
    if(name==='doas' && stage.environmentCleared) {result.diagnostics.push('Unsupported doas lookup with a cleared environment');continue;}
    if (WRAPPER_ARGUMENTS[name]) {
      const keywordTime=name==='time' && token.text==='time' && stage.executionContext==='shell' && command===0 && ![stage,...ancestors].some(context=>context.tokens.some(other=>other.start<token.start && (other.kind==='redirect' || context===stage)));
      if(keywordTime && stage.tokens[command+1]?.value.startsWith('-') && stage.tokens.some(other=>other.kind==='redirect' && other.start<stage.tokens[command+1].start)) {
        result.diagnostics.push('Unsupported redirected time keyword option');continue;
      }
      if(keywordTime && stage.tokens[command+1]?.value.startsWith('-') && stage.tokens[command+1].value!=='-p') {
        result.diagnostics.push('Unsupported shell time keyword option');continue;
      }
      const boundaryResult=wrapperBoundary(stage.tokens,command,name);
      const {end,replacement,diagnostic}=boundaryResult;
      if(diagnostic) {result.diagnostics.push(diagnostic);continue;}
      if (end < stage.tokens.length && !['operator', 'redirect', 'comment'].includes(stage.tokens[end].kind)) {
        const boundary = stage.tokens.findIndex((token, i) => i >= end && ['operator','redirect'].includes(token.kind));
        const child = create(stage.id, 'wrapper');
        child.environmentCleared=stage.environmentCleared || boundaryResult.clearsEnvironment;
        child.executionContext=keywordTime ? 'shell' : name==='command' && stage.executionContext!=='external' && !token.value.includes('/') ? 'command' : 'external';
        child.tokens = stage.tokens.splice(end, (boundary < 0 ? stage.tokens.length : boundary) - end);
        if(replacement==='') {result.diagnostics.push('Unsupported empty xargs replacement string');child.tokens.forEach(token=>{token.kind='unknown';});}
        if (replacement) for(const [position,token] of child.tokens.entries()) {
          if(position>0 && token.kind!=='unknown' && token.value.includes(replacement)) {token.replacement={marker:replacement,source:'xargs'};token.dynamic=true;token.kind='expansion';}
        }
      }
    } else if (name === 'find') {
      let after = command;
      while (true) {
        const exec = stage.tokens.findIndex((t, n) => n > after && ['-exec', '-execdir', '-ok', '-okdir'].includes(t.value));
        if (exec < 0) break;
        const end = stage.tokens.findIndex((t, n) => n > exec && [';', '+'].includes(t.value));
        if (end > exec + 1 && stage.tokens[end].kind !== 'operator') {
          const argv = stage.tokens.slice(exec+1,end);
          if(stage.tokens[end].value === '+' && (argv.at(-1)?.value !== '{}' || argv.filter(t=>t.value.includes('{}')).length !== 1)) {
            result.diagnostics.push('Unsupported find execution: + requires one trailing {} argument');
            stage.tokens[exec].kind='unknown'; break;
          }
          const child = create(stage.id, 'exec'); child.tokens = stage.tokens.splice(exec + 1, end - exec - 1);
          for(const token of child.tokens) if(token.kind!=='unknown' && token.value.includes('{}')) {token.replacement={marker:'{}',source:'find'};token.dynamic=true;token.kind='expansion';}
          after = exec + 1;
        } else { result.diagnostics.push('Unterminated find execution expression'); break; }
      }
    }
  }
  for(const stage of result.stages) for(let i=0;i<stage.tokens.length;i++) {
    const token=stage.tokens[i];
    if(token.kind==='comment') continue;
    if(hasUnquotedTilde(token.text)) result.diagnostics.push('Unsupported shell grammar: unquoted tilde');
    if(!hasUnquotedBrace(token.text)) continue;
    const declaration=stage.tokens.some(t=>t.kind==='command' && manualCommandName(t.value)==='xargs') && ['-I','-i','--replace'].includes(stage.tokens[i-1]?.value);
    if(token.text==='{}' && (token.replacement || declaration)) continue;
    result.diagnostics.push('Unsupported shell grammar: unquoted opening brace');
  }
  const ordered: ShellStage[] = [];
  const visit = (stage: ShellStage) => {
    ordered.push(stage);
    for (const child of result.stages.filter(child => child.parent === stage.id)) visit(child);
  };
  result.stages.filter(stage => stage.parent === null).forEach(visit);
  result.stages = ordered;
  return result;
}
