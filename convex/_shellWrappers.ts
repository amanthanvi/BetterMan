import type {ShellToken} from './_shellParser';
import {SUPPORTED_SHELL_GRAMMAR} from './_shellGrammar';

/** Execution options only. Unsupported modes/values must never authorize a child. */
export const EXECUTING_WRAPPER_SWITCHES: Record<string, readonly string[]> = {
  sudo: ['-n','--non-interactive','-E','-H','--set-home','-A','--askpass','-S','--stdin'],
  doas: ['-n'], env: ['-i','--ignore-environment'],
  timeout: ['--foreground','--preserve-status','-v','--verbose'], nice: [], nohup: [],
  time: ['-p','--portability','-a','--append','-v','--verbose','-q','--quiet'],
  command: ['-p'], exec: ['-c','-l'],
  xargs: ['-0','--null','-r','--no-run-if-empty','-p','--interactive','-t','--verbose','-x','--exit'],
};
const OPAQUE: Record<string, readonly string[]> = {
  sudo:['-s','-i','--shell','--login','-l','--list','-v','--validate','-k','--reset-timestamp','-K','--remove-timestamp','-e','--edit'],
  doas:['-s','-C'], env:['-S','--split-string'], command:['-v','-V'],
};
const duration=(v:string)=>/^(?:\d+(?:\.\d*)?|\.\d+)[smhd]?$/.test(v) && Number.isFinite(Number(v.replace(/[smhd]$/,'')));
const integer=(v:string,min:number,max=2147483647)=>/^[+-]?\d+$/.test(v) && Number.isSafeInteger(Number(v)) && Number(v)>=min && Number(v)<=max;
const user=(v:string)=>/^(?:[A-Za-z_][A-Za-z0-9_.-]*\$?|\d+|#\d+)$/.test(v);
const literal=(v:string)=>v.length>0 && !/[\x00-\x1f\x7f]/.test(v);
const SIGNALS=new Set('HUP INT QUIT ILL TRAP ABRT IOT BUS FPE KILL USR1 SEGV USR2 PIPE ALRM TERM STKFLT CHLD CLD CONT STOP TSTP TTIN TTOU URG XCPU XFSZ VTALRM PROF WINCH IO POLL PWR SYS'.split(' '));
function validValue(name:string,flag:string,value:string):boolean {
  if(name==='timeout') return ['-s','--signal'].includes(flag) ? integer(value,0,64) || SIGNALS.has(value.replace(/^SIG/,'')) : duration(value);
  if(name==='nice') return integer(value,-2147483648);
  if(name==='sudo' || name==='doas') {
    if(['-u','--user','-g','--group'].includes(flag)) return user(value);
    if(flag==='-C') return integer(value,3);
    if(flag==='-T') return integer(value,0);
    if(['-h','--host','-r','--role','-t','--type'].includes(flag)) return /^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/.test(value);
    return literal(value);
  }
  if(name==='env' && ['-u','--unset'].includes(flag)) return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
  if(name==='xargs') {
    if(['-n','--max-args','-L','--max-lines','-l','-s','--max-chars'].includes(flag)) return integer(value,1);
    if(['-P','--max-procs'].includes(flag)) return integer(value,0);
    if(['-d','--delimiter'].includes(flag)) return value.length===1 || /^\\(?:[abfnrtv\\]|[0-7]{1,3}|x[0-9a-fA-F]{1,2})$/.test(value);
    if(['-E','-e','--eof'].includes(flag)) return !/[\x00-\x1f\x7f]/.test(value);
    return literal(value);
  }
  if((name==='time' && ['-f','--format'].includes(flag)) || (name==='exec' && flag==='-a') || (name==='env' && ['-a','--argv0'].includes(flag))) return !/[\x00-\x1f\x7f]/.test(value);
  return literal(value);
}
export function executingWrapperOptions(name:string):readonly string[] {
  return [...(SUPPORTED_SHELL_GRAMMAR.wrappers[name]??[]),...(SUPPORTED_SHELL_GRAMMAR.optionalWrapperArguments[name]??[]),...(EXECUTING_WRAPPER_SWITCHES[name]??[])].filter(flag=>!(OPAQUE[name]??[]).includes(flag));
}
export function wrapperBoundary(tokens:ShellToken[],command:number,name:string):{end:number;replacement:string|null;diagnostic:string|null} {
  let end=command+1,replacement:string|null=null;
  const fail=(reason:string)=>({end:tokens.length,replacement,diagnostic:`Cannot statically unwrap ${name}: ${reason}`});
  const required=SUPPORTED_SHELL_GRAMMAR.wrappers[name]??[],optional=SUPPORTED_SHELL_GRAMMAR.optionalWrapperArguments[name]??[];
  while(end<tokens.length && !['operator','redirect','comment'].includes(tokens[end].kind)) {
    const token=tokens[end],word=token.value;
    if(token.dynamic || token.kind==='glob') return fail('runtime option or argument');
    if(word==='--') {end++;break;}
    if(name==='env' && /^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) {token.kind='assignment';end++;continue;}
    if(!word.startsWith('-') || word==='-') break;
    let consumed=false;
    const parts=word.startsWith('--') ? [word.split('=',1)[0]] : [...word.slice(1)].map(c=>`-${c}`);
    for(let n=0;n<parts.length;n++) {
      const flag=parts[n];
      if((OPAQUE[name]??[]).includes(flag) || ['--help','--version'].includes(flag)) return fail(`non-executing or opaque mode ${flag}`);
      const takes=required.includes(flag),maybe=optional.includes(flag);
      if(!takes && !maybe && !(EXECUTING_WRAPPER_SWITCHES[name]??[]).includes(flag)) return fail(`unrecognized option ${flag}`);
      if(!takes && !maybe) {
        if(word.startsWith('--') && word.includes('=')) return fail(`unexpected value for ${flag}`);
        continue;
      }
      const attached=word.startsWith('--') ? (word.includes('=') ? word.slice(flag.length+1) : null) : (n+1<parts.length ? word.slice(n+2) : null);
      const argument=attached===null && takes ? tokens[end+1] : null;
      if(argument && (argument.dynamic || !['word','assignment'].includes(argument.kind))) return fail(`nonliteral value for ${flag}`);
      const value=attached ?? argument?.value ?? (maybe ? (['-i','--replace'].includes(flag) ? '{}' : null) : null);
      if(takes && value===null) return fail(`missing value for ${flag}`);
      if(value!==null && (!validValue(name,flag,value) || (!word.startsWith('--') && value.startsWith('=') && !(name==='xargs' && flag==='-I')))) return fail(`invalid value for ${flag}`);
      if(name==='xargs' && ['-I','-i','--replace'].includes(flag)) replacement=value;
      end+=argument ? 2 : 1;consumed=true;break;
    }
    if(!consumed) end++;
  }
  if(name==='timeout') {
    if(!tokens[end] || tokens[end].dynamic || !duration(tokens[end].value)) return fail('invalid or missing duration');
    end++;
  }
  if(!tokens[end] || ['operator','redirect','comment'].includes(tokens[end].kind)) {
    if(['sudo','doas','timeout','nohup','time'].includes(name)) return fail('missing command');
  }
  return {end,replacement,diagnostic:null};
}
