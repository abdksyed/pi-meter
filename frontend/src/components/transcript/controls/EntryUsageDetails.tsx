import { formatCostExact, formatNumber } from "../../session/format";
import type { NormalizedEntry } from "../../../lib/sessionTypes";
import { CollapsibleSection } from "./CollapsibleSection";

export function EntryUsageDetails({ entry }: { entry: NormalizedEntry }) {
  const usage = entry.usage;
  const cost = entry.cost;
  if (!usage && !cost) return null;
  return (
    <CollapsibleSection
      title="Usage"
      meta={usage ? `${formatNumber(usage.totalTokens)} tok` : undefined}
      className="pm-entry__usage"
    >
      <table className="pm-usage-table">
        <caption className="pm-sr-only">Token usage and cost for this entry</caption>
        <tbody>
          <tr>
            <th scope="row">Input</th>
            <td>{formatNumber(usage?.input)}</td>
            <td>{formatCostExact(cost?.input)}</td>
          </tr>
          <tr>
            <th scope="row">Output</th>
            <td>{formatNumber(usage?.output)}</td>
            <td>{formatCostExact(cost?.output)}</td>
          </tr>
          <tr>
            <th scope="row">Reasoning</th>
            <td>{formatNumber(usage?.reasoning)}</td>
            <td>—</td>
          </tr>
          <tr>
            <th scope="row">Cache read</th>
            <td>{formatNumber(usage?.cacheRead)}</td>
            <td>{formatCostExact(cost?.cacheRead)}</td>
          </tr>
          <tr>
            <th scope="row">Cache write</th>
            <td>{formatNumber(usage?.cacheWrite)}</td>
            <td>{formatCostExact(cost?.cacheWrite)}</td>
          </tr>
          <tr className="pm-usage-table__total">
            <th scope="row">Total</th>
            <td>{formatNumber(usage?.totalTokens)}</td>
            <td>{formatCostExact(cost?.total)}</td>
          </tr>
        </tbody>
      </table>
      <dl className="pm-kv">
        {entry.model ? (
          <div>
            <dt>Model</dt>
            <dd className="pm-mono">{entry.model}</dd>
          </div>
        ) : null}
        {entry.provider ? (
          <div>
            <dt>Provider</dt>
            <dd className="pm-mono">{entry.provider}</dd>
          </div>
        ) : null}
        {entry.thinkingLevel ? (
          <div>
            <dt>Thinking level</dt>
            <dd className="pm-mono">{entry.thinkingLevel}</dd>
          </div>
        ) : null}
        {entry.stopReason ? (
          <div>
            <dt>Stop reason</dt>
            <dd className="pm-mono">{entry.stopReason}</dd>
          </div>
        ) : null}
      </dl>
    </CollapsibleSection>
  );
}
