import type { ParseWarning } from "../../lib/sessionTypes";
import { ParseErrorBlock } from "../transcript/ParseErrorBlock";

export function ParseWarningsBanner({ warnings }: { warnings: ParseWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <details className="pm-warnings" open>
      <summary className="pm-warnings__summary">
        <span className="pm-badge pm-badge--error">PARSE WARNINGS</span>
        <span>
          {warnings.length} {warnings.length === 1 ? "line" : "lines"} could not be parsed. The rest
          of the session is shown below.
        </span>
      </summary>
      <div className="pm-warnings__body">
        {warnings.map((warning, index) => (
          <ParseErrorBlock key={`${warning.line}-${index}`} warning={warning} index={index} />
        ))}
      </div>
    </details>
  );
}
