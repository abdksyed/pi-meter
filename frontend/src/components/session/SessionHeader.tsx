import { Link } from "react-router-dom";
import type { NormalizedSession } from "../../lib/sessionTypes";
import { formatBytes, formatDateTime, formatDuration, formatRelative } from "./format";
import { CopyButton } from "../transcript/controls/CopyButton";

interface SessionHeaderProps {
  session: NormalizedSession;
  isFetching: boolean;
}

function statusFor(session: NormalizedSession): { label: string; tone: string } {
  if (session.parseStatus === "error") return { label: "Parse error", tone: "error" };
  if (session.parseStatus === "warning") return { label: "Parse warning", tone: "warning" };
  const last = session.lastActivityAt ? Date.parse(session.lastActivityAt) : NaN;
  if (Number.isFinite(last) && Date.now() - last < 10 * 60 * 1000) {
    return { label: "Active session", tone: "success" };
  }
  return { label: "Complete", tone: "neutral" };
}

export function SessionHeader({ session, isFetching }: SessionHeaderProps) {
  const status = statusFor(session);
  return (
    <header className="pm-session-header">
      <div className="pm-session-header__top">
        <Link className="pm-back" to="/sessions">
          ← Sessions
        </Link>
        <span className={`pm-status pm-status--${status.tone}`}>
          <span className="pm-status__dot" aria-hidden="true" />
          {status.label}
        </span>
        {isFetching ? <span className="pm-muted">Refreshing…</span> : null}
      </div>

      <h1 className="pm-session-header__title">{session.title}</h1>

      <div className="pm-session-header__meta">
        {session.cwd ? (
          <span className="pm-session-header__cwd pm-mono" title={session.cwd}>
            {session.cwd}
          </span>
        ) : null}
        <span>
          Started <time dateTime={session.startedAt}>{formatDateTime(session.startedAt)}</time>
        </span>
        <span>
          Last activity <time dateTime={session.lastActivityAt}>{formatRelative(session.lastActivityAt)}</time>
        </span>
        <span>Duration {formatDuration(session.durationMs)}</span>
        {session.fileName ? (
          <span className="pm-mono">
            {session.fileName}
            {session.fileSize !== undefined ? ` · ${formatBytes(session.fileSize)}` : ""}
          </span>
        ) : null}
      </div>

      <div className="pm-session-header__models">
        {session.models.length > 0 ? (
          <>
            <span className="pm-micro-label">Models</span>
            {session.models.map((model) => (
              <span key={`${model.provider ?? ""}-${model.model}`} className="pm-chip pm-chip--model pm-mono">
                {model.model}
                {model.provider ? ` · ${model.provider}` : ""}
              </span>
            ))}
          </>
        ) : (
          <span className="pm-muted">No model recorded</span>
        )}
      </div>

      <div className="pm-session-header__actions">
        <CopyButton text={session.sessionId} label="Copy session ID" />
        {session.filePath ? <CopyButton text={session.filePath} label="Copy path" /> : null}
      </div>

      <details className="pm-session-header__more">
        <summary>Session details</summary>
        <dl className="pm-kv">
          <div>
            <dt>Session ID</dt>
            <dd className="pm-mono pm-break">{session.sessionId}</dd>
          </div>
          {session.cwd ? (
            <div>
              <dt>Working directory</dt>
              <dd className="pm-mono pm-break">{session.cwd}</dd>
            </div>
          ) : null}
          {session.filePath ? (
            <div>
              <dt>Source file</dt>
              <dd className="pm-mono pm-break">{session.filePath}</dd>
            </div>
          ) : null}
          <div>
            <dt>Started</dt>
            <dd>{formatDateTime(session.startedAt)}</dd>
          </div>
          <div>
            <dt>Last activity</dt>
            <dd>{formatDateTime(session.lastActivityAt)}</dd>
          </div>
          <div>
            <dt>Entries</dt>
            <dd>{session.counts.entries}</dd>
          </div>
        </dl>
      </details>
    </header>
  );
}
