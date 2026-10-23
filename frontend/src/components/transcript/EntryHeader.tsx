import type { ReactNode } from "react";
import { formatDateTime, formatTime } from "../session/format";

export type EntryTone =
  | "user"
  | "assistant"
  | "tool"
  | "system"
  | "error"
  | "success"
  | "neutral";

interface EntryHeaderProps {
  tone: EntryTone;
  label: string;
  timestamp?: string;
  meta?: ReactNode;
  telemetry?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function EntryHeader({
  tone,
  label,
  timestamp,
  meta,
  telemetry,
  actions,
  className,
}: EntryHeaderProps) {
  return (
    <header className={`pm-entry__head${className ? ` ${className}` : ""}`}>
      <span className={`pm-badge pm-badge--${tone}`}>{label}</span>
      {meta ? <span className="pm-entry__meta">{meta}</span> : null}
      <span className="pm-entry__spacer" />
      {telemetry ? <span className="pm-entry__telemetry">{telemetry}</span> : null}
      {timestamp ? (
        <time className="pm-entry__time" dateTime={timestamp} title={formatDateTime(timestamp)}>
          {formatTime(timestamp)}
        </time>
      ) : null}
      {actions ? <span className="pm-entry__actions">{actions}</span> : null}
    </header>
  );
}
