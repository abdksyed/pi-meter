import { contentText } from "../../lib/normalize";
import type { TranscriptItem } from "../../lib/sessionTypes";
import { formatBytes } from "../session/format";
import { CollapsibleCode } from "./controls/CollapsibleCode";
import { CollapsibleSection } from "./controls/CollapsibleSection";
import { CopyButton } from "./controls/CopyButton";
import { EntryDetails } from "./controls/EntryDetails";
import { EntryHeader } from "./EntryHeader";

export function SystemPromptBlock({ item }: { item: TranscriptItem }) {
  const { entry } = item;
  const sections = entry.systemSections ?? [];
  const plain = contentText(entry.content);
  const totalChars = sections.reduce((sum, section) => sum + section.text.length, 0) || plain.length;
  const titleId = `${item.anchor}-title`;

  return (
    <article className="pm-entry__article pm-system pm-system-prompt" aria-labelledby={titleId}>
      <h3 id={titleId} className="pm-sr-only">
        System prompt at {entry.timestamp ?? "unknown time"}, {sections.length} sections
      </h3>
      <EntryHeader
        tone="system"
        label="SYSTEM PROMPT"
        timestamp={entry.timestamp}
        meta={
          <>
            <span>{sections.length > 0 ? `${sections.length} sections` : "1 section"}</span>
            <span className="pm-mono">{formatBytes(totalChars)}</span>
          </>
        }
        telemetry={<span className="pm-muted">Collapsed by default · excluded from search</span>}
        actions={
          <CopyButton
            text={plain || sections.map((section) => section.text).join("\n\n")}
            label="Copy system prompt"
          />
        }
      />
      <CollapsibleSection
        className="pm-system-prompt__disclosure"
        title="Prompt contents"
        meta={`${sections.length || 1} sections · ${formatBytes(totalChars)}`}
        openKey={`${entry.key}-prompt`}
      >
        <div className="pm-system-prompt__body">
        {sections.length > 0 ? (
          sections.map((section, index) => (
            <CollapsibleCode
              key={`${entry.key}-section-${index}`}
              text={section.text}
              label={section.label}
              previewLines={6}
              previewChars={800}
              copyLabel={`Copy ${section.label}`}
              openKey={`${entry.key}-section-${index}`}
            />
          ))
        ) : plain ? (
          <CollapsibleCode
            text={plain}
            label="System prompt"
            previewLines={6}
            previewChars={800}
            copyLabel="Copy system prompt"
            openKey={`${entry.key}-section-0`}
          />
        ) : (
          <p className="pm-muted">No system prompt content recorded.</p>
        )}
        </div>
      </CollapsibleSection>
      <EntryDetails entry={entry} />
    </article>
  );
}
