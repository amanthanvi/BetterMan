# DB connection exhaustion

**Symptoms**

- Rising latency across all endpoints.
- DB errors: “too many connections”, pool timeouts.

**Immediate checks**

- Current active connection count vs max.
- App instance count (did it autoscale unexpectedly?).
- Verify pool sizing vs DB capacity.

**Mitigations**

- Temporarily scale DB up (if available).
- Reduce app instance count (if each instance holds its own pool).
- Lower pool size / increase pool recycle time (app config).

**Follow-ups**

- Add dashboard/alert for connection saturation (target alert at >80%).
- Audit for connection leaks in API code paths.
