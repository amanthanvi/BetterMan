// Only documented command families map verbs to hyphenated manual names.
export const COMMAND_FAMILIES = new Set(['git','ip','openssl','systemctl','docker','podman']);
// iproute2's common object abbreviations; never infer a verb from page-name prefixes.
export const IP_OBJECTS: Record<string,string> = { addr:'address', a:'address', l:'link', r:'route', n:'neighbour', neigh:'neighbour', rule:'rule', addrlabel:'addrlabel' };
export const commandSection = (section: string) => /^[18][a-z0-9]*$/i.test(section);

// Relative/local paths are not evidence of the manual's program identity.
export function manualCommandName(value: string): string | null {
  if (!value.includes('/')) return value;
  return /^\/(?:usr\/)?s?bin\/[A-Za-z0-9_.+-]+$/.test(value) ? value.split('/').at(-1)! : null;
}


// A wrapper launches argv, not a new shell. Only these colliding names have a
// modeled external binary; other builtin names cannot inherit shell semantics.
export const SHELL_BUILTINS = new Set(['command','exec','builtin','type','eval','source','.','alias','unalias','export','readonly','local','declare','typeset','set','shift','unset','read','mapfile','readarray','printf','echo','test','[','true','false','pwd','cd','pushd','popd','dirs','return','exit','break','continue','trap','umask','wait','hash','help','history','fc','let','enable','shopt','bind','caller','compgen','complete','compopt','disown','jobs','kill','suspend','times','ulimit','getopts','logout',':']);
export const MODELED_EXTERNAL_SHELL_NAMES = new Set(['time','echo','printf','test','true','false','pwd','kill']);
