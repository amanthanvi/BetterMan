// Deterministic, checked-in covering corpus. Every ordered canonical chain up
// to depth three is crossed with each position's option/assignment forms.
// Builtin and redirect axes use every position; builtin choices rotate across
// canonical neighbours, with exhaustive builtin coverage for depth <= two.
export const wrappers = [
 {name:'sudo', canonical:'sudo -n', forms:['sudo -u root','sudo --unknown-wrapper-option','sudo --','sudo VAR=1','sudo -- VAR=1','sudo -u root -- VAR=1','sudo VAR=1 --','sudo -l']},
 {name:'env', canonical:'env', forms:['env -i','env -u VAR','env --unknown-wrapper-option','env --','env VAR=1','env -- VAR=1','env VAR=1 --','env VAR=1 -u VAR','env -S']},
 {name:'timeout', canonical:'timeout 5', forms:['timeout -k 1 -s TERM 5','timeout invalid','timeout -- 5','timeout -k bad 5']},
 {name:'nice', canonical:'nice', forms:['nice -n 1','nice -n bad','nice --','nice -n -1']},
 {name:'nohup', canonical:'nohup', forms:['nohup --','nohup --unknown-wrapper-option','nohup -n 1']},
 {name:'time', canonical:'time', forms:['time -p','time -f %E','time --','time -o out']},
 {name:'external-time', canonical:'/usr/bin/time', forms:['/usr/bin/time -p','/usr/bin/time -f %E','/usr/bin/time --','/usr/bin/time --unknown-wrapper-option','/usr/bin/time -o out']},
 {name:'command', canonical:'command', forms:['command -p','command --','command -v','command -V','command --unknown-wrapper-option']},
 {name:'exec', canonical:'exec', forms:['exec -a probe','exec -c','exec --','exec --unknown-wrapper-option']},
 {name:'doas', canonical:'doas -n', forms:['doas -u root','doas --','doas -u bad/user','doas -C /etc/doas.conf']},
 {name:'xargs', canonical:'xargs', forms:['xargs -0','xargs -n 1','xargs --','xargs -n bad','xargs -r','xargs -p','xargs -a input',"xargs -d '\\400'",'xargs -I z']},
];
export const builtins=['command','exec','builtin','type','eval','time','source','export','cd','echo','printf',':'];
export const targets=['rm x','truncate -s 0 f'];
const chainText=(forms,target)=>[...forms,target].join(' ');
export function generateCases() {
 const cases=new Map();
 const add=(forms,target,category)=>{
  const cmd=chainText(forms,target);
  if(!cases.has(cmd)) cases.set(cmd,{cmd,target:target.startsWith('rm')?'rm':'truncate',category});
 };
 const chains=[[]];
 for(let depth=1;depth<=3;depth++) {
  const extend=prefix=>{if(prefix.length===depth) {chains.push(prefix);return;}for(let i=0;i<wrappers.length;i++) extend([...prefix,i]);};
  extend([]);
 }
 for(const [index,chain] of chains.entries()) for(const target of targets) {
  const forms=chain.map(i=>wrappers[i].canonical);
  add(forms,target,'canonical');
  for(let position=0;position<chain.length;position++) {
   const wrapper=wrappers[chain[position]];
   for(const variant of wrapper.forms) {const changed=[...forms];changed[position]=variant;add(changed,target,'option-forms');}
   for(const assignment of ['VAR=1','VAR=1 --','-- VAR=1']) {const changed=[...forms];changed[position]+=` ${assignment}`;add(changed,target,'assignments');}
  }
  for(let position=0;position<=forms.length;position++) {
   const choices=chain.length<=2 ? builtins : [builtins[(index+position)%builtins.length]];
   for(const builtin of choices) {const changed=[...forms];changed.splice(position,0,builtin);add(changed,target,'builtin-positions');}
   for(const redirect of ['>out','2>&1','<input']) {const changed=[...forms];changed.splice(position,0,redirect);add(changed,target,'redirect-positions');}
  }
 }
 // Redirects inside each wrapper's option/value words, plus explicit aliases.
 for(const wrapper of wrappers) for(const variant of [wrapper.canonical,...wrapper.forms]) for(const target of targets) {
  const words=variant.split(' ');
  for(let i=0;i<=words.length;i++) {const changed=[...words];changed.splice(i,0,'>out');add([changed.join(' ')],target,'interleaved-redirects');}
  for(const builtin of builtins) add([variant,builtin],target,'builtin-forms');
 }
 // find execution is an external argv boundary; nested builtin names must not
 // regain shell context. Root-only syntax keeps these commands well-formed.
 for(const action of ['-exec','-execdir','-ok','-okdir']) for(const target of targets) {
  const inner=['',...wrappers.map(w=>w.canonical),...builtins];
  for(const form of inner) add([`find . -maxdepth 0 ${action}`,form],`${target} \\;`,'find-exec');
 }
 return [...cases.values()];
}
