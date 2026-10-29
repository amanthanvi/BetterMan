import UNSUPPORTED_FORMS from './fixtures/unsupported-shell.json';
import {describe,it,expect} from 'vitest';
import {parseShell} from './_shellParser';
import {SUPPORTED_SHELL_GRAMMAR} from './_shellGrammar';

describe('explicit supported shell grammar',()=>{
 it('publishes one supported grammar and wrapper argument catalog',()=>{
  expect(SUPPORTED_SHELL_GRAMMAR.lists).toEqual(['|','&&','||',';']);
  expect(SUPPORTED_SHELL_GRAMMAR.optionalWrapperArguments.xargs).toContain('--max-lines');
 });
 it.each(['rm item','rm "a b"',"rm 'a b'",'rm a\\ b','rm a | cat','rm a && echo ok','rm a || echo failed','rm a; echo done','rm a;','echo > file','echo >| file','echo >> file','echo &> file','cat < file','echo >file 2>&1','sudo rm file','env echo text >out','xargs --max-lines rm item'])('admits %s',cmd=>expect(parseShell(cmd).diagnostics).toEqual([]));
});

it.each(UNSUPPORTED_FORMS)('fails closed for %s',cmd=>expect(parseShell(cmd).diagnostics.length).toBeGreaterThan(0));

it.each(['|','&&','||'])('rejects a comment-only operand of %s',op=>{
 for(const suffix of ['', ' # hi',' # hi; rm y']) expect(parseShell(`rm x ${op}${suffix}`).diagnostics.length).toBeGreaterThan(0);
});
it('admits a comment after a complete list',()=>expect(parseShell('rm x; # hi').diagnostics).toEqual([]));
it.each(["rm x{,''}","rm x{,\"\"}","rm x'{literal}'{,a}","rm x{1,'2'}",'rm a{b}'])('rejects unquoted braces even in partly quoted words: %s',cmd=>expect(parseShell(cmd).diagnostics.length).toBeGreaterThan(0));
it.each(["rm 'x{,}'",'rm "x{,}"','rm x\\{,\\}',"find . -exec rm {} \\;",'xargs -I {} rm {}'])('retains literal braces or modeled standalone placeholders: %s',cmd=>expect(parseShell(cmd).diagnostics).toEqual([]));
it.each(['rm pre"$HOME"','rm pre$(echo x)"suffix"','rm pre`echo x`\'suffix\'','rm "x"${NAME}'])('rejects partially quoted runtime expansions: %s',cmd=>expect(parseShell(cmd).diagnostics.length).toBeGreaterThan(0));
