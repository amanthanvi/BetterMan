import {describe,it,expect} from 'vitest';
import {validXargsDelimiter} from './_shellWrappers';
import delimiters from './fixtures/xargs-delimiters.json';
import {parseShell} from './_shellParser';
import {SUPPORTED_SHELL_GRAMMAR} from './_shellGrammar';

export const WRAPPER_FORMS=['sudo -u root','doas -u root','env -u HOME','timeout -k 1s -s TERM 5m','nice -n -5','nohup','/usr/bin/time -f %E','command -p','exec -a name','xargs -0'];
export const INVALID_WRAPPERS=[
 'timeout invalid rm x','timeout -k invalid 5 rm x','timeout -s INVALID 5 rm x','timeout -s 999 5 rm x','timeout -k=1 5 rm x','timeout 5',
 'nice -n invalid rm x','nice -n 99999999999999999 rm x','nice -n=5 rm x',
 'sudo -u "bad user" rm x','sudo -u "" rm x','sudo -C 2 rm x','sudo -T invalid rm x','sudo -u',
 'doas -u "bad user" rm x','env -u BAD-NAME rm x','env -u "" rm x',
 'xargs -n 0 rm x','xargs -n invalid rm x','xargs -L invalid rm x','xargs --max-lines=invalid rm x','xargs -P -1 rm x','xargs -s 0 rm x','xargs -d ab rm x',
 'time -o "" rm x',
 ...Object.keys(SUPPORTED_SHELL_GRAMMAR.wrappers).map(wrapper=>`${wrapper} --unknown-wrapper-option rm x`),
];
describe('modeled wrappers',()=>{
 it.each(INVALID_WRAPPERS)('diagnoses invalid wrapper values/modes: %s',cmd=>expect(parseShell(cmd).diagnostics.length).toBeGreaterThan(0));
 it.each([
  'timeout .5s rm x','timeout --kill-after=1h --signal=SIGTERM 2.5m rm x','nice --adjustment=-10 rm x',
  'sudo -u "#123" rm x','doas -u 123 rm x','env --unset=HOME rm x','xargs --max-lines rm x','xargs --max-lines=2 rm x','xargs -d "\\n" rm x',
 ])('admits validated wrapper values: %s',cmd=>expect(parseShell(cmd).diagnostics).toEqual([]));
 it.each(WRAPPER_FORMS)('lifts interleaved redirects across %s',wrapper=>{
  const parts=wrapper.split(' ');
  for(let i=0;i<=parts.length;i++) {
   const words=[...parts];words.splice(i,0,'>out');
   const result=parseShell(words.join(' ')+' rm x');
   expect(result.diagnostics).toEqual([]);
   expect(result.stages.map(s=>s.tokens.find(t=>t.kind==='command')?.value)).toEqual([parts[0],'rm']);
   expect(result.stages[0].tokens.filter(t=>t.kind==='redirect').length).toBe(1);
   expect(result.stages[1].tokens.some(t=>t.kind==='redirect')).toBe(false);
  }
 });
 it.each(Object.keys(SUPPORTED_SHELL_GRAMMAR.wrappers))('does not unwrap a comment into a command: %s',wrapper=>{
  const result=parseShell(`${wrapper} # rm x`);
  expect(result.stages.some(s=>s.tokens.some(t=>t.kind==='command' && t.value==='rm'))).toBe(false);
 });
});

it.each(WRAPPER_FORMS)('applies boundaries and partial-quote expansion rules under %s',wrapper=>{
 for(const op of ['|','&&','||']) expect(parseShell(`${wrapper} rm x ${op} # hi`).diagnostics.length).toBeGreaterThan(0);
 expect(parseShell(`${wrapper} rm x; # hi`).diagnostics).toEqual([]);
 for(const word of ["x{,''}",'x{,""}','pre"$HOME"','pre$(echo x)"suffix"','pre`echo x`\'suffix\'', '~"/path"']) expect(parseShell(`${wrapper} rm ${word}`).diagnostics.length).toBeGreaterThan(0);
 for(const word of ["'x{,}'",'"x{,}"','x\\{,\\}']) expect(parseShell(`${wrapper} rm ${word}`).diagnostics).toEqual([]);
});

it('validates every required wrapper option, including missing values',()=>{
 for(const [wrapper,flags] of Object.entries(SUPPORTED_SHELL_GRAMMAR.wrappers)) for(const flag of flags) {
  if(wrapper==='doas' && flag==='-C') continue; // configuration checking is intentionally opaque
  const value=wrapper==='timeout' ? (['-s','--signal'].includes(flag) ? 'TERM' : '1s')
   : wrapper==='nice' ? '-1' : wrapper==='sudo' && flag==='-C' ? '3'
   : wrapper==='sudo' && flag==='-T' ? '1'
   : wrapper==='xargs' && ['-n','--max-args','-P','--max-procs','-s','--max-chars','-L'].includes(flag) ? '1' : 'VALUE';
  const validValue=wrapper==='xargs' && ['-d','--delimiter'].includes(flag) ? ':' : value;
  const tail=wrapper==='timeout' ? '5 rm x' : 'rm x';
  const program=wrapper==='time'?'/usr/bin/time':wrapper;
  expect(parseShell(`${program} ${flag} ${validValue} ${tail}`).diagnostics,`${wrapper} ${flag}`).toEqual([]);
  expect(parseShell(`${program} ${flag}`).diagnostics.length,`${wrapper} ${flag} missing`).toBeGreaterThan(0);
 }
});


