interface TranscriptActionsProps {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onJumpToLatest: () => void;
  latestDisabled: boolean;
  expandDisabled?: boolean;
}

export function TranscriptActions({
  onExpandAll,
  onCollapseAll,
  onJumpToLatest,
  latestDisabled,
  expandDisabled = false,
}: TranscriptActionsProps) {
  return (
    <div className="pm-actions" role="group" aria-label="Transcript actions">
      <button type="button" className="pm-btn" onClick={onExpandAll} disabled={expandDisabled}>
        Expand all
      </button>
      <button type="button" className="pm-btn" onClick={onCollapseAll} disabled={expandDisabled}>
        Collapse all
      </button>
      <button type="button" className="pm-btn" onClick={onJumpToLatest} disabled={latestDisabled}>
        ↓ Latest
      </button>
    </div>
  );
}
