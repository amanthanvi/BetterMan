import type { ShellStage } from './_shellParser';

export type DestructiveSignal = { description: string; dryRun: string | null };
type Token = {kind: string; value: string; text: string; start: number; anchor: string | null};
export type SafetyStage = {stage: ShellStage; tokens: Token[]; command: string};
// These are properties of commands, never predictions about the submitted line.
export const COMMAND_FACTS = {
  rm: 'rm deletes files.',
  find: 'find -delete deletes the files it matches.',
  git: 'git clean deletes files from the working tree.',
  mkfs: 'mkfs creates a new filesystem, erasing what the device held.',
  truncate: 'truncate changes file sizes; a size of 0 empties a file.',
  redirect: '> replaces the contents of the file it writes to.',
} as const;
const RM_HINT = 'Run it with `ls -d` in place of `rm` first to see what it would act on.';
const WRAPPER_OPTIONS: Record<string, readonly string[]> = {
  sudo: ['-u','--user','-g','--group','-n','--non-interactive','-E','--preserve-env','-H','--set-home','-A','--askpass','-S','--stdin','-h','--host','-r','--role','-t','--type'],
  doas: ['-u','-n'], env: ['-i','--ignore-environment','-u','--unset','-C','--chdir','-a','--argv0'],
  nice: ['-n','--adjustment'], timeout: ['-s','--signal','-k','--kill-after','--foreground','--preserve-status','-v','--verbose'],
  nohup: [], time: ['-p','--portability','-f','--format','-o','--output','-a','--append','-v','--verbose','-q','--quiet'],
  command: ['-p'], exec: ['-a','-c','-l'],
  xargs: ['-0','--null','-r','--no-run-if-empty','-I','-i','--replace','-n','--max-args','-P','--max-procs','-d','--delimiter','-s','--max-chars','-E','-e','--eof','-L','-l','--max-lines','-a','--arg-file','-p','--interactive','-t','--verbose','-x','--exit'],
};
const options = (tokens: Token[]) => tokens.filter(t=>t.kind==='option');
const has = (tokens: Token[], ...flags: string[]) => options(tokens).some(t=>flags.includes(t.value));

/** Admit only actual command positions through wrappers whose execution mode is known. */
export function destructiveSignals(stage: ShellStage, tokens: Token[], command: string, ancestors: SafetyStage[] = []): DestructiveSignal[] {
  const chain = [...ancestors,{stage,tokens,command}];
  if((command==='mke2fs' || command.startsWith('mkfs')) && has(tokens,'-V')) return [];
  if(chain.some(context=>context.tokens.some(t=>t.kind==='unknown') || has(context.tokens,'--help','--version'))) return [];
  for(let i=0;i<ancestors.length;i++) {
    const parent=ancestors[i], relation=chain[i+1].stage.relation;
    if(relation==='exec') {
      if(parent.command!=='find' || !has(parent.tokens,'-exec','-execdir')) return [];
    } else if(relation==='wrapper') {
      const allowed=WRAPPER_OPTIONS[parent.command];
      if(!allowed || options(parent.tokens).some(t=>!allowed.includes(t.value))) return [];
    }
  }
  const hintReplacementSafe = (inserted: string) => !chain.some(context=>context.stage.tokens.some(t=>(t.dynamic && !t.replacement) || t.kind==='glob')) && !chain.some(context=>context.stage.tokens.some(t=>t.replacement && inserted.includes(t.replacement.marker)));
  const runtime = stage.tokens.some(t=>t.dynamic);
  const xargs = ancestors.filter(context=>context.command==='xargs');
  const appends = xargs.some(context=>!has(context.tokens,'-I','-i','--replace'));
  const verb=tokens.findIndex(t=>t.kind==='subcommand');
  const globals=verb < 0 ? [] : tokens.slice(0,verb);
  const facts: DestructiveSignal[]=[];
  const note=(description:string,dryRun:string|null=null)=>facts.push({description,dryRun});
  if(command==='rm') {
    const previewWrappers=ancestors.every(context=>options(context.tokens).every(t=>(context.command==='find' ? ['-exec','-execdir','-name','-iname','-H','-L','-P'] : context.command==='xargs' ? ['-0','--null','-I','-i','--replace','-r','--no-run-if-empty','-p','--interactive','-t','--verbose'] : []).includes(t.value)) && ['find','xargs'].includes(context.command));
    const previewOptions=options(tokens).every(t=>['-f','-r','-R'].includes(t.value));
    const operands=tokens.some(t=>['argument','glob','expansion'].includes(t.kind));
    note(COMMAND_FACTS.rm, previewWrappers && previewOptions && (operands || appends) && hintReplacementSafe('ls -d') ? RM_HINT : null);
  } else if(command==='find' && has(tokens,'-delete') && !appends) {
    const previewOptions=options(tokens).every(t=>['-delete','-name','-iname','-H','-L','-P'].includes(t.value));
    note(COMMAND_FACTS.find, previewOptions && !runtime && hintReplacementSafe('-print') ? 'Run it with `-print` in place of `-delete` first.' : null);
  } else if(command==='git-clean' || (command==='git' && tokens.some(t=>t.kind==='subcommand' && t.value==='clean'))) {
    note(COMMAND_FACTS.git, !has(tokens,'-n','--dry-run') && !runtime && !ancestors.length && !options(globals).length ? 'Run `git clean -n` first.' : null);
  } else if(command==='mke2fs' || /^mkfs(?:\.[A-Za-z0-9]+)?$/.test(command)) {
    const raw=stage.tokens.find(t=>t.kind==='command')?.value;
    const dryRun=command==='mke2fs' || raw==='mkfs.ext4';
    note(COMMAND_FACTS.mkfs, dryRun && !options(tokens).length && hintReplacementSafe('-n') ? 'Add `-n` to see what it would do.' : null);
  } else if(command==='truncate' && has(tokens,'-s','--size')) note(COMMAND_FACTS.truncate);

  // Only literal file-shaped targets. Normalize special-directory spellings
  // conservatively; no filesystem inspection or file-type prediction occurs.
  if(!ancestors.length && !stage.tokens.some(t=>t.kind==='unknown')) {
    for(let i=0;i<stage.tokens.length;i++) {
      const redirect=stage.tokens[i], target=stage.tokens[i+1];
      if(redirect.kind!=='redirect' || !/^(?:\d*>\|?|&>)$/.test(redirect.value) || target?.kind!=='redirectTarget' || target.dynamic) continue;
      if(!target.value || target.value.startsWith('~') || target.value.split('/').some(part=>['dev','proc','sys'].includes(part))) continue;
      note(COMMAND_FACTS.redirect); break;
    }
  }
  return facts;
}
