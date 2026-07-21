# NightGram 1.7.0 — Render Performance

- Memoized feed post cards to avoid unrelated re-renders.
- Memoized chat rows with stable ID-based selection callbacks.
- Replaced per-row Framer Motion hover/layout work with CSS transforms.
- Deferred chat search filtering to keep typing responsive.
- Combined chat counters into one memoized pass over conversations.
- Removed the feed-wide AnimatePresence wrapper for long lists.
- Preserved stale-while-revalidate cache, media lazy loading, and idle prefetching from earlier releases.
