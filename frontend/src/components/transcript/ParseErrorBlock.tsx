import type { ParseWarning } from "../../lib/sessionTypes";
import { CollapsibleCode } from "./controls/CollapsibleCode";
import { CopyButton } from "./controls/CopyButton";

export function ParseErrorBlock({ warning, index }: { warning: ParseWarning; index: number }) {
  return (
    <div className="pm-parse-error" role="group" aria-label={`Parse warning at line ${warning.line}`}>
      <div className="pm-parse-error__head">
        <span className="pm-badge pm-badge--error">PARSE ERROR</span>
        <span className="pm-mono">line {warning.line}</span>
        <span className="pm-parse-error__message">{warning.message}</span>
        {warning.rawSnippet ? <CopyButton text={warning.rawSnippet} label="Copy snippet" /> : null}
      </div>
      {warning.rawSnippet ? (
        <CollapsibleCode
          text={warning.rawSnippet}
          label="Raw line"
          previewLines={4}
          previewChars={600}
          openKey={`parse-warning-${index}`}
        />
      ) : null}
    </div>
  );
}
