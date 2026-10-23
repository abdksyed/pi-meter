import { useCopyToClipboard } from "../../../hooks/useCopyToClipboard";
import { useTranscriptContext } from "../TranscriptContext";

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function CopyButton({ text, label = "Copy", className, disabled }: CopyButtonProps) {
  const { copied, error, copy } = useCopyToClipboard();
  const { announce } = useTranscriptContext();
  return (
    <button
      type="button"
      className={`pm-copy${copied ? " is-copied" : ""}${error ? " is-error" : ""}${className ? ` ${className}` : ""}`}
      disabled={disabled || text.length === 0}
      aria-label={copied ? `${label}: copied` : error ? `${label}: copy failed` : label}
      onClick={() => {
        void copy(text).then((ok) => {
          announce(ok ? `${label}: copied` : `${label}: copy failed`);
        });
      }}
    >
      {copied ? "✓ Copied" : error ? "Copy failed" : label}
    </button>
  );
}
