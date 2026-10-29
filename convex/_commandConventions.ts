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
