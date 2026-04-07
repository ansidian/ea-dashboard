import { useState, useRef, useCallback } from "react";
import { searchBriefings, searchEmails } from "../../api";
import { DEBOUNCE_MS, MIN_RELEVANCE } from "../../components/briefing/search/constants";

export default function useSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [emailResults, setEmailResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [searchMode, setSearchMode] = useState("emails");
  const [emailFilter, setEmailFilter] = useState("all");
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const debounceRef = useRef(null);

  const doSearch = useCallback(async (q, mode) => {
    const term = q.trim();
    if (!term) {
      setResults(null);
      setEmailResults(null);
      return;
    }
    setSearching(true);
    setError(null);

    if (mode === "emails") {
      setResults(null);
      if (term.length < 2) {
        setEmailResults(null);
        setSearching(false);
        return;
      }
      try {
        const data = await searchEmails(term);
        setEmailResults(data);
        setFocusedIdx(-1);
      } catch (err) {
        setError(err.message);
        setEmailResults(null);
      } finally {
        setSearching(false);
      }
    } else {
      setEmailResults(null);
      try {
        const data = await searchBriefings(term);
        setResults(data.results || []);
        setFocusedIdx(-1);
      } catch (err) {
        setError(err.message);
        setResults(null);
      } finally {
        setSearching(false);
      }
    }
  }, []);

  const handleInputChange = useCallback(
    (val) => {
      setQuery(val);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(val, searchMode), DEBOUNCE_MS);
    },
    [doSearch, searchMode],
  );

  const handleModeChange = useCallback(
    (next) => {
      if (next === searchMode) return;
      setSearchMode(next);
      setFocusedIdx(-1);
      setEmailFilter("all");
      clearTimeout(debounceRef.current);
      if (query.trim()) {
        doSearch(query, next);
      } else {
        setResults(null);
        setEmailResults(null);
      }
    },
    [searchMode, query, doSearch],
  );

  const handleEmailFilterChange = useCallback(
    (next) => {
      if (next === emailFilter) return;
      setEmailFilter(next);
      setFocusedIdx(-1);
    },
    [emailFilter],
  );

  const resetQuery = useCallback(() => {
    setQuery("");
    setResults(null);
    setEmailResults(null);
    setError(null);
    setEmailFilter("all");
    setFocusedIdx(-1);
  }, []);

  // Derived data
  const relevant = (results || []).filter(
    (r) => r.score == null || r.score >= MIN_RELEVANCE,
  );
  const grouped = {};
  for (const r of relevant) {
    if (!grouped[r.source_date]) grouped[r.source_date] = [];
    grouped[r.source_date].push(r);
  }
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const rawEmailHasResults = emailResults?.accounts?.length > 0;
  const totalUnread = rawEmailHasResults
    ? emailResults.accounts.reduce(
        (n, a) => n + a.results.filter((r) => !r.read).length,
        0,
      )
    : 0;
  // Apply the active filter to email results, dropping accounts that end up
  // with zero matching messages so the renderer doesn't show empty headers.
  const filteredEmailResults =
    rawEmailHasResults && emailFilter === "unread"
      ? {
          ...emailResults,
          accounts: emailResults.accounts
            .map((a) => ({ ...a, results: a.results.filter((r) => !r.read) }))
            .filter((a) => a.results.length > 0),
        }
      : emailResults;
  const emailHasResults = filteredEmailResults?.accounts?.length > 0;

  return {
    query,
    results,
    emailResults,
    searching,
    error,
    searchMode,
    emailFilter,
    focusedIdx,
    setFocusedIdx,
    setEmailResults,
    handleInputChange,
    handleModeChange,
    handleEmailFilterChange,
    doSearch,
    resetQuery,
    // derived
    relevant,
    grouped,
    sortedDates,
    rawEmailHasResults,
    totalUnread,
    filteredEmailResults,
    emailHasResults,
  };
}
