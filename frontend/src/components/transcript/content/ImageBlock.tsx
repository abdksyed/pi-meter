import { useRef } from "react";
import { formatBytes } from "../../session/format";
import type { ImageContent } from "../../../lib/sessionTypes";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BASE64 = 5 * 1024 * 1024;
const BASE64 = /^[A-Za-z0-9+/=\s]+$/;

export function ImageBlock({ image }: { image: ImageContent }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mime = image.mimeType.toLowerCase();
  const size = Math.round((image.data.length * 3) / 4);
  const allowed =
    ALLOWED.has(mime) && image.data.length <= MAX_BASE64 && BASE64.test(image.data);

  if (!allowed) {
    return (
      <div className="pm-image pm-image--placeholder">
        <span className="pm-image__label">Unsupported image</span>
        <span className="pm-mono">
          {image.mimeType} · {formatBytes(size)}
        </span>
        {image.alt ? <span>{image.alt}</span> : null}
      </div>
    );
  }

  const src = `data:${mime};base64,${image.data.replace(/\s+/g, "")}`;

  return (
    <figure className="pm-image">
      <button
        type="button"
        className="pm-image__button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={`Open image${image.alt ? `: ${image.alt}` : ""}`}
      >
        <img src={src} alt={image.alt ?? "Session image"} loading="lazy" decoding="async" />
      </button>
      <figcaption className="pm-image__meta pm-mono">
        Image · {image.mimeType} · {formatBytes(size)}
      </figcaption>
      <dialog
        ref={dialogRef}
        className="pm-image__dialog"
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <div className="pm-image__dialog-body">
          <img src={src} alt={image.alt ?? "Session image"} />
          <form method="dialog">
            <button type="submit" className="pm-btn">
              Close
            </button>
          </form>
        </div>
      </dialog>
    </figure>
  );
}
