import { startTransition, useEffect, useMemo, useState } from "react";
import { listExams, normalizeInvokeError } from "../lib/api";
import type { ExamCatalogItem } from "../lib/types";

const SEARCH_DEBOUNCE_MS = 250;
const searchCache = new Map<string, ExamCatalogItem[]>();

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [value, delayMs]);

  return debouncedValue;
}

interface UseCatalogSearchOptions {
  query: string;
  onError: (message: string) => void;
}

export function useCatalogSearch({ query, onError }: UseCatalogSearchOptions) {
  const normalizedSearch = useMemo(() => query.trim().toLowerCase(), [query]);
  const debouncedSearch = useDebouncedValue(normalizedSearch, SEARCH_DEBOUNCE_MS);
  const [searchResults, setSearchResults] = useState<ExamCatalogItem[]>([]);
  const [searchResultsQuery, setSearchResultsQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    if (!debouncedSearch) {
      setSearchResults([]);
      setSearchResultsQuery("");
      setSearchLoading(false);
      return;
    }

    if (searchCache.has(debouncedSearch)) {
      startTransition(() => {
        setSearchResults(searchCache.get(debouncedSearch) ?? []);
        setSearchResultsQuery(debouncedSearch);
      });
      setSearchLoading(false);
      return;
    }

    let active = true;
    setSearchLoading(true);

    listExams(debouncedSearch)
      .then((results) => {
        if (!active) {
          return;
        }

        searchCache.set(debouncedSearch, results);
        startTransition(() => {
          setSearchResults(results);
          setSearchResultsQuery(debouncedSearch);
        });
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setSearchResults([]);
        setSearchResultsQuery(debouncedSearch);
        onError(`搜尋失敗：${normalizeInvokeError(error)}`);
      })
      .finally(() => {
        if (active) {
          setSearchLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [debouncedSearch, onError]);

  return {
    normalizedSearch: debouncedSearch,
    searchResults,
    searchResultsQuery,
    searchLoading,
  };
}
