"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";

export type FixedVirtualItem<T> = {
  item: T;
  index: number;
  offset: number;
};

/**
 * Tiny fixed-row virtualizer used by the messenger sidebar.
 * It intentionally has no external dependency and falls back to a normal list
 * for short collections, where virtualization would only add overhead.
 */
export function useFixedVirtualList<T>({
  items,
  rowHeight,
  overscan = 6,
  threshold = 32,
}: {
  items: T[];
  rowHeight: number;
  overscan?: number;
  threshold?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const enabled = items.length >= threshold;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => setViewportHeight(element.clientHeight);
    updateSize();

    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updateSize)
      : null;
    observer?.observe(element);
    window.addEventListener("resize", updateSize, { passive: true });

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  useEffect(() => {
    // Folder/search changes can shorten the list while the user is scrolled far
    // down. Clamp immediately so the virtual window never becomes empty.
    const element = containerRef.current;
    if (!element) return;
    const maxScrollTop = Math.max(0, items.length * rowHeight - element.clientHeight);
    if (element.scrollTop > maxScrollTop) {
      element.scrollTop = maxScrollTop;
      setScrollTop(maxScrollTop);
    }
  }, [items.length, rowHeight]);

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const nextScrollTop = event.currentTarget.scrollTop;
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      setScrollTop(nextScrollTop);
    });
  }, []);

  useEffect(() => () => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  const virtualItems = useMemo<FixedVirtualItem<T>[]>(() => {
    if (!enabled) {
      return items.map((item, index) => ({ item, index, offset: index * rowHeight }));
    }

    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleCount = Math.ceil(Math.max(viewportHeight, rowHeight) / rowHeight);
    const endIndex = Math.min(items.length, startIndex + visibleCount + overscan * 2);

    return items.slice(startIndex, endIndex).map((item, localIndex) => {
      const index = startIndex + localIndex;
      return { item, index, offset: index * rowHeight };
    });
  }, [enabled, items, overscan, rowHeight, scrollTop, viewportHeight]);

  return {
    containerRef,
    enabled,
    onScroll,
    totalHeight: items.length * rowHeight,
    virtualItems,
  };
}
