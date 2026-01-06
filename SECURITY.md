# Security Policy

## Automated scanning

This repo uses GitHub-native security tooling:

- Code scanning: CodeQL (`.github/workflows/codeql.yml`) and OSSF Scorecards (`.github/workflows/scorecards.yml`).
- Dependency updates + security updates: Dependabot (`.github/dependabot.yml`).
- Secrets: GitHub secret scanning + push protection.

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security reports.

Instead, report vulnerabilities via one of:

- GitHub Security Advisories (preferred, if enabled)
- Email: `aman_thanvi@outlook.com`

Include:

- A clear description of the issue and impact
- Steps to reproduce / proof-of-concept
- Affected versions/commits (if known)

## Response expectations

We aim to acknowledge reports within **72 hours** and provide a remediation plan
or timeline as quickly as possible.
