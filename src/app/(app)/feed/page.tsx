"use client";

// =============================================================================
//  NightGram Web — Feed page (infinite vertical scroll of posts)
//  Concept borrowed from social feeds: endless lazy-loaded vertical scroll.
//  Layout & styling are 100% original NightGram.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Sparkles, Plus } from "lucide-react";
import type { Post } from "@/types";
import { PostCard } from "@/components/feed/PostCard";
import { FeedSkeletons } from "@/components/feed/PostSkeleton";
import { api } from "@/lib/api";
import { mockFeed } from "@/lib/mock";
import { useAuth } from "@/context/AuthContext";

const PAGE_SIZE = 6;

export default function FeedPage() {
  const { isDemo } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Initial load
  useEffect(() => {
    let active = true;
    setLoading(true);
    (isDemo
      ? Promise.resolve(mockFeed(0, PAGE_SIZE))
      : api.getFeed(undefined, PAGE_SIZE).catch(() => mockFeed(0, PAGE_SIZE))
    ).then((data) => {
      if (!active) return;
      setPosts(data.posts);
      setCursor(data.nextCursor);
      setReachedEnd(data.nextCursor === null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [isDemo]);

  const loadMore = useCallback(() => {
    if (loadingMore || reachedEnd || !cursor) return;
    setLoadingMore(true);
    const page = parseInt(cursor, 10);
    (isDemo
      ? Promise.resolve(mockFeed(page, PAGE_SIZE))
      : api.getFeed(cursor, PAGE_SIZE).catch(() => mockFeed(page, PAGE_SIZE))
    ).then((data) => {
      setPosts((prev) => [...prev, ...data.posts]);
      setCursor(data.nextCursor);
      setReachedEnd(data.nextCursor === null);
      setLoadingMore(false);
    });
  }, [cursor, loadingMore, reachedEnd, isDemo]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // Real-time new post (socket) — prepends a fresh post in demo with a hint.
  useEffect(() => {
    // Hook point: socket.on("post:new", ...) would prepend. Left for backend wiring.
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4">
      {/* Feed header */}
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

      {/* Stories-style rail (original NightGram, horizontal circles) */}
      <StoriesRail />

      {/* Posts */}
      <div className="space-y-5 mt-5">
        {loading ? (
          <FeedSkeletons count={3} />
        ) : (
          <AnimatePresence initial={false}>
            {posts.map((p, i) => (
              <PostCard key={p.id} post={p} index={i} />
            ))}
          </AnimatePresence>
        )}

        {/* Loading more skeletons */}
        {loadingMore && <FeedSkeletons count={2} />}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-4" />

        {/* End of feed */}
        {reachedEnd && !loading && (
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

        {loadingMore && (
          <div className="flex items-center justify-center py-4 text-white/50">
            <Loader2 size={18} className="animate-spin mr-2" /> Загрузка ещё постов…
          </div>
        )}
      </div>
    </div>
  );
}

/** Original NightGram "highlights" rail — horizontal avatars of people/channels. */
function StoriesRail() {
  const items = [
    { name: "Ты", src: "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=200&h=200&fit=crop", you: true },
    { name: "nova", src: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop", color: "#a855f7" },
    { name: "lumen", src: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop", color: "#ec4899" },
    { name: "kestrel", src: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop", color: "#22d3ee" },
    { name: "NightWire", src: "https://images.unsplash.com/photo-1614851099511-773084f6911d?w=200&h=200&fit=crop", color: "#fbbf24" },
    { name: "ember", src: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop", color: "#fbbf24" },
  ];
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
      {items.map((it) => (
        <motion.button
          key={it.name}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.95 }}
          className="flex flex-col items-center gap-1.5 shrink-0"
        >
          <div
            className="p-[2px] rounded-full"
            style={{
              background: it.you
                ? "rgba(255,255,255,0.2)"
                : `conic-gradient(from 0deg, ${it.color}, #ec4899, ${it.color})`,
            }}
          >
            <div className="p-[2px] rounded-full bg-midnight-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={it.src}
                alt={it.name}
                className="h-14 w-14 rounded-full object-cover"
              />
            </div>
          </div>
          <span className="text-[11px] text-white/60 max-w-[60px] truncate">{it.name}</span>
        </motion.button>
      ))}
    </div>
  );
}
