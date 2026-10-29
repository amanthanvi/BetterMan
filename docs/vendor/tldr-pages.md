# tldr-pages

BetterMan shows examples from [tldr-pages](https://github.com/tldr-pages/tldr)
on man pages, labelled "tldr-pages" and linked to the exact upstream file.

Copyright © 2014–present the [tldr-pages team](https://github.com/orgs/tldr-pages/people)
and [contributors](https://github.com/tldr-pages/tldr/graphs/contributors).
The pages are licensed under the
[Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/)
(CC BY 4.0). The licence's legal code is in [CC-BY-4.0.txt](CC-BY-4.0.txt).

Where it is credited: the site's `/licenses` page, and every tldr example in
the man page data carries its own attribution (project, link to the exact
upstream file at the pinned commit, licence and licence link, and the change
notice "Placeholders converted (alternatives shown as the first choice);
examples filtered by flag verification against this manual").

Changes made by BetterMan: `{{placeholders}}` are shown as plain text,
value alternations such as `{{tagged|untagged}}` show their first choice,
`{{[-c|--create]}}` option placeholders take the spelling the manual
documents, mnemonic brackets such as `[c]reate` are removed from descriptions,
and examples whose flags are not in the manual shown are left out.

The pinned commit and its page digest are in
`ingestion/ingestion/generated/tldr.py`. Only the English pages and the
upstream `LICENSE.md` are fetched; the MIT-licensed upstream scripts are not
used.
