import type { NormalizedSession, RelatedSession } from "../../lib/sessionTypes";
import { formatBytes, formatCost, formatDuration, formatNumber, formatPercent, formatTokens } from "./format";
import { CopyButton } from "../transcript/controls/CopyButton";

function pct(value: number, total: number): number {
  if (total <= 0) return 0;
  return (value / total) * 100;
}

function TokenMeter({ session }: { session: NormalizedSession }) {
  const { usage } = session;
  const total = usage.totalTokens;
  const segments = [
    { key: "input", label: "Input", value: usage.input },
    { key: "output", label: "Output", value: usage.output },
    { key: "reasoning", label: "Reasoning", value: usage.reasoning },
    { key: "cacheRead", label: "Cache read", value: usage.cacheRead },
    { key: "cacheWrite", label: "Cache write", value: usage.cacheWrite },
  ];
  return (
    <div className="pm-token-meter">
      <div className="pm-token-meter__bar" role="img" aria-label="Token composition">
        {segments.map((segment) =>
          segment.value > 0 ? (
            <span
              key={segment.key}
              className={`pm-token-meter__seg pm-token-meter__seg--${segment.key}`}
              style={{ width: `${pct(segment.value, total)}%` }}
              title={`${segment.label}: ${formatNumber(segment.value)} (${formatPercent(pct(segment.value, total))})`}
            />
          ) : null,
        )}
      </div>
      <ul className="pm-token-meter__legend">
        {segments.map((segment) => (
          <li key={segment.key}>
            <span className={`pm-token-meter__swatch pm-token-meter__seg--${segment.key}`} aria-hidden="true" />
            <span className="pm-token-meter__label">{segment.label}</span>
            <span className="pm-mono">{formatNumber(segment.value)}</span>
            <span className="pm-muted pm-mono">{formatPercent(pct(segment.value, total))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Breakdown({ session }: { session: NormalizedSession }) {
  const { usage, cost } = session;
  const rows = [
    { label: "Input", tokens: usage.input, amount: cost.input },
    { label: "Output", tokens: usage.output, amount: cost.output },
    { label: "Reasoning", tokens: usage.reasoning, amount: 0 },
    { label: "Cache read", tokens: usage.cacheRead, amount: cost.cacheRead },
    { label: "Cache write", tokens: usage.cacheWrite, amount: cost.cacheWrite },
  ];
  return (
    <table className="pm-breakdown">
      <caption className="pm-sr-only">Cost and token volume breakdown</caption>
      <thead>
        <tr>
          <th scope="col">Category</th>
          <th scope="col">Tokens</th>
          <th scope="col">Cost</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td className="pm-mono">{formatNumber(row.tokens)}</td>
            <td className="pm-mono">{row.amount > 0 ? formatCost(row.amount) : "—"}</td>
          </tr>
        ))}
        <tr className="pm-breakdown__total">
          <th scope="row">Total</th>
          <td className="pm-mono">{formatNumber(usage.totalTokens)}</td>
          <td className="pm-mono">{formatCost(cost.total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function Telemetry({ session, subAgentCount }: { session: NormalizedSession; subAgentCount: number }) {
  const rows = [
    { label: "Duration", value: formatDuration(session.durationMs) },
    { label: "Tool calls", value: formatNumber(session.counts.toolCalls) },
    { label: "Tool results", value: formatNumber(session.counts.toolResults) },
    { label: "Errors", value: formatNumber(session.counts.errors) },
    { label: "Compactions", value: formatNumber(session.counts.compactions) },
    { label: "Context edits", value: formatNumber(session.counts.contextEdits) },
    { label: "Model changes", value: formatNumber(session.counts.modelChanges) },
    { label: "Sub-agent calls", value: formatNumber(subAgentCount) },
  ];
  return (
    <dl className="pm-telemetry">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd className="pm-mono">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Models({ session }: { session: NormalizedSession }) {
  if (session.models.length === 0) return <p className="pm-muted">No model recorded.</p>;
  return (
    <ul className="pm-model-list">
      {session.models.map((model) => (
        <li key={`${model.provider ?? ""}-${model.model}`}>
          <span className="pm-mono pm-break">{model.model}</span>
          <span className="pm-mono">
            {formatTokens(model.totalTokens ?? 0)}
            {model.cost ? ` · ${formatCost(model.cost)}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SubAgents({ sessions }: { sessions: RelatedSession[] }) {
  return (
    <details className="pm-sub-agents">
      <summary>
        <span>Sub-agent sessions</span>
        <span className="pm-mono">{sessions.length}</span>
      </summary>
      <ul className="pm-model-list">
        {sessions.map((related) => (
          <li key={related.sessionId}>
            <a className="pm-link pm-break" href={`/sessions/${encodeURIComponent(related.sessionId)}`}>
              {related.title || related.sessionId}
            </a>
            <span className="pm-mono">{formatCost(related.costTotal)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Source({ session }: { session: NormalizedSession }) {
  return (
    <div className="pm-source">
      <p className="pm-mono pm-break">{session.fileName ?? "—"}</p>
      {session.filePath ? <p className="pm-muted pm-mono pm-break">{session.filePath}</p> : null}
      <p className="pm-muted">
        {session.fileSize !== undefined ? formatBytes(session.fileSize) : "Size unknown"} ·{" "}
        {formatNumber(session.counts.entries)} entries
      </p>
      <div className="pm-source__actions">
        {session.filePath ? <CopyButton text={session.filePath} label="Copy path" /> : null}
        <CopyButton text={session.sessionId} label="Copy ID" />
      </div>
    </div>
  );
}

export function SessionTotalsRail({
  session,
  relatedSessions,
  relatedCostTotal,
  combinedCostTotal,
  variant = "rail",
}: {
  session: NormalizedSession;
  relatedSessions?: RelatedSession[];
  relatedCostTotal?: number;
  combinedCostTotal?: number;
  variant?: "rail" | "inline";
}) {
  const related = relatedSessions ?? [];
  const relatedCost = relatedCostTotal ?? 0;
  const combinedCost = combinedCostTotal ?? session.cost.total + relatedCost;
  const className = variant === "rail" ? "pm-totals-rail" : "pm-totals-inline";
  return (
    <aside className={className} aria-label="Session totals">
      <div className="pm-rail__section pm-rail__section--cost">
        <h2 className="pm-rail__title">
          Cumulative cost <span className="pm-micro-label">USD</span>
        </h2>
        <p className="pm-rail__cost">{formatCost(session.cost.total)}</p>
        {relatedCost > 0 ? (
          <p className="pm-muted pm-mono">
            {formatCost(relatedCost)} sub-agent cost · {formatCost(combinedCost)} combined
          </p>
        ) : null}
        <p className="pm-muted pm-mono">{formatTokens(session.usage.totalTokens)}</p>
      </div>

      <div className="pm-rail__section">
        <h2 className="pm-rail__title">Token composition</h2>
        <TokenMeter session={session} />
      </div>

      <div className="pm-rail__section">
        <h2 className="pm-rail__title">Cost &amp; volume breakdown</h2>
        <Breakdown session={session} />
      </div>

      <div className="pm-rail__section">
        <h2 className="pm-rail__title">Execution telemetry</h2>
        <Telemetry session={session} subAgentCount={related.length} />
      </div>

      <div className="pm-rail__section">
        <h2 className="pm-rail__title">Models</h2>
        <Models session={session} />
      </div>

      {related.length > 0 ? (
        <div className="pm-rail__section">
          <SubAgents sessions={related} />
        </div>
      ) : null}

      <div className="pm-rail__section">
        <h2 className="pm-rail__title">Source file</h2>
        <Source session={session} />
      </div>
    </aside>
  );
}
