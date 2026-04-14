import { useState, useRef, useCallback } from "react";
import { analyzeSearchResults, getBriefingById } from "../../api";
import { transformBriefing } from "../../transform";
import extractRelatedContext from "../../components/briefing/search/extractRelatedContext";

export default function useSearchAnalysis({ query, results, onNavigateToEmail, onCloseSearch }) {
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedCtx, setExpandedCtx] = useState(null);
  const [loadingCtx, setLoadingCtx] = useState(null);
  const briefingCache = useRef({});

  const fetchBriefing = useCallback(async (briefingId) => {
    if (briefingCache.current[briefingId]) return briefingCache.current[briefingId];
    const res = await getBriefingById(briefingId);
    const briefing = transformBriefing(res.briefing);
    briefingCache.current[briefingId] = { briefing, generated_at: res.generated_at };
    return briefingCache.current[briefingId];
  }, []);

  const handleExpand = useCallback(async (r) => {
    const key = `${r.briefing_id}-${r.id}`;
    if (expandedId === key) {
      setExpandedId(null);
      setExpandedCtx(null);
      return;
    }
    setExpandedId(key);
    setExpandedCtx(null);
    setLoadingCtx(key);
    try {
      const { briefing } = await fetchBriefing(r.briefing_id);
      setExpandedCtx(extractRelatedContext(briefing, r.section_type, r.chunk_text));
    } catch {
      setExpandedCtx({
        primary: [],
        related: [{ type: "error", icon: "AlertTriangle", text: "Failed to load briefing context" }],
      });
    } finally {
      setLoadingCtx(null);
    }
  }, [expandedId, fetchBriefing]);

  const handleEmailClick = useCallback(async (emailData, briefingId) => {
    if (!onNavigateToEmail || !emailData) return;
    try {
      const { briefing, generated_at } = await fetchBriefing(briefingId);
      onNavigateToEmail({
        briefing,
        briefingId,
        generated_at,
        emailId: emailData.id,
        accountName: emailData.accountName,
      });
      onCloseSearch();
    } catch (err) {
      console.error("[EA] Navigate to email failed:", err.message);
    }
  }, [fetchBriefing, onNavigateToEmail, onCloseSearch]);

  const handleAnalyze = useCallback(async () => {
    if (!results?.length || analyzing) return;
    setAnalyzing(true);
    try {
      const data = await analyzeSearchResults(query, results);
      setAnalysis(data.analysis);
    } catch (err) {
      setAnalysis(`Analysis failed: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  }, [results, analyzing, query]);

  const clearAnalysis = useCallback(() => {
    setAnalysis(null);
    setExpandedId(null);
    setExpandedCtx(null);
  }, []);

  return {
    analysis,
    analyzing,
    expandedId,
    expandedCtx,
    loadingCtx,
    setExpandedId,
    setExpandedCtx,
    handleExpand,
    handleEmailClick,
    handleAnalyze,
    clearAnalysis,
  };
}
