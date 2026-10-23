import type { ReactNode } from "react";
import { Markdown } from "../../../lib/markdown";
import type { ContentBlock, ToolCallContent } from "../../../lib/sessionTypes";
import { useTranscriptContext } from "../TranscriptContext";
import { CollapsibleCode } from "../controls/CollapsibleCode";
import { ImageBlock } from "./ImageBlock";
import { ThinkingBlock } from "./ThinkingBlock";
import { UnknownContentBlock } from "./UnknownContentBlock";

interface MessageContentProps {
  blocks: ContentBlock[];
  entryKey: string;
  query?: string;
  renderToolCall?: (block: ToolCallContent, index: number) => ReactNode;
}

export function MessageContent({ blocks, entryKey, query, renderToolCall }: MessageContentProps) {
  const { matchedItemKeys, query: contextQuery } = useTranscriptContext();
  const forceOpen = matchedItemKeys.has(entryKey);
  const activeQuery = query ?? contextQuery;

  return (
    <div className="pm-message-content">
      {blocks.map((block, index) => {
        const key = `${entryKey}-block-${index}`;
        switch (block.kind) {
          case "text":
            if (block.text.length > 100_000) {
              return (
                <CollapsibleCode
                  key={key}
                  text={block.text}
                  label="Message text"
                  previewLines={12}
                  previewChars={2000}
                  copyLabel="Copy message"
                  openKey={`${entryKey}-text-${index}`}
                  forceOpen={forceOpen}
                />
              );
            }
            return <Markdown key={key} text={block.text} query={activeQuery} />;
          case "thinking":
            return (
              <ThinkingBlock
                key={key}
                text={block.text}
                index={index}
                openKey={`${entryKey}-thinking-${index}`}
                forceOpen={forceOpen}
                query={activeQuery}
              />
            );
          case "tool-call":
            if (renderToolCall) return <div key={key}>{renderToolCall(block, index)}</div>;
            return (
              <CollapsibleCode
                key={key}
                className="pm-tool-orphan"
                text={JSON.stringify(block.arguments, null, 2)}
                label={`Tool call · ${block.name}`}
                language="json"
                previewLines={6}
                previewChars={800}
                openKey={`${entryKey}-tool-args-${index}`}
                forceOpen={forceOpen}
              />
            );
          case "image":
            return <ImageBlock key={key} image={block} />;
          default:
            return <UnknownContentBlock key={key} rawType={block.rawType} raw={block.raw} />;
        }
      })}
    </div>
  );
}
