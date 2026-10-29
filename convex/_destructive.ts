import type { ShellStage } from './_shellParser';

export type DestructiveSignal = { description: string; dryRun: string | null };
type Token = {kind: string; value: string; text: string; start: number; anchor: string | null};
export type SafetyStage = {stage: ShellStage; tokens: Token[]; command: string};
// This is a semantic allowlist, independent of flags found in manual pages.
// Adding an option requires modeling its effect and a positive/negative test.
export const DESTRUCTIVE_OPTIONS: Record<string, readonly string[]> = {
  rm: ['-f','--force','-r','-R','--recursive','-i','-I','--interactive'],
  find: ['-H','-L','-P','-O','-D','-name','-iname','-mtime','-mmin','-type','-maxdepth','-mindepth','-depth','-delete','-print','-print0','-exec'],
  'git-clean': ['-f','--force','-d','-x','-X','-n','--dry-run','-i','--interactive'],
  mke2fs: ['-n','-V'],
  'mkfs.ext4': ['-n','-V'],
  truncate: ['-s','--size'],
  echo: [],
};
const WRAPPER_OPTIONS: Record<string, readonly string[]> = {
  sudo: ['-u','--user','-g','--group','-n','--non-interactive'],
  xargs: ['-0','--null','-r','--no-run-if-empty','-I','--replace'],
  env: [], command: [], exec: [], nohup: [],
};
const flags = (tokens: Token[]) => tokens.filter(t => t.kind === 'option');
const has = (tokens: Token[], ...values: string[]) => flags(tokens).some(t => values.includes(t.value));
function optionArguments(tokens: Token[], ...values: string[]): string[] {
  return tokens.flatMap((t,i) => t.kind === 'option' && values.includes(t.value) && tokens[i+1]?.kind === 'optionArgument' ? [tokens[i+1].value] : []);
}
const literalPath = (value: string) => value.length > 0 && !value.startsWith('~') && !/[\u0000-\u001f]/.test(value) && !/^\/(?:dev|proc|sys)(?:\/|$)/.test(value);
const location = (value: string) => value === '.' ? 'the current directory' : value;
function modeled(tokens: Token[], allowed: readonly string[]): boolean {
  return !tokens.some(t => ['unknown','expansion','glob','assignment'].includes(t.kind) || (t.kind === 'operator' && !['|','|&','&&','||',';','&','\n'].includes(t.value))) && flags(tokens).every(t => allowed.includes(t.value));
}

// A small conjunction-only find grammar. No -o, negation, comma, pruning or
// execution actions are inferred. Global switches precede literal roots.
function findModel(stage: ShellStage): {roots: string[]; last: string; exec: boolean} | null {
  const words = stage.tokens.filter(t => !['operator','comment'].includes(t.kind)).map(t => t.value);
  let i = 1;
  while (i < words.length) {
    if (['-H','-L','-P'].includes(words[i]) || /^-O[0-3]$/.test(words[i])) i++;
    else if (words[i] === '-D' && words[i+1] && words[i+1].split(',').every(value => ['tree','search','stat','rates','opt','exec','all','time'].includes(value))) i += 2;
    else break;
  }
  const roots: string[] = [];
  while (i < words.length && !words[i].startsWith('-')) {
    if (!literalPath(words[i]) || ['!','(',')',','].includes(words[i])) return null;
    roots.push(words[i++]);
  }
  let last = '', exec = false;
  for (; i < words.length; i++) {
    last = words[i];
    if (['-name','-iname','-mtime','-mmin','-type','-maxdepth','-mindepth'].includes(last)) {
      const value = words[++i];
      if (!value || (['-mtime','-mmin'].includes(last) && !/^[+-]?\d+$/.test(value)) || (['-maxdepth','-mindepth'].includes(last) && !/^\d+$/.test(value)) || (last === '-type' && !/^[bcdflpsD]$/.test(value))) return null;
    } else if (last === '-exec') {
      // The parser has moved the command into its own child stage.
      if (![';','+'].includes(words[++i])) return null;
      exec = true;
    } else if (!['-depth','-delete','-print','-print0'].includes(last)) return null;
  }
  return {roots: roots.length ? roots : ['.'], last, exec};
}

