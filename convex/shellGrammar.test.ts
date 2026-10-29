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
