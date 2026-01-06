# Abuse / scraping

**Symptoms**

- Sudden RPS spike, especially to `/api/v1/search`.
- High 429 counts, high cache miss rates, rising infra cost.

**Immediate checks**

- Top IPs / user agents (aggregate only; do not store full query text).
- Request distribution by route.
- Cache headers present (ETag + Cache-Control) and honored.

**Mitigations**

- Tighten rate limits (search stricter than page fetch).
- Block abusive IPs at the edge (preferred) or at app layer (temporary).
- Consider adding a low-cost proof-of-work / challenge at edge if sustained.

**Follow-ups**

- Re-evaluate default UI debounce and paging behavior.
- Add alerts for unusual traffic patterns.
