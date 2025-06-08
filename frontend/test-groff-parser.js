// Test groff parser
import { parseGroffContent } from './src/utils/groffParser.js';

const testContent = `.TH AWK 1 "2025-06-05" "BetterMan 1.0" "User Commands"
.SH NAME
awk \\- pattern scanning and processing language
.SH SYNOPSIS
.B awk
[\\fIOPTION\\fR]... [\\fIARGUMENT\\fR]...
.SH DESCRIPTION
pattern scanning and processing language`;

console.log('Original content:');
console.log(testContent);
console.log('\nParsed content:');
console.log(parseGroffContent(testContent));