import { formatBytes, formatCostExact, formatNumber } from "../../session/format";
import type { NormalizedEntry } from "../../../lib/sessionTypes";
import { CollapsibleSection } from "./CollapsibleSection";
import { CollapsibleCode } from "./CollapsibleCode";
import { CopyButton } from "./CopyButton";

function rawJson(entry: NormalizedEntry): string {
  try {
    return JSON.stringify(entry.raw, null, 2);
  } catch {
    return String(entry.raw);
  }
}

export function EntryDetails({ entry }: { entry: NormalizedEntry }) {
  const json = rawJson(entry);
  return (
    <CollapsibleSection
      title="Details"
      className="pm-entry__details"
      panelClassName="pm-entry__details-panel"
      actions={<CopyButton text={json} label="Copy raw JSON" />}
    >
      <dl className="pm-kv">
        <div>
          <dt>Entry</dt>
          <dd className="pm-mono">#{entry.index}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd className="pm-mono">{entry.type}</dd>
        </div>
        {entry.role ? (
          <div>
            <dt>Role</dt>
            <dd className="pm-mono">{entry.role}</dd>
          </div>
        ) : null}
        {entry.id ? (
          <div>
            <dt>ID</dt>
            <dd className="pm-mono pm-break">{entry.id}</dd>
          </div>
        ) : null}
        {entry.parentId ? (
          <div>
            <dt>Parent</dt>
            <dd className="pm-mono pm-break">{entry.parentId}</dd>
          </div>
        ) : null}
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
            <dt>Thinking</dt>
            <dd className="pm-mono">{entry.thinkingLevel}</dd>
          </div>
        ) : null}
        {entry.usage ? (
          <div>
            <dt>Tokens</dt>
            <dd className="pm-mono">
              {formatNumber(entry.usage.totalTokens)} ({formatNumber(entry.usage.input)} in /{" "}
              {formatNumber(entry.usage.output)} out)
            </dd>
          </div>
        ) : null}
        {entry.cost ? (
          <div>
            <dt>Cost</dt>
            <dd className="pm-mono">{formatCostExact(entry.cost.total)}</dd>
          </div>
        ) : null}
      </dl>
      {json.length > 200_000 ? (
        <p className="pm-muted">
          Raw JSON is large ({formatBytes(json.length)}). Use “Copy raw JSON” above to inspect it.
        </p>
      ) : (
        <CollapsibleCode
          text={json}
          label="Raw entry JSON"
          language="json"
          previewLines={10}
          previewChars={1600}
          hideCopy
        />
      )}
    </CollapsibleSection>
  );
}
