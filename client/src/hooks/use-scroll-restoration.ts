import { useEffect, useRef, RefObject } from "react";

/**
 * Remembers the scroll position of a scroll container per route (pathname),
 * and restores it when the user navigates back to that route.
 *
 * Positions are kept in a module-level map (survives route changes within the
 * session). Because page content often loads asynchronously, restoration
 * retries for a short window until the container is tall enough to scroll to
 * the saved position.
 */
const positions = new Map<string, number>();

export function useScrollRestoration(
  containerRef: RefObject<HTMLElement | null>,
  locationKey: string
) {
  const prevKey = useRef(locationKey);

  // Continuously record the scroll position for the *current* route.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      positions.set(prevKey.current, el.scrollTop);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [containerRef]);

  // On route change: restore the new route's saved position (or top).
  useEffect(() => {
    prevKey.current = locationKey;
    const el = containerRef.current;
    if (!el) return;

    const target = positions.get(locationKey) ?? 0;
    let cancelled = false;
    const start = Date.now();

    function attempt() {
      if (cancelled || !el) return;
      // Can the container actually scroll that far yet? If not, content is
      // probably still loading — retry for up to ~1.2s, then give up.
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (target <= maxScroll || target === 0) {
        el.scrollTop = target;
        // Keep trying briefly even after success: late-loading content can
        // shift layout right after the first restore.
        if (Date.now() - start < 300 && target > 0) {
          requestAnimationFrame(attempt);
        }
        return;
      }
      if (Date.now() - start < 1200) {
        requestAnimationFrame(attempt);
      }
    }

    requestAnimationFrame(attempt);
    return () => {
      cancelled = true;
    };
  }, [locationKey, containerRef]);
}
