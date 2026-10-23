import { formatChars } from "../../session/format";
import { Markdown } from "../../../lib/markdown";
import { CollapsibleSection } from "../controls/CollapsibleSection";
import { CopyButton } from "../controls/CopyButton";

interface ThinkingBlockProps {
  text: string;
  index: number;
  openKey: string;
  forceOpen?: boolean;
  query?: string;
}

export function ThinkingBlock({ text, index, openKey, forceOpen, query }: ThinkingBlockProps) {
  return (
    <CollapsibleSection
      className="pm-thinking"
      title="Thinking"
      meta={formatChars(text.length)}
      openKey={openKey}
      forceOpen={forceOpen}
      actions={<CopyButton text={text} label="Copy thinking" />}
    >
      <Markdown text={text} query={query} className="pm-thinking__body" />
      <span className="pm-sr-only">Thinking block {index + 1}</span>
    </CollapsibleSection>
  );
}
