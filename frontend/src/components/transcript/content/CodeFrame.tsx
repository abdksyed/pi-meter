import { CollapsibleCode } from "../controls/CollapsibleCode";

interface CodeFrameProps {
  code: string;
  language?: string;
  query?: string;
}

export function CodeFrame({ code, language, query }: CodeFrameProps) {
  return (
    <CollapsibleCode
      className="pm-code-frame"
      text={code}
      label={language ? language : "Code"}
      language={language}
      previewLines={24}
      previewChars={6000}
      defaultOpen
      copyLabel="Copy code"
      query={query}
    />
  );
}
