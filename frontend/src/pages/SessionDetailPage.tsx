import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ParseWarningsBanner } from "../components/session/ParseWarningsBanner";
import { SessionCostPanel } from "../components/session/SessionCostPanel";
import { SessionDetailSkeleton } from "../components/session/SessionDetailSkeleton";
import { SessionHeader } from "../components/session/SessionHeader";
import { SessionTotalsRail } from "../components/session/SessionTotalsRail";
import { Transcript } from "../components/transcript/Transcript";
import { TranscriptToolbar } from "../components/transcript/TranscriptToolbar";
import { useJumpToLatest } from "../hooks/useJumpToLatest";
import { useSessionDetail } from "../hooks/useSessionDetail";
import { useTranscriptExpansion } from "../hooks/useTranscriptExpansion";
import { useTranscriptFilters } from "../hooks/useTranscriptFilters";
import { useTranscriptSearch } from "../hooks/useTranscriptSearch";
import { scrollToAnchor } from "../lib/anchors";
import { buildTranscriptItems } from "../lib/transcriptItems";
import type { TranscriptFilter } from "../lib/sessionTypes";
import "../styles/session-detail.css";
import "../styles/transcript.css";

const FILTERS: TranscriptFilter[] = ["all", "user", "assistant", "tools", "errors"];

function parseFilter(value: string | null): TranscriptFilter {
  return FILTERS.includes(value as TranscriptFilter) ? (value as TranscriptFilter) : "all";
}

export default function SessionDetailPage({ sessionId: sessionIdProp }: { sessionId?: string }) {
  const params = useParams<{ sessionId?: string }>();
  const sessionId = sessionIdProp ?? params.sessionId;
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const filter = parseFilter(searchParams.get("filter"));
  const query = searchParams.get("q") ?? "";
  const { data, isLoading, isFetching, error, refetch } = useSessionDetail(sessionId);
  const expansion = useTranscriptExpansion();
  const jump = useJumpToLatest();
  const [announcement, setAnnouncement] = useState("");
  const announceTimer = useRef<number | undefined>(undefined);

  const announce = useCallback((message: string) => {
    setAnnouncement(message);
    if (announceTimer.current !== undefined) window.clearTimeout(announceTimer.current);
    announceTimer.current = window.setTimeout(() => setAnnouncement(""), 2400);
  }, []);

  useEffect(
    () => () => {
      if (announceTimer.current !== undefined) window.clearTimeout(announceTimer.current);
    },
    [],
  );

  const items = useMemo(() => buildTranscriptItems(data?.entries ?? []), [data]);
  const { counts, visibleItems, emptyReason } = useTranscriptFilters(
    items,
    filter,
    data?.warnings.length ?? 0,
  );
  const search = useTranscriptSearch(visibleItems, query);

  useEffect(() => {
    expansion.reset();
  }, [sessionId, expansion.reset]);

  useEffect(() => {
    if (!search.activeAnchorId) return;
    const frame = window.requestAnimationFrame(() => {
      scrollToAnchor(search.activeAnchorId as string, { focus: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [search.activeAnchorId]);

  useEffect(() => {
    if (!data) return;
    const hash = location.hash.replace(/^#/, "");
    if (!hash) return;
    const timer = window.setTimeout(() => scrollToAnchor(hash, { focus: true }), 80);
    return () => window.clearTimeout(timer);
  }, [data, location.hash]);

  const updateParams = useCallback(
    (patch: { filter?: TranscriptFilter; q?: string }) => {
      const next = new URLSearchParams(searchParams);
      if (patch.filter !== undefined) {
        if (patch.filter === "all") next.delete("filter");
        else next.set("filter", patch.filter);
      }
      if (patch.q !== undefined) {
        if (patch.q) next.set("q", patch.q);
        else next.delete("q");
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const onFilterChange = useCallback(
    (next: TranscriptFilter) => {
      updateParams({ filter: next });
      search.clear();
      announce(`Filter: ${next}`);
    },
    [updateParams, search, announce],
  );

  const onExpandAll = useCallback(() => {
    expansion.expandAll();
    announce("All sections expanded");
  }, [expansion, announce]);

  const onCollapseAll = useCallback(() => {
    expansion.collapseAll();
    announce("All sections collapsed");
  }, [expansion, announce]);

  const onJumpToLatest = useCallback(() => {
    jump.jumpToLatest();
    announce("Jumped to latest entry");
  }, [jump, announce]);

  if (isLoading && !data) {
    return (
      <div className="pm-session-page">
        <SessionDetailSkeleton />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="pm-session-page pm-session-page--state">
        <div className="pm-state">
          <h1>{error.notFound ? "Session not found" : "Could not load this session"}</h1>
          <p className="pm-muted">{error.message}</p>
          <div className="pm-state__actions">
            {!error.notFound ? (
              <button type="button" className="pm-btn pm-btn--primary" onClick={refetch}>
                Retry
              </button>
            ) : null}
            <Link className="pm-btn" to="/sessions">
              Back to sessions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="pm-session-page">
      <a className="pm-skip-link" href="#pm-transcript">
        Skip to transcript
      </a>

      <div className="pm-session-page__grid">
        <div className="pm-session-page__main">
          <SessionHeader session={data.session} isFetching={isFetching} />
          <SessionCostPanel session={data.session} />

          <details className="pm-totals-disclosure">
            <summary>Session totals</summary>
            <SessionTotalsRail session={data.session} relatedSessions={data.relatedSessions} relatedCostTotal={data.relatedCostTotal} combinedCostTotal={data.combinedCostTotal} variant="inline" />
          </details>

          <ParseWarningsBanner warnings={data.warnings} />

          <TranscriptToolbar
            query={query}
            onQueryChange={(value) => updateParams({ q: value })}
            search={search}
            filter={filter}
            counts={counts}
            onFilterChange={onFilterChange}
            onExpandAll={onExpandAll}
            onCollapseAll={onCollapseAll}
            onJumpToLatest={onJumpToLatest}
            latestDisabled={jump.isAtBottom}
          />

          <Transcript
            items={visibleItems}
            allItemsCount={items.length}
            filter={filter}
            search={search}
            expansion={expansion}
            sentinelRef={jump.sentinelRef}
            emptyReason={emptyReason}
            announce={announce}
            onShowAll={() => onFilterChange("all")}
            onClearSearch={() => updateParams({ q: "" })}
            onSearchAll={() => onFilterChange("all")}
          />
        </div>

        <div className="pm-session-page__rail">
          <SessionTotalsRail session={data.session} relatedSessions={data.relatedSessions} relatedCostTotal={data.relatedCostTotal} combinedCostTotal={data.combinedCostTotal} variant="rail" />
        </div>
      </div>

      {jump.showFloating ? (
        <button type="button" className="pm-latest-pill" onClick={onJumpToLatest}>
          ↓ Jump to latest
        </button>
      ) : null}

      <div className="pm-sr-only" aria-live="polite" role="status">
        {announcement}
      </div>
    </div>
  );
}
