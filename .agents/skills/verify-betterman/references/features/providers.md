# Package providers

## Reach

Open a manual that ships in more than one package, or add `?pkg=` for an explicit package. The seeded example is the Perl module `foo::bar` in section `3pm`.

## Spec

`nextjs/e2e/providers.spec.ts`

## Proves

The default package and `?pkg=alternate-perl` show different page text. The keyboard and no-JavaScript paths can switch packages. A stub provider redirects to the package that has the page.
