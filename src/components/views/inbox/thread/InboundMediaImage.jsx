// ============================================================
// src/components/views/inbox/thread/InboundMediaImage.jsx
//
// The actual customer-sent photo inside an inbound bubble. Resolves
// the private storage path to a signed URL; until that lands (or if it
// fails / we're offline) it degrades to the same friendly chip the
// thread showed before photos were stored at all, so nothing ever
// renders broken.
// ============================================================

import { useSignedMediaUrl } from "../../../../supabase/hooks/useSignedMediaUrl.js";
import { mediaPresentation } from "./messageContent";

export function InboundMediaImage({ path, mediaType = "image" }) {
  const url = useSignedMediaUrl(path);
  const { icon, label } = mediaPresentation(mediaType);

  if (!url) {
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-600 italic">
        <span aria-hidden="true" className="not-italic text-[15px]">{icon}</span>
        {label}
      </span>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block -mx-1 -mt-0.5 mb-1"
      title="Open full size"
    >
      <img
        src={url}
        alt="Photo from customer"
        loading="lazy"
        className="rounded-xl max-w-full max-h-72 w-auto border border-slate-200"
      />
    </a>
  );
}
