import type { NormalizedSession } from "../../lib/sessionTypes";
import { formatCost, formatNumber, formatPercent, formatTokens } from "./format";

function share(value: number, total: number): string | undefined {
  if (total <= 0) return undefined;
  return formatPercent((value / total) * 100);
}

export function SessionCostPanel({ session }: { session: NormalizedSession }) {
  const { usage, cost, counts } = session;
  const cells = [
    { label: "Input", tokens: usage.input, amount: cost.input },
    { label: "Output", tokens: usage.output, amount: cost.output },
    { label: "Reasoning", tokens: usage.reasoning, amount: undefined },
    { label: "Cache read", tokens: usage.cacheRead, amount: cost.cacheRead },
    { label: "Cache write", tokens: usage.cacheWrite, amount: cost.cacheWrite },
  ];

  return (
    <section className="pm-cost-panel" aria-label="Session cost and token summary">
      <div className="pm-cost-panel__desktop">
        <div className="pm-cost-panel__total">
          <span className="pm-micro-label">Total cost</span>
          <span className="pm-cost-panel__cost">{formatCost(cost.total)}</span>
          <span className="pm-cost-panel__tokens pm-mono">{formatTokens(usage.totalTokens)}</span>
        </div>
        {cells.map((cell) => (
          <div className="pm-cost-panel__cell" key={cell.label}>
            <span className="pm-micro-label">{cell.label}</span>
            {cell.amount !== undefined ? (
              <span className="pm-cost-panel__amount pm-mono">{formatCost(cell.amount)}</span>
            ) : (
              <span className="pm-cost-panel__amount pm-mono">{formatNumber(cell.tokens)}</span>
            )}
            <span className="pm-cost-panel__sub pm-mono">
              {formatTokens(cell.tokens)}
              {share(cell.tokens, usage.totalTokens) ? ` · ${share(cell.tokens, usage.totalTokens)}` : ""}
            </span>
          </div>
        ))}
      </div>

      <div className="pm-cost-panel__mobile">
        <div className="pm-cost-tile">
          <div className="pm-cost-tile__head">
            <span className="pm-micro-label">Session cost</span>
            <span className="pm-micro-label">USD</span>
          </div>
          <span className="pm-cost-panel__cost">{formatCost(cost.total)}</span>
          <dl className="pm-cost-tile__breakdown">
            <div>
              <dt>Input cost</dt>
              <dd className="pm-mono">{formatCost(cost.input)}</dd>
            </div>
            <div>
              <dt>Output cost</dt>
              <dd className="pm-mono">{formatCost(cost.output)}</dd>
            </div>
            <div>
              <dt>Cache read</dt>
              <dd className="pm-mono">{formatCost(cost.cacheRead)}</dd>
            </div>
            <div>
              <dt>Cache write</dt>
              <dd className="pm-mono">{formatCost(cost.cacheWrite)}</dd>
            </div>
          </dl>
        </div>

        <div className="pm-cost-tile">
          <div className="pm-cost-tile__head">
            <span className="pm-micro-label">Session dimensions</span>
            <span className="pm-micro-label pm-mono">{formatTokens(usage.totalTokens)}</span>
          </div>
          <dl className="pm-cost-tile__rows">
            <div>
              <dt>Input / Output tokens</dt>
              <dd className="pm-mono">
                {formatNumber(usage.input)} / {formatNumber(usage.output)}
              </dd>
            </div>
            <div>
              <dt>Cache read volume</dt>
              <dd className="pm-mono">
                {formatTokens(usage.cacheRead)}
                {share(usage.cacheRead, usage.totalTokens) ? ` · ${share(usage.cacheRead, usage.totalTokens)}` : ""}
              </dd>
            </div>
            <div>
              <dt>Reasoning tokens</dt>
              <dd className="pm-mono">{formatNumber(usage.reasoning)}</dd>
            </div>
            <div>
              <dt>Primary model</dt>
              <dd className="pm-mono">{session.primaryModel ?? "—"}</dd>
            </div>
            <div>
              <dt>Turns &amp; tool calls</dt>
              <dd className="pm-mono">
                {counts.assistantMessages} turns · {counts.toolCalls} tools
                {counts.errors > 0 ? ` (${counts.errors} err)` : ""}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
