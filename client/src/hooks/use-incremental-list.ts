import { useEffect, useRef, useState } from "react";

/**
 * Renders long lists incrementally: show the first `chunk` items immediately,
 * then grow the window as an invisible sentinel element scrolls into view.
 * Keeps the DOM small so big client/piano lists stay smooth, without pulling
 * in a virtualization library.
 *
 * `resetKey` should change whenever filters/sort/search change, so the window
 * snaps back to the first chunk for a new result set — but NOT on plain data
 * refetches, so background updates don't yank the user back to the top.
 */
export function useIncrementalList<T>(items: T[], resetKey: string, chunk = 80) {
  const [limit, setLimit] = useState(chunk);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLimit(chunk);
  }, [resetKey, chunk]);

  const hasMore = items.length > limit;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLimit((l) => l + chunk);
        }
      },
      // Start loading the next chunk well before the user reaches the bottom.
      { rootMargin: "800px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, chunk, limit, resetKey]);

  return {
    visible: hasMore ? items.slice(0, limit) : items,
    hasMore,
    sentinelRef,
  };
}
