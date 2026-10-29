These tiny, synthetic Debian 2.0 ar archives are authored for BetterMan tests.
They contain valid control tarballs, deliberately non-executable-in-this-pipeline
postinst scripts, xz data tarballs, gzip man pages, copyright files, symlinks and
hardlinks. No real package code or third-party manual content is bundled.

provider-low and provider-high collide on shared(1); provider-high links across
packages to target(1) and the low package's copyright. The low package contains
case-only Foo::Bar(3pm) variants, _Exit(3) and [(1). The gawk fixture exercises
the curated awk(1) alternative. Installed counts are assigned by each test.
