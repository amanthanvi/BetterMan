import type { ShellStage } from './_shellParser';

export type DestructiveSignal = { description: string; dryRun: string | null };
type Token = {kind: string; value: string; text: string; start: number; anchor: string | null};
const specialFile = (value: string) => /^\/dev\/(?:null|std(?:in|out|err)|tty|fd\/.*)$/.test(value);

/** Describe literal operations under standard command semantics, never execution results. */
export function destructiveSignals(stage: ShellStage, tokens: Token[], command: string, parentCommand?: string): DestructiveSignal[] {
  if (stage.tokens.some(t => t.dynamic || t.kind === 'unknown' || t.kind === 'glob') || tokens.some(t => t.kind === 'unknown')) return [];
  const flags = tokens.filter(t => t.kind === 'option');
  const has = (...values: string[]) => flags.some(t => values.includes(t.value));
  const arg = (...values: string[]) => {
    const matches = tokens.filter(t => t.kind === 'option' && values.includes(t.value));
    if (matches.length !== 1) return null;
    const i = tokens.findIndex(t => t.kind === 'option' && values.includes(t.value));
    return i >= 0 && tokens[i + 1]?.kind === 'optionArgument' ? tokens[i + 1].value : null;
  };
  const operands = tokens.filter(t => t.kind === 'argument').map(t => t.value);
  const literal = operands.filter(value => !specialFile(value));
  const flagText = [...new Map(flags.map(t => [t.start, t.text])).values()].join(' ');
  const label = [command === 'git-clean' ? 'git clean' : command, flagText].filter(Boolean).join(' ');
  const signals: DestructiveSignal[] = [];
  if (has('--help', '--version') || operands.some(specialFile)) return [];
  const note = (description: string, dryRun: string | null = null) => signals.push({description, dryRun});
  if (command === 'rm') {
    let force = false, interactive = false;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.kind !== 'option') continue;
      if (['-f','--force'].includes(t.value)) {force = true; interactive = false;}
      if (['-i','-I','--interactive'].includes(t.value)) {
        interactive = !(t.value === '--interactive' && tokens[i+1]?.kind === 'optionArgument' && tokens[i+1].value === 'never');
        force = false;
      }
    }
    if (!interactive && (literal.length || parentCommand === 'xargs')) {
      const targets = literal.includes('{}') ? 'each path substituted for {}' : literal.length ? literal.join(', ') : 'the paths supplied by xargs';
      const recursive = has('-r','-R','--recursive') ? ' and everything under it' : '';
      note(`${label} removes ${targets}${recursive}${force ? ' without prompting' : ''}.`, 'run the line with `ls -d` in place of `rm` first');
    }
  }
  if (command === 'find' && has('-delete')) {
    const firstOption = stage.tokens.findIndex(t => t.value.startsWith('-'));
    const roots = stage.tokens.slice(1, firstOption < 0 ? undefined : firstOption).filter(t => t.kind === 'word').map(t => t.value);
    note(`${label} deletes matching files and empty directories under ${roots.join(', ') || '.'}.`, '`-print` in place of `-delete`');
  }
  if (command === 'dd') {
    const outputs = operands.filter(value => value.startsWith('of='));
    const output = outputs.length === 1 ? outputs[0].slice(3) : null;
    if (output && !specialFile(output)) note(`dd writes input data to ${output}.`);
  }
  if (/^mkfs(?:\.[a-z0-9]+)?$/.test(command) && literal.length === 1 && !has('-n','--dry-run','-V')) {
    note(`${label} creates a filesystem on ${literal[0]}, replacing its filesystem structures.`, command === 'mkfs.ext4' ? 'add `-n`' : null);
  }
  if (command === 'truncate' && literal.length) {
    const size = arg('-s','--size');
    if (size === '0') note(`truncate sets the length of ${literal.join(', ')} to zero bytes.`);
    else if (size && /^-[0-9]+[KMGTPEZY]?[B]?$/i.test(size)) note(`truncate requests a size reduction of ${size.slice(1)} for ${literal.join(', ')}.`);
    else if (size && /^<[0-9]+[KMGTPEZY]?[B]?$/i.test(size)) note(`truncate limits the length of ${literal.join(', ')} to at most ${size.slice(1)}.`);
  }
  if (command === 'shred' && literal.length && (arg('-n','--iterations') !== '0' || has('-z','--zero'))) note(`shred overwrites the contents of ${literal.join(', ')}.`);
  if (command === 'tar' && has('--remove-files') && literal.length) note(`tar --remove-files removes ${literal.join(', ')} after adding them to the archive.`);
  if (command === 'rsync' && has('--delete') && !has('-n','--dry-run') && literal.length >= 2) note(`rsync --delete deletes destination entries in ${literal.at(-1)} that are absent from ${literal.slice(0,-1).join(', ')}.`, 'add `--dry-run`');
  if (command === 'git-clean' && has('-f','--force') && !has('-n','--dry-run','-i','--interactive')) note(`${label} removes untracked files${has('-d') ? ' and directories' : ''} under ${literal.join(', ') || '.'}.`, '`-n` in place of `-f`');
  for (let i=0; i<stage.tokens.length; i++) {
    const t=stage.tokens[i], target=stage.tokens[i+1];
    if (t.kind !== 'redirect' || !/^(?:\d*>\|?|&>|>&)$/.test(t.value) || target?.kind !== 'redirectTarget' || specialFile(target.value)) continue;
    if (t.value === '>&' && /^[-0-9]+$/.test(target.value)) continue;
    note(`${t.text} opens ${target.value} for output with truncation.`);
  }
  return signals;
}