/** Only describe a fully modeled literal operation; no runtime outcome claim. */
export function destructiveSignals(stage: ShellStage, resolved: Token[], canonical: string, ancestors: SafetyStage[] = []): DestructiveSignal[] {
  if (stage.tokens.some(t => t.dynamic || ['unknown','glob'].includes(t.kind) || /\{[^{}]*(?:,|\.\.)[^{}]*\}/.test(t.text))) return [];
  let replacement: string | null = null, supplied = false, findExec = false;
  for (const parent of ancestors) {
    const name = parent.command;
    if (name === 'find' && stage.relation === 'exec') {
      const model = findModel(parent.stage);
      if (!modeled(parent.tokens, DESTRUCTIVE_OPTIONS.find) || !model?.exec || parent.stage.tokens.some(t => t.dynamic)) return [];
      findExec = true;
    } else {
      const allowed = WRAPPER_OPTIONS[name];
      if (!allowed || !modeled(parent.tokens, allowed) || parent.tokens.some(t => ['argument','redirect','redirectTarget'].includes(t.kind))) return [];
      if (name === 'xargs') {
        const replacements = optionArguments(parent.tokens,'-I','--replace');
        if (replacements.length > 1) return [];
        replacement = replacements[0] ?? (has(parent.tokens,'--replace') ? '{}' : null);
        if (replacement !== null && (!replacement || /[\u0000-\u0020]/.test(replacement))) return [];
        supplied = true;
      }
    }
  }
  let tokens = resolved;
  let directory = '.';
  const verb = tokens.findIndex(t => t.kind === 'subcommand');
  if (canonical === 'git-clean' || (canonical === 'git' && tokens[verb]?.value === 'clean')) {
    canonical = 'git-clean';
    if (verb >= 0) {
      const globals = tokens.slice(0,verb);
      if (!modeled(globals,['-C']) || flags(globals).length > 1) return [];
      directory = optionArguments(globals,'-C')[0] ?? '.';
      if (!literalPath(directory)) return [];
      tokens = tokens.slice(verb+1);
    }
  }
  if (canonical !== 'echo' && tokens.some(t => ['redirect','redirectTarget'].includes(t.kind))) return [];
  const allowed = DESTRUCTIVE_OPTIONS[canonical];
  if (!allowed || !modeled(tokens,allowed)) return [];
  const operands = tokens.filter(t => t.kind === 'argument').map(t => t.value);
  if (operands.some(value => !literalPath(value) && !(['mke2fs','mkfs.ext4'].includes(canonical) && /^\/dev\/(?!null$|std|tty$|fd\/)[A-Za-z0-9/_-]+$/.test(value)))) return [];
  const note = (description: string, dryRun: string | null = null) => [{description,dryRun}];
  if (canonical === 'rm') {
    let force = false, interactive = false;
    for (let i=0;i<tokens.length;i++) {
      const t = tokens[i];
      if (t.kind !== 'option') continue;
      if (['-f','--force'].includes(t.value)) {force=true; interactive=false;}
      else if (['-i','-I','--interactive'].includes(t.value)) {
        const when = t.value === '--interactive' && tokens[i+1]?.kind === 'optionArgument' ? tokens[i+1].value : 'always';
        if (!['always','once','never'].includes(when)) return [];
        interactive=when !== 'never'; force=false;
      }
    }
    // rm refuses root and dot/dot-dot operands by default. Do not infer a
    // filesystem identity or removal for these special path forms.
    if (interactive || operands.some(p => !p.replace(/[/.]/g,'') || p.split('/').includes('..') || p.split('/').filter(Boolean).at(-1) === '.')) return [];
    if (!operands.length && !supplied) return [];
    let targets = operands.join(', ');
    if (replacement && operands.some(value => value.includes(replacement))) {
      // Mixed/template paths require expansion; only an exact placeholder is modeled.
      if (operands.some(value => value !== replacement)) return [];
      targets = `each input line substituted for ${replacement}`;
    } else if (findExec && operands.includes('{}')) {
      if (operands.some(value => value !== '{}')) return [];
      targets = 'each path substituted for {}';
    } else if (supplied) targets = [targets,'the paths supplied by xargs'].filter(Boolean).join(' and ');
    return note(`rm requests removal of ${targets}${has(tokens,'-r','-R','--recursive') ? ' with recursive directory traversal' : ''}${force ? ' without prompting' : ''}.`, 'run the line with `ls -d` in place of `rm` first');
  }
  if (canonical === 'find') {
    const model = findModel(stage);
    if (!model || model.last !== '-delete' || model.exec) return [];
    return note(`find -delete requests deletion of matching files and empty directories in the tree rooted at ${model.roots.map(location).join(', ')}.`, '`-print` in place of `-delete`');
  }
  if (canonical === 'git-clean') {
    if (!has(tokens,'-f','--force') || has(tokens,'-n','--dry-run','-i','--interactive') || (has(tokens,'-x') && has(tokens,'-X')) || operands.length) return [];
    const category = has(tokens,'-X') ? 'ignored' : has(tokens,'-x') ? 'untracked, including ignored' : 'non-ignored untracked';
    return note(`git clean requests removal of ${category} files${has(tokens,'-d') ? ' and directories' : ''} in ${location(directory)}.`, '`-n` in place of `-f`');
  }
  if (['mke2fs','mkfs.ext4'].includes(canonical)) {
    if (flags(tokens).length || operands.length !== 1) return [];
    // Device operands are intentional here; unlike redirection they request a filesystem.
    return note(`${canonical} requests creation of a filesystem on ${operands[0]}, replacing its filesystem structures.`, 'add `-n`');
  }
  if (canonical === 'truncate') {
    const sizes = optionArguments(tokens,'-s','--size');
    return operands.length && sizes.length === 1 && sizes[0] === '0' ? note(`truncate requests a length of zero bytes for ${operands.join(', ')}.`) : [];
  }
  if (canonical === 'echo') {
    const redirects = stage.tokens.filter(t => t.kind === 'redirect');
    if (redirects.length !== 1 || !/^(?:\d*>\|?|&>|>&)$/.test(redirects[0].value)) return [];
    const target = stage.tokens[stage.tokens.indexOf(redirects[0])+1];
    if (target?.kind !== 'redirectTarget' || !literalPath(target.value) || /^[-0-9]+$/.test(target.value)) return [];
    return note(`${redirects[0].text} requests output to ${target.value} with truncation.`);
  }
  return [];
}
