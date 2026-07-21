# NightGram 1.8.0 — Network resilience

- Added a 1.5-second in-memory micro-cache for identical GET responses.
- Kept in-flight request deduplication and added cleanup for the response cache.
- Added one safe retry for transient GET failures only.
- Collapsed simultaneous token refreshes into one request.
- Clear short-lived GET cache after token refresh.

These changes reduce duplicate Railway traffic during rapid navigation and prevent several components from refreshing the access token at the same time.
