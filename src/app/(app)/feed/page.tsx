"use client";

// =============================================================================
//  NightGram Web — Feed page (infinite vertical scroll of posts)
//  Real backend data only — no mock fallback.
// =============================================================================

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import type { Post } from "@/types";
import { PostCard } from "@/components/feed/PostCard";
import { FeedSkeletons } from "@/components/feed/PostSkeleton";
const CreatePost = dynamic(() => import("@/components/feed/CreatePost").then((m) => m.CreatePost), { ssr: false });
const StoriesBar = dynamic(() => import("@/components/feed/StoriesBar").then((m) => m.StoriesBar), { ssr: false });
const DiscoverySearch = dynamic(() => import("@/components/feed/DiscoverySearch").then((m) => m.DiscoverySearch), { ssr: false });
import { api } from "@/lib/api";
import { cacheKey, readClientCache, writeClientCache } from "@/lib/clientCache";
import { useAuth } from "@/context/AuthContext";

const PAGE_SIZE = 12;
const FEED_CACHE_MAX_AGE = 15 * 60 * 1000;
const FEED_STALE_MAX_AGE = 24 * 60 * 60 * 1000;

function mergeUniquePosts(current: Post[], incoming: Post[]): Post[] {
  if (incoming.length === 0) return current;
  const seen = new Set(current.map((post) => post.id));
  const unique = incoming.filter((post) => !seen.has(post.id));
  return unique.length === 0 ? current : [...current, ...unique];
}

export default function FeedPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [error, setError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Instant stale-while-revalidate load: render the latest cached feed first,
  // then refresh it silently from Railway.
  useEffect(() => {
    let active = true;
    const key = cacheKey(user?.id, "feed:first-page");
    const cached = readClientCache<{ posts: Post[]; nextCursor: string | null }>(key, FEED_CACHE_MAX_AGE, FEED_STALE_MAX_AGE);

    if (cached) {
      setPosts(cached.posts);
      setCursor(cached.nextCursor);
      setReachedEnd(cached.nextCursor === null);
      setLoading(false);
    } else {
      setLoading(true);
    }

    api.getFeed(undefined, PAGE_SIZE)
      .then((data) => {
        if (!active) return;
        setPosts(data.posts);
        setCursor(data.nextCursor);
        setReachedEnd(data.nextCursor === null);
        setError(false);
        writeClientCache(key, data);
      })
      .catch(() => {
        if (active && !cached) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [user?.id]);

  const loadMore = useCallback(() => {
    if (loadingMore || reachedEnd || !cursor) return;
    setLoadingMore(true);
    api.getFeed(cursor, PAGE_SIZE)
      .then((data) => {
        startTransition(() => {
          setPosts((prev) => mergeUniquePosts(prev, data.posts));
          setCursor(data.nextCursor);
          setReachedEnd(data.nextCursor === null);
        });
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  }, [cursor, loadingMore, reachedEnd]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: "800px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  async function refreshAfterPost() {
    try {
      const data = await api.getFeed(undefined, PAGE_SIZE);
      setPosts(data.posts);
      setCursor(data.nextCursor);
      setReachedEnd(data.nextCursor === null);
      setError(false);
      writeClientCache(cacheKey(user?.id, "feed:first-page"), data);
    } catch {
      // Keep the current feed visible if the refresh fails.
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-5"
      >
        <div>
          <h1 className="font-display font-bold text-2xl flex items-center gap-2">
            Лента <Sparkles size={18} className="text-neon-purple" />
          </h1>
          <p className="text-sm text-white/45">Свежие посты из твоей сети</p>
        </div>
        <button className="btn-glow h-10 w-10 grid place-items-center rounded-xl md:hidden">
          <Plus size={18} />
        </button>
      </motion.div>

      <StoriesBar />
      <div className="mt-4"><DiscoverySearch posts={posts} /></div>

      {/* Create post button — full width, visible */}
      <div className="mt-5"><CreatePost onPosted={refreshAfterPost} /></div>

      <div className="space-y-5 mt-5">
        {loading ? (
          <FeedSkeletons count={3} />
        ) : error ? (
          <EmptyFeed />
        ) : posts.length === 0 ? (
          <EmptyFeed />
        ) : (
          posts.map((p, i) => (
            <div key={p.id} className="ng-content-visibility"><PostCard post={p} index={i} onDeleted={(id) => setPosts((prev) => prev.filter((post) => post.id !== id))} /></div>
          ))
        )}

        {loadingMore && <FeedSkeletons count={2} />}
        <div ref={sentinelRef} className="h-4" />

        {reachedEnd && !loading && posts.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-3 py-10 text-center"
          >
            <div className="h-12 w-12 rounded-full gradient-border grid place-items-center">
              <Sparkles size={20} className="text-neon-purple" />
            </div>
            <p className="text-white/60 font-medium">Ты дошёл до конца ленты ✦</p>
            <p className="text-white/40 text-sm">
              Подпишись на каналы и людей, чтобы видеть больше постов.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function EmptyFeed() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="h-16 w-16 rounded-full gradient-border grid place-items-center">
        <Sparkles size={28} className="text-neon-purple" />
      </div>
      <div>
        <h3 className="font-display font-bold text-xl">Здесь пока пусто</h3>
        <p className="text-white/50 text-sm mt-1 max-w-xs">
          В ленте нет постов. Подпишись на людей и каналы, или создай свой первый пост!
        </p>
      </div>
    </div>
  );
}
