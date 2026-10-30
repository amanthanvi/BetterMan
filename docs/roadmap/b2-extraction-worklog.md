# B2 extraction worklog

Goal: implement #394 as four reviewable distro-family PRs, Ubuntu first.
Base: #445 (`bm2/b4-index-by-demand`), pending ingest contract v7.
Constraints: no dispatch, merge, production/config/secret/data changes; all gates off.
Staging measurement spend approved; production promotion requires owner approval.
Sub-agent implements directly; lead supplies independent review and staging runs.

Current: Ubuntu implemented on #445 v7 with independent identity/gates and
pinned Noble main/universe catalog. Curated-owner audit: 62 acquired packages,
2,617 pages, 1,726 aliases, all 30 command owners pass; no parse/source failures.
Ingest lint and 954 tests pass; ops 126 pass; Convex 3,279 pass; local codegen on
3432/3433 matches committed generation; pip dry-run passes. Broader 200-package sample caught
a Kerberos include; exact repair passed a cached replay with 5,312 pages and
6,709 aliases, zero unresolved. PR guards and Ubuntu PR next. No shared writes/dispatches.

Remaining: open Ubuntu, then implement/check/open Fedora, Arch and Alpine.
