import { Component, type ErrorInfo, type ReactNode } from "react";
import type { NormalizedEntry } from "../../lib/sessionTypes";
import { CollapsibleCode } from "./controls/CollapsibleCode";

interface Props {
  entry: NormalizedEntry;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class EntryErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Transcript entry render failed", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    let json = "";
    try {
      json = JSON.stringify(this.props.entry.raw, null, 2);
    } catch {
      json = String(this.props.entry.raw);
    }
    return (
      <div className="pm-entry-fallback">
        <p className="pm-entry-fallback__title">Could not render this entry.</p>
        <p className="pm-muted">
          Entry #{this.props.entry.index} · {this.props.entry.type}
        </p>
        <CollapsibleCode text={json} label="Raw entry JSON" language="json" previewLines={10} previewChars={1600} />
      </div>
    );
  }
}
