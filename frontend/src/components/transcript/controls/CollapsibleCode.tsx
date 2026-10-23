import { useId, useState } from "react";
import { buildPreview, lineCount, sanitizeText, truncateHard } from "../../../lib/ansi";
import { formatNumber } from "../../session/format";
import { useTranscriptContext } from "../TranscriptContext";
import { CopyButton } from "./CopyButton";
import { HighlightedText } from "./HighlightedText";

const MAX_RENDER_LINES = 2000;
const HARD_CHAR_CAP = 500_000;

interface CollapsibleCodeProps {
  text: string;
  rawText?: string;
  label?: string;
  language?: string;
  previewLines?: number;
  previewChars?: number;
  defaultOpen?: boolean;
  openKey?: string;
  forceOpen?: boolean;
  className?: string;
  wrap?: boolean;
  emptyText?: string;
  hideCopy?: boolean;
  copyLabel?: string;
  query?: string;
  collapsible?: boolean;
}

export function CollapsibleCode({
  text,
  rawText,
  label,
  language,
  previewLines = 8,
  previewChars = 1200,
  defaultOpen = false,
  openKey,
  forceOpen = false,
  className,
  wrap = false,
  emptyText = "No output",
  hideCopy = false,
  copyLabel = "Copy",
  query = "",
  collapsible = false,
}: CollapsibleCodeProps) {
  const { expansion, query: contextQuery } = useTranscriptContext();
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const panelId = useId();
  const display = sanitizeText(text);
  const totalLines = lineCount(display);
  const preview = buildPreview(display, previewLines, previewChars);
  const isLong = preview.truncated || totalLines > previewLines;
  const canToggle = isLong || collapsible;
  const resolvedOpen = openKey ? expansion.isOpen(openKey, defaultOpen) : localOpen;
  const open = forceOpen || (canToggle ? resolvedOpen : true);
  const activeQuery = query || contextQuery;

  const toggle = () => {
    if (openKey) expansion.toggle(openKey, defaultOpen);
    else setLocalOpen((value) => !value);
  };

  if (display.length === 0) {
    return <div className={`pm-code pm-code--empty${className ? ` ${className}` : ""}`}>{emptyText}</div>;
  }

  const shownText = open ? truncateHard(display, HARD_CHAR_CAP) : preview;
  const shownLines = shownText.text.split("\n");
  const renderLines = shownLines.slice(0, MAX_RENDER_LINES);
  const renderTruncated = shownLines.length > MAX_RENDER_LINES || (open && shownText.truncated);
  const copyTextValue = rawText ?? text;

  return (
    <div className={`pm-code${wrap ? " pm-code--wrap" : ""}${className ? ` ${className}` : ""}`}>
      <div className="pm-code__head">
        <span className="pm-code__label">
          {label ?? "Output"}
          {language ? <span className="pm-code__lang">{language}</span> : null}
        </span>
        <span className="pm-code__stats">
          {formatNumber(totalLines)} {totalLines === 1 ? "line" : "lines"}
        </span>
        <span className="pm-code__head-actions">
          {!hideCopy ? <CopyButton text={copyTextValue} label={copyLabel} /> : null}
          {canToggle ? (
            <button
              type="button"
              className="pm-code__toggle"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={toggle}
            >
              {open ? "Collapse" : "Expand"}
            </button>
          ) : null}
        </span>
      </div>
      <div
        id={panelId}
        className="pm-code__body"
        tabIndex={0}
        role="region"
        aria-label={`${label ?? "Output"}, ${totalLines} lines`}
      >
        <ol className="pm-code__lines">
          {renderLines.map((line, index) => (
            <li key={index} className="pm-code__line">
              <span className="pm-code__ln" aria-hidden="true">
                {index + 1}
              </span>
              <span className="pm-code__lc">
                <HighlightedText text={line.length > 0 ? line : " "} query={activeQuery} />
              </span>
            </li>
          ))}
        </ol>
        {renderTruncated ? (
          <p className="pm-code__notice">
            Output is very large. Showing the first {formatNumber(MAX_RENDER_LINES)} lines; copy
            remains available.
          </p>
        ) : null}
      </div>
      {canToggle ? (
        <div className="pm-code__foot">
          <span>
            {open
              ? `Showing all ${formatNumber(totalLines)} ${totalLines === 1 ? "line" : "lines"}`
              : `Showing preview (lines 1–${formatNumber(preview.shownLines)} of ${formatNumber(totalLines)})`}
          </span>
          <button type="button" className="pm-code__foot-toggle" onClick={toggle}>
            {open ? "Collapse" : `Expand · ${formatNumber(totalLines)} lines`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
