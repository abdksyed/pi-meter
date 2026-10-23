import { CollapsibleCode } from "../controls/CollapsibleCode";

export function UnknownContentBlock({ rawType, raw }: { rawType: string; raw: unknown }) {
  let json = "";
  try {
    json = JSON.stringify(raw, null, 2);
  } catch {
    json = String(raw);
  }
  return (
    <CollapsibleCode
      className="pm-unknown-content"
      text={json}
      label={`Unsupported content · ${rawType}`}
      previewLines={8}
      previewChars={1200}
    />
  );
}