it.each(delimiters)('matches GNU delimiter admission for $value',({value,accepted})=>{
 expect(validXargsDelimiter(value)).toBe(accepted);
 for(const argument of [`-d ${JSON.stringify(value)}`,`--delimiter=${JSON.stringify(value)}`,`-d${JSON.stringify(value)}`]) expect(parseShell(`xargs ${argument} rm x`).diagnostics.length===0).toBe(accepted);
});
it.each(WRAPPER_FORMS)('keeps assignment syntax at its real argv level under %s',wrapper=>{
  const acceptsAssignment=['sudo','env'].includes(wrapper.split(' ')[0]);
  for(const prefix of ['', 'OUTER=1 ']) for(const assignment of ['VAR=value', "'VAR=value'", 'VAR=one OTHER=two']) {
    const result=parseShell(`${prefix}${wrapper} ${assignment} rm x`);
    expect(result.diagnostics.length===0).toBe(acceptsAssignment);
    expect(result.stages.some(s=>s.tokens.some(t=>t.kind==='command' && t.value==='rm'))).toBe(acceptsAssignment);
    if(!acceptsAssignment) expect(result.stages.flatMap(s=>s.tokens).some(t=>t.kind==='unknown' && t.value.startsWith('VAR='))).toBe(true);
  }
});
it.each(WRAPPER_FORMS)('applies nested env boundaries and delimiter ranges under %s',wrapper=>{
  for(const program of ['--','-u VAR','--unset=VAR']) {
    const result=parseShell(`${wrapper} env VAR=value ${program} rm x`);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.stages.some(s=>s.tokens.some(t=>t.kind==='command' && t.value==='rm'))).toBe(false);
  }
  for(const delimiter of ['\\400','\\777','\\x100','\\q']) expect(parseShell(`${wrapper} xargs -d '${delimiter}' rm x`).diagnostics.length).toBeGreaterThan(0);
  for(const delimiter of ['\\377','\\xFF','\\n',',']) expect(parseShell(`${wrapper} xargs -d '${delimiter}' rm x`).diagnostics).toEqual(wrapper.startsWith('xargs') ? ['Unsupported nested xargs input dependency'] : []);
});
it.each(['timeout 1','nice','nohup','command','exec','doas','/usr/bin/time','xargs'])('does not skip assignment-shaped executables after %s',wrapper=>{
 const result=parseShell(`${wrapper} VAR=value rm x`);
 expect(result.diagnostics.length).toBeGreaterThan(0);
 expect(result.stages.at(-1)?.tokens[0]).toMatchObject({kind:'unknown',value:'VAR=value'});
});
it('retains top-level and documented wrapper assignments',()=>{
 for(const cmd of ['VAR=value rm x','env VAR=value rm x','env -- VAR=value rm x','sudo VAR=value rm x','sudo -u root VAR=value rm x','env A=1 sudo B=2 env C=3 rm x']) {
  const result=parseShell(cmd);expect(result.diagnostics).toEqual([]);
  expect(result.stages.some(s=>s.tokens.some(t=>t.kind==='command' && t.value==='rm'))).toBe(true);
 }
});

it.each(['sudo -- VAR=1 rm x','sudo -u root -- VAR=1 rm x'])('ends sudo assignments at --: %s',cmd=>{
 const result=parseShell(cmd);
 expect(result.diagnostics.length).toBeGreaterThan(0);
 expect(result.stages.at(-1)?.tokens[0]).toMatchObject({kind:'unknown',value:'VAR=1'});
});
it.each(WRAPPER_FORMS.filter(w=>!w.startsWith('command') && !w.startsWith('exec') && !w.startsWith('time')).concat('/usr/bin/time'))('never restores builtin dispatch below external %s',wrapper=>{
 for(const builtin of ['command','exec','builtin','type','eval','source','export']) {
  const result=parseShell(`${wrapper} ${builtin} rm x`);
  expect(result.diagnostics.length,`${wrapper} ${builtin}`).toBeGreaterThan(0);
  expect(result.stages.some(s=>s.tokens.some(t=>t.kind==='command' && t.value==='rm'))).toBe(false);
 }
});
it.each(['command exec rm x','time command rm x','sudo env VAR=1 nice rm x','env /usr/bin/time rm x'])('keeps supported shell/external contexts for %s',cmd=>expect(parseShell(cmd).diagnostics).toEqual([]));
it.each(['env command rm x','env exec rm x','exec command rm x','command env command rm x','time -f %E rm x'])('diagnoses external/keyword dispatch rather than guessing a shell: %s',cmd=>expect(parseShell(cmd).diagnostics.length).toBeGreaterThan(0));

it.each(['>out','2>&1','<input'])('redirect provenance blocks time keyword dispatch: %s',redirect=>{
 for(const prefix of ['', 'time ']) for(const builtin of ['command','exec']) expect(parseShell(`${prefix}${redirect} time ${builtin} rm x`).diagnostics.length).toBeGreaterThan(0);
});
it.each(['xargs -p','xargs --interactive','xargs xargs -r','xargs env xargs -I z','env -i doas -n','exec -c doas -n'])('fails closed on interactive/input/lookup dependencies: %s',prefix=>{
 for(const target of ['rm x','truncate -s 0 f']) expect(parseShell(`${prefix} ${target}`).diagnostics.length).toBeGreaterThan(0);
});

it.each(['>out','2>&1','<input'])('does not lift a redirect across time keyword options: %s',redirect=>{
 for(const target of ['rm x','truncate -s 0 f']) expect(parseShell(`time ${redirect} -p ${target}`).diagnostics.length).toBeGreaterThan(0);
 expect(parseShell(`time -p ${redirect} rm x`).diagnostics).toEqual([]);
});
