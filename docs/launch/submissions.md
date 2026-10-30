# Where to share BetterMan 2

Draft for [#410](https://github.com/amanthanvi/BetterMan/issues/410). Rules were read on 2026-10-30 from the pages linked in each row. Rules change, so re-read the linked page before posting. Nothing has been submitted, emailed or signed up for. The owner does every submission, from their own accounts.

Where a page could not be read, the row says so. Do not treat those rows as cleared.

## Order and ground rules

1. Post Show HN first, at a time the owner can answer comments for several hours. Everything else is secondary.
2. Space the others over days. One post per place, no cross-posting the same text, and no asking people to upvote or comment anywhere (Hacker News forbids it outright).
3. Say what it is and that you made it. Disclose generated text where it matters: the pages label it, and the post should too ([changelog-post.md](changelog-post.md)).
4. Skip any place whose rule you can't confirm.

## Recommended

| Place | Why it fits | Rules, in one line | Source |
| --- | --- | --- | --- |
| **Hacker News, Show HN** | Developers who use man pages. Draft in [show-hn.md](show-hn.md). | Must be something people can try without sign-up, non-trivial and your own; minor feature releases don't qualify but major overhauls may; title begins "Show HN"; don't solicit upvotes or comments; don't use HN primarily for promotion. | [Show HN rules](https://news.ycombinator.com/showhn.html), [guidelines](https://news.ycombinator.com/newsguidelines.html) |
| **Hacker Newsletter** | A weekly email of the best HN articles. | Hand-curated from Hacker News; the site shows no submission form or contact address, so there is nothing to submit. A good Show HN is the route. | [hackernewsletter.com](https://hackernewsletter.com/) |
| **Console.dev** | Weekly devtools newsletter that reviews 2–3 tools. A reader tool for developers with self-service use fits its criteria. | Email hello@console.dev with details; there is no form. It asks whether the tool is useful to developers, built for developers, needs no sales call, and is actively maintained. Reviews are independent, with no promise of coverage. | [Selection criteria](https://console.dev/selection-criteria), [About](https://console.dev/about) |
| **Changelog News** | Short developer news items. Self-submission is explicitly welcome. | Needs a (free) account. Submit URL, title and "what's interesting about it". Excludes how-tos, tutorials and commercial products. Explain why it is newsworthy. | [changelog.com/news/submit](https://changelog.com/news/submit) |
| **Lobsters** | Technical audience that likes unix tooling. | Invite only; the quickest way is to know someone on the site. Self-promotion should be under about a quarter of your stories and comments over the last year, and accounts under 70 days old cannot submit self-promotion or use the `show` tag. **Skip unless the owner already has an account in good standing.** Do not ask for an invite to post this. | [lobste.rs/about](https://lobste.rs/about) |

## Unverified or low-fit (read the rules first, or skip)

| Place | Why it might fit | What I could and couldn't confirm | Source |
| --- | --- | --- | --- |
| **r/linux**, **r/commandline** | The two obvious subreddits for this audience. | **Could not verify.** Reddit blocked automated reads of both rules pages, and a web search returned no rule text. The owner must read each subreddit's Rules tab for the self-promotion and project-post rules (and any account-age or karma limits) before posting. A text post that says what it is, how it's built and what's wrong with it is the safest shape. | [r/linux rules](https://www.reddit.com/r/linux/about/rules), [r/commandline rules](https://www.reddit.com/r/commandline/about/rules) |
| **Arch Linux forums, Community Contributions** | Arch is a supported distro, and the subforum lists user-made tools. | The rules page I could read has no self-promotion rule, only that support is for Arch only. Whether this subforum takes outside web projects is **not stated**; the forum README linked from the rules page (id 130309) did not cover it either. Low fit unless the owner confirms. | [Forum rules](https://bbs.archlinux.org/misc.php?action=rules), [README](https://bbs.archlinux.org/viewtopic.php?id=130309) |
| **Debian lists** | The largest corpus is Debian's. | Don't send an announcement. `debian-user` is English-language user support, not announcements; `debian-news` is moderated news about the distribution and project. The advertising policy prohibits unsolicited bulk email and does not describe permitted promotion. Better: answer a thread where someone asks for a better way to read man pages, with a link and a disclosure. | [Debian mailing lists](https://www.debian.org/MailingLists/subscribe), [advertising policy](https://www.debian.org/MailingLists/#ads) |
| **Fedora Discussion** | Fedora is a supported distro. | The guidelines page was not readable, and no category clearly fits (Project Discussion is for Fedora teams, News & Announcements is for news relevant to the Fedora community, Community Blog is for contributors). Skip unless a moderator says it's welcome. | [Discussion categories](https://discussion.fedoraproject.org/guidelines) |
| **FreeBSD lists** | FreeBSD base manuals are included. | The community page gives no per-list descriptions or posting rules. Read the list FAQ before choosing a list. | [FreeBSD mailing lists](https://www.freebsd.org/community/mailinglists/) |

Not looked up: Ubuntu and Alpine community channels, Unix & Linux Stack Exchange (an announcement isn't a question), and social media.

## Notes for the owner

- **Check [launch-checklist.md](launch-checklist.md) step 5 first.** The Firewall rules for non-browser access must be live before a post claims `curl betterman.sh/tar.txt` works.
- **Disclosure.** Mention that you built it. In r/ and mailing-list posts, mention generated text and the model.
- **Replies.** Answer in the thread, not in a new post. Log reports from every channel as GitHub issues so the 48-hour review has one list.
