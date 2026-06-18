"use client";

// =============================================================================
//  Feed — skeleton loading card
// =============================================================================

export function PostSkeleton() {
  return (
    <div className="gradient-border rounded-4xl glass-strong overflow-hidden p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="skeleton h-11 w-11 rounded-full" />
        <div className="space-y-2">
          <div className="skeleton h-3 w-28 rounded-full" />
          <div className="skeleton h-2.5 w-20 rounded-full" />
        </div>
      </div>
      <div className="skeleton h-64 w-full rounded-3xl mb-4" />
      <div className="space-y-2 mb-3">
        <div className="skeleton h-3 w-full rounded-full" />
        <div className="skeleton h-3 w-2/3 rounded-full" />
      </div>
      <div className="flex gap-3">
        <div className="skeleton h-8 w-16 rounded-xl" />
        <div className="skeleton h-8 w-16 rounded-xl" />
        <div className="skeleton h-8 w-16 rounded-xl" />
      </div>
    </div>
  );
}

export function FeedSkeletons({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <PostSkeleton key={i} />
      ))}
    </>
  );
}
