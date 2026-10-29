import type { ShellStage, ShellToken } from './_shellParser';

/** The complete admitted shell subset. Anything outside it stays explanatory only. */
export const SUPPORTED_SHELL_GRAMMAR = {
  commands: 'literal simple commands with literal assignments, quoted/escaped words and argument globs',
  lists: ['|', '&&', '||', ';'],
  redirects: ['>', '>|', '>>', '&>', '<', '>&', '<&'],
  quoting: ['single quotes', 'double quotes', 'ANSI-C quotes', 'backslash escapes'],
  wrappers: {
    sudo: ['-u','--user','-g','--group','-h','--host','-p','--prompt','-C','-T','-R','-D','-r','--role','-t','--type'],
    env: ['-u','--unset','-C','--chdir','-a','--argv0'],
    timeout: ['-s','--signal','-k','--kill-after'], nice: ['-n','--adjustment'], nohup: [],
    time: ['-f','--format','-o','--output'], command: [], exec: ['-a'], doas: ['-u','-C'],
    xargs: ['-I','-n','--max-args','-P','--max-procs','-d','--delimiter','-s','--max-chars','-E','-L','-a','--arg-file'],
  } as Record<string, string[]>,
  optionalWrapperArguments: {xargs:['--max-lines','-l','--eof','-e','--replace','-i']} as Record<string,string[]>,
  unsupported: 'compound/control syntax, substitutions, background jobs, unsupported redirects, control characters outside quotes and malformed list boundaries',
} as const;
const KEYWORDS = new Set(['if','then','else','elif','fi','for','while','until','do','done','case','esac','function','select','coproc','in','!','[[',']]','{','}']);

export const isUnsupportedShellKeyword = (value: string) => KEYWORDS.has(value);

export function shellGrammarDiagnostics(input: string, stages: ShellStage[]): string[] {
  const diagnostics: string[] = [];
  const unsupported = (reason: string) => diagnostics.push(`Unsupported shell grammar: ${reason}`);
  // Scan quote state only; no shell evaluation or parsing of unsupported bodies.
  let quote = '', escaped = false;
  for(let i=0;i<input.length;i++) {
    const ch=input[i], control=ch.charCodeAt(0)<32 || ch.charCodeAt(0)===127;
    if(control && !quote) unsupported('control character outside quotes');
    if(escaped) {escaped=false;continue;}
    if(ch==='\\' && quote!=="'") {escaped=true;continue;}
    if(quote) {if(ch===(quote==='ansi' ? "'" : quote)) quote='';continue;}
    if(input.startsWith("$'",i)) {quote='ansi';i++;continue;}
    if(ch==="'" || ch==='"') quote=ch;
  }
  for(const stage of stages) {
    if(stage.relation==='subshell' || stage.relation==='substitution') unsupported('subshell, group or substitution');
    for(let i=0;i<stage.tokens.length;i++) {
      const token=stage.tokens[i];
      if(token.kind==='operator') {
        if(!(SUPPORTED_SHELL_GRAMMAR.lists as readonly string[]).includes(token.value)) unsupported(`operator ${token.value}`);
        const before=stage.tokens.slice(0,i).some(t=>!['operator','comment'].includes(t.kind));
        if(!before) unsupported('empty list or pipeline element');
        if(token.value!==';' && i===stage.tokens.length-1) {
          const next=stages.find(next=>next.parent===stage.parent && next.id>stage.id);
          if(!next?.tokens.some(token=>token.kind!=='comment')) unsupported('trailing pipeline or conditional operator');
        }
      }
      if(token.kind==='redirect') {
        const op=token.value.replace(/^\d+/, '');
        if(!(SUPPORTED_SHELL_GRAMMAR.redirects as readonly string[]).includes(op)) unsupported(`redirect ${op}`);
        if(['>&','<&'].includes(op) && !/^(?:\d+|-)$/.test(stage.tokens[i+1]?.value ?? '')) unsupported('non-descriptor duplication');
      }
      if(i===stage.tokens.findIndex((t,n)=>!['operator','redirect','redirectTarget','comment'].includes(t.kind) && stage.tokens[n-1]?.kind!=='redirect') && token.text===token.value && KEYWORDS.has(token.value)) unsupported('control structure or reserved word');
      if(token.dynamic && !token.replacement) unsupported('runtime shell expansion');
    }
  }
  return [...new Set(diagnostics)];
}

/** A bounded conjunction-only find expression, never a partial predicate model. */
export function findExpressionDiagnostic(tokens: ShellToken[]): string | null {
  const words=tokens.filter(t=>!['operator','comment','redirect','redirectTarget'].includes(t.kind));
  let i=words.findIndex(t=>t.kind==='command')+1;
  while(i<words.length) {
    if(['-H','-L','-P'].includes(words[i].value) || /^-O[0-3]$/.test(words[i].value)) i++;
    else if(words[i].value==='-D' && words[i+1]) i+=2;
    else break;
  }
  while(i<words.length && !words[i].value.startsWith('-')) {
    if(['!','(',')',','].includes(words[i].value)) return 'Unsupported find expression operator';
    i++;
  }
  const argumentPredicates=new Set(['-name','-iname','-path','-ipath','-regex','-iregex','-type','-mtime','-mmin','-maxdepth','-mindepth','-newer']);
  for(;i<words.length;i++) {
    const primary=words[i].value;
    if(argumentPredicates.has(primary)) {
      const argument=words[++i];
      if(!argument) return 'Invalid find expression: missing predicate argument';
      if(['-mtime','-mmin'].includes(primary) && !/^[+-]?\d+$/.test(argument.value)) return 'Unsupported find age argument';
      if(['-maxdepth','-mindepth'].includes(primary) && !/^\d+$/.test(argument.value)) return 'Invalid find depth argument';
      if(primary==='-type' && !/^[bcdflpsD]$/.test(argument.value)) return 'Invalid find type argument';
    } else if(['-exec','-execdir','-ok','-okdir'].includes(primary)) {
      if(![';','+'].includes(words[++i]?.value)) return 'Invalid find execution terminator';
    } else if(!['-delete','-print','-print0','-depth','-true','-false'].includes(primary)) {
      return primary.startsWith('-') ? 'Unsupported find predicate or operator' : 'Invalid find expression: paths must precede expression';
    }
  }
  return null;
}

/** Keep quote provenance: decoded words cannot distinguish x{,""} from literals. */
function unquotedWordHas(text: string, special: string): boolean {
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && quote !== "'") { i++; continue; }
    if (quote) { if (ch === (quote === 'ansi' ? "'" : quote)) quote = ''; continue; }
    if (text.startsWith("$'", i)) { quote = 'ansi'; i++; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === special) return true;
  }
  return false;
}

export const hasUnquotedBrace = (text: string) => unquotedWordHas(text, '{');
export const hasUnquotedTilde = (text: string) => unquotedWordHas(text, '~');
