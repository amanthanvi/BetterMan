ED(1)                            User Commands                           ED(1)

NAME
       ed - line-oriented text editor

SYNOPSIS
       ed [options] [[+line] file]

DESCRIPTION
       GNU  ed  is a line-oriented text editor. It is used to create, display,
       modify and otherwise manipulate text files, both interactively and  via
       shell  scripts. A restricted version of ed, red, can only edit files in
       the current directory and cannot execute  shell  commands.  Ed  is  the
       'standard'  text editor in the sense that it is the original editor for
       Unix, and thus widely available. For most purposes, however, it is  su‐
       perseded by full-screen editors such as GNU Emacs or GNU Moe.

       The  file name may be preceded by '+line', '+/RE', or '+?RE' to set the
       current line to the line number specified or to the first or last  line
       matching the regular expression 'RE'.

OPTIONS
       -h, --help
              display this help and exit

       -V, --version
              output version information and exit

       -E, --extended-regexp
              use extended regular expressions

       -G, --traditional
              run in compatibility mode

       -l, --loose-exit-status
              exit with 0 status even if a command fails

       -p, --prompt=STRING
              use STRING as an interactive prompt

       -q, --quiet, --silent
              suppress diagnostics written to stderr

       -r, --restricted
              run in restricted mode

       -s, --script
              suppress byte counts and '!' prompt

       -v, --verbose
              be verbose; equivalent to the 'H' command

       --strip-trailing-cr
              strip carriage returns at end of text lines

       --unsafe-names
              allow control characters 1-31 in file names

       Start edit by reading in 'file' if given.  If 'file' begins with a '!',
       read output of shell command.

       Exit status: 0 for a normal exit, 1 for environmental problems (invalid
       command-line  options,  memory  exhausted,  command failed, etc), 2 for
       problems with the input file (file not found, buffer modified, I/O  er‐
       rors),  3 for an internal consistency error (e.g., bug) which caused ed
       to panic.

REPORTING BUGS
       Report bugs to bug-ed@gnu.org
       Ed home page: http://www.gnu.org/software/ed/ed.html
       General help using GNU software: http://www.gnu.org/gethelp

COPYRIGHT
       Copyright © 1994 Andrew L. Moore.
       Copyright © 2024 Antonio Diaz Diaz.  License GPLv2+: GNU GPL version  2
       or later <http://gnu.org/licenses/gpl.html>
       This  is  free  software:  you  are free to change and redistribute it.
       There is NO WARRANTY, to the extent permitted by law.

SEE ALSO
       The full documentation for ed is maintained as a  Texinfo  manual.   If
       the  info and ed programs are properly installed at your site, the com‐
       mand

              info ed

       should give you access to the complete manual.

GNU ed 1.20.1                    February 2024                           ED(1)
