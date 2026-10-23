import { Fragment, useMemo } from "react";
import { splitHighlight } from "../../../lib/search";

interface HighlightedTextProps {
  text: string;
  query?: string;
  className?: string;
}

export function HighlightedText({ text, query = "", className }: HighlightedTextProps) {
  const segments = useMemo(() => splitHighlight(text, query), [text, query]);
  if (segments.length === 1 && !segments[0].hit) {
    return <span className={className}>{text}</span>;
  }
  return (
    <span className={className}>
      {segments.map((segment, index) => (
        <Fragment key={index}>
          {segment.hit ? <mark className="pm-search-hit">{segment.text}</mark> : segment.text}
        </Fragment>
      ))}
    </span>
  );
}
