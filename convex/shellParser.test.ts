import { describe, it, expect } from 'vitest';
import { parseShell, EXPLAIN_LIMITS } from './_shellParser';

const commands = (input: string) => parseShell(input).stages.flatMap(s => s.tokens.filter(t => t.kind === 'command').map(t => t.value));
const words = (input: string) => parseShell(input).stages.flatMap(s => s.tokens.filter(t => !['operator', 'redirect'].includes(t.kind)).map(t => [t.kind, t.value]));
describe('static shell parser', () => {
  it.each([
    ['tar -xzvf backup.tar.gz -C /srv/www', ['tar']],
    ["find . -name '*.log' -mtime +7 -print0 | xargs -0 rm -f", ['find', 'xargs', 'rm']],
    ['echo one && printf two || cat <in >>out 2>&1; pwd', ['echo', 'printf', 'cat', 'pwd']],
    ['FOO=bar sudo -u root env -u HOME PATH=/bin xargs -0 -n 1 rm -f', ['sudo', 'env', 'xargs', 'rm']],
    ['find . -exec rm -f {} \\; -print', ['find', 'rm']],
    ['find . -execdir echo {} +', ['find', 'echo']],
    ['find . -exec echo {} \\; -exec printf {} \\;', ['find', 'echo', 'printf']],
    ['sudo -- env X=1 git commit', ['sudo', 'env', 'git']],
    ['env -i A=1 sudo -S -u root rm -f file', ['env', 'sudo', 'rm']],
    ['xargs -a input -i rm {}', ['xargs', 'rm']],
    ['X=1 >out echo okay', ['echo']],
    ['echo foo"bar" \'baz\'\\ qux', ['echo']],
    ['echo \\\n word', ['echo']],
    ['echo "$(printf \'%s\' "$(date)")"', ['echo', 'printf', 'date']],
    ['echo `printf hi`', ['echo', 'printf']],
    ['(cd /tmp; ls) | cat', ['cd', 'ls', 'cat']],
    ['echo \'$(rm -rf /)\' "*.log" \\*', ['echo']],
    ['# rm -rf /\necho okay', ['echo']],
    ['echo hi \\| cat', ['echo']],
  ])('%s', (input, expected) => {
    expect(commands(input)).toEqual(expected);
    const parsed = parseShell(input);
    expect(parsed.diagnostics).toEqual([]);
    for (const stage of parsed.stages) for (const token of stage.tokens) expect(input.slice(token.start, token.end)).toBe(token.text);
    expect(parseShell(input)).toEqual(parsed);
  });
  it.each([
    ["echo 'a b' \"c d\" a\\ b", ['echo', 'a b', 'c d', 'a b']],
    ["echo \"a\\q\" \\n", ['echo', 'a\\q', 'n']],
    ['echo "a\\\nb"', ['echo', 'ab']],
    ["echo '' \"\"", ['echo', '', '']],
  ])('decodes quotes and escapes: %s', (input, expected) => expect(words(input).map(t => t[1])).toEqual(expected));
  it('keeps globs, assignments, substitutions and redirects distinct', () => {
    expect(words('X=1 echo *.log "*.log" $HOME > out 2>&1')).toEqual([
      ['assignment', 'X=1'], ['command', 'echo'], ['glob', '*.log'], ['word', '*.log'], ['expansion', '$HOME'], ['redirectTarget', 'out'], ['redirectTarget', '1'],
    ]);
  });
  it.each(["echo 'unfinished", 'echo $(date', '(echo hi', 'echo foo\\', 'echo <<EOF\nrm -rf /\nEOF', 'echo |', '| rm -f file', 'echo &&', 'echo >', 'echo $((1+2))', 'echo ${NAME:-a b}', 'if test x; then rm -f file; fi'])('diagnoses incomplete or unsupported syntax: %s', input => expect(parseShell(input).diagnostics.length).toBeGreaterThan(0));
  it('bounds input, token count, stages and nesting', () => {
    expect(() => parseShell('x'.repeat(EXPLAIN_LIMITS.characters + 1))).toThrow('EXPLAIN_INPUT_TOO_LONG');
    expect(() => parseShell('echo ' + 'a '.repeat(128))).toThrow('EXPLAIN_TOO_MANY_TOKENS');
    expect(() => parseShell('echo;'.repeat(25))).toThrow('EXPLAIN_TOO_MANY_STAGES');
    expect(() => parseShell('('.repeat(10) + 'echo hi' + ')'.repeat(10))).toThrow('EXPLAIN_TOO_DEEP');
  });
  it('is deterministic and preserves source spans across arbitrary bounded syntax', () => {
    let seed = 397;
    const alphabet = 'aZ0_ $(){}[]*?\\\'"|&;<>\n`';
    for (let n = 0; n < 500; n++) {
      let input = '';
      for (let i = 0; i < 50; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; input += alphabet[seed % alphabet.length]; }
      try {
        const parsed = parseShell(input);
        expect(parseShell(input)).toEqual(parsed);
        for (const stage of parsed.stages) for (const token of stage.tokens) expect(input.slice(token.start, token.end)).toBe(token.text);
      } catch (error) {
        expect(String(error)).toMatch(/EXPLAIN_(TOO_DEEP|TOO_MANY_STAGES|TOO_MANY_TOKENS)/);
      }
    }
  });
});

it('distinguishes quoted assignment words, ANSI-C quotes and process substitutions',()=>{
  expect(commands('"FOO=bar" rm -rf /')).toEqual(['FOO=bar']);
  expect(words("echo $'a\\'b'").map(t=>t[1])).toEqual(['echo',"a'b"]);
  expect(commands('cat <(printf hi)')).toEqual(['cat','printf']);
  expect(parseShell('cat <(printf hi)').diagnostics).toEqual([]);
  expect(commands('echo \\$(rm -rf /)')).not.toContain('rm');
});
