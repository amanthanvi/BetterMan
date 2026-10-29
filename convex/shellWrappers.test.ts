import {describe,it,expect} from 'vitest';
import {parseShell} from './_shellParser';
import {SUPPORTED_SHELL_GRAMMAR} from './_shellGrammar';

export const WRAPPER_FORMS=['sudo -u root','doas -u root','env -u HOME','timeout -k 1s -s TERM 5m','nice -n -5','nohup','time -f %E','command -p','exec -a name','xargs -0'];
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
  expect(parseShell(`${wrapper} ${flag} ${validValue} ${tail}`).diagnostics,`${wrapper} ${flag}`).toEqual([]);
  expect(parseShell(`${wrapper} ${flag}`).diagnostics.length,`${wrapper} ${flag} missing`).toBeGreaterThan(0);
 }
});
