"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";

/**
 * Fetching, without a data-fetching library.
 *
 * Deliberately small. React Query would be the reflex here and it is genuinely good, but
 * this application's needs are two: fetch a thing, and fetch the next page of a thing. A
 * cache with invalidation rules is a second source of truth about the factory's state, and
 * the failure it produces — a screen confidently showing stock that was consumed four
 * minutes ago — is precisely the kind of quiet wrongness this product is built to avoid.
 * When that trade stops being right, adding the library is a contained change because
 * every screen already goes through these two hooks.
 *
 * `useQuery` cancels in flight when the inputs change, so a fast operator clicking through
 * three items never sees the first one's data land on the third one's screen.
 */

export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: unknown;
  reload: () => void;
}

export function useQuery<T>(
  path: string | null,
  opts?: { query?: Record<string, string | number | boolean | undefined | null> },
): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);

  const queryKey = JSON.stringify(opts?.query ?? {});

  useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const result = await api.get<T>(path, {
          ...(opts?.query ? { query: opts.query } : {}),
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setData(result);
      } catch (e) {
        if (controller.signal.aborted || (e as Error)?.name === "AbortError") return;
        setError(e);
        setData(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, queryKey, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}

/**
 * A cursor-paged list.
 *
 * The API offers CURSOR pagination only, and this hook does not pretend otherwise: there
 * is no page number and no "jump to page 7". That constraint is honest rather than
 * limiting — with rows being inserted while somebody reads, offset pagination silently
 * skips and repeats records, and a stock report that quietly omits a line is worse than one
 * that makes you press Next.
 */
/**
 * The paged envelope, tolerated in both of the spellings that exist.
 *
 * The API's `CursorPage<T>` (packages/platform/src/api/pagination.ts) names the array
 * `items`. This hook originally read `data`, and the failure mode was the worst kind: a
 * successful 200 with rows in it rendered as an EMPTY TABLE and no error anywhere — the
 * screen simply said there was nothing, which in an ERP is a sentence people act on.
 *
 * Accepting both rather than picking one, because there is no version of this where a
 * mismatched key should cost a silent empty list.
 */
export interface PagedResult<T> {
  items?: T[];
  data?: T[];
  nextCursor?: string | null;
}

export interface CursorListState<T> {
  rows: readonly T[];
  loading: boolean;
  loadingMore: boolean;
  error: unknown;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
}

export function useCursorList<T>(
  path: string | null,
  opts?: {
    query?: Record<string, string | number | boolean | undefined | null>;
    limit?: number;
  },
): CursorListState<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(path !== null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const queryKey = JSON.stringify(opts?.query ?? {});
  const limit = opts?.limit ?? 50;

  const fetchPage = useCallback(
    async (afterCursor: string | null, replace: boolean) => {
      if (path === null) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const result = await api.get<PagedResult<T> | T[]>(path, {
          query: { ...(opts?.query ?? {}), limit, cursor: afterCursor ?? undefined },
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        // Some endpoints return a bare array, others the paged envelope under `items`, and
        // a few under `data`. Tolerating all three keeps one hook usable everywhere rather
        // than three that differ by accident — and, more to the point, means a naming
        // mismatch can never again present itself to a user as "there is no stock".
        const page: T[] = Array.isArray(result) ? result : (result.items ?? result.data ?? []);
        const next = Array.isArray(result) ? null : (result.nextCursor ?? null);

        setRows((prev) => (replace ? page : [...prev, ...page]));
        setCursor(next);
        setHasMore(Boolean(next));
      } catch (e) {
        if (controller.signal.aborted || (e as Error)?.name === "AbortError") return;
        setError(e);
        if (replace) setRows([]);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, queryKey, limit],
  );

  useEffect(() => {
    setRows([]);
    setCursor(null);
    void fetchPage(null, true);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, queryKey, nonce]);

  return {
    rows,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore: () => {
      if (!loadingMore && hasMore) void fetchPage(cursor, false);
    },
    reload: () => setNonce((n) => n + 1),
  };
}
