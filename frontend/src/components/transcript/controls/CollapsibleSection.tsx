import { useId, useState, type ReactNode } from "react";
import { useTranscriptContext } from "../TranscriptContext";

interface CollapsibleSectionProps {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
  openKey?: string;
  forceOpen?: boolean;
  className?: string;
  panelClassName?: string;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  meta,
  actions,
  defaultOpen = false,
  openKey,
  forceOpen = false,
  className,
  panelClassName,
  children,
}: CollapsibleSectionProps) {
  const { expansion } = useTranscriptContext();
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const panelId = useId();
  const open = forceOpen || (openKey ? expansion.isOpen(openKey, defaultOpen) : localOpen);

  const onToggle = () => {
    if (openKey) expansion.toggle(openKey, defaultOpen);
    else setLocalOpen((value) => !value);
  };

  return (
    <div className={`pm-disclosure${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}>
      <div className="pm-disclosure__head">
        <button
          type="button"
          className="pm-disclosure__trigger"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="pm-disclosure__chevron" aria-hidden="true">
            {open ? "▾" : "▸"}
          </span>
          <span className="pm-disclosure__title">{title}</span>
          {meta ? <span className="pm-disclosure__meta">{meta}</span> : null}
        </button>
        {actions ? <div className="pm-disclosure__actions">{actions}</div> : null}
      </div>
      <div id={panelId} className={`pm-disclosure__panel${panelClassName ? ` ${panelClassName}` : ""}`} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
