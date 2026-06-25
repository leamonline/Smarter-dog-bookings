// ============================================================
// src/components/dev/ComposePreview.jsx
//
// Dev-only harness for the inbox compose bar (ComposePanel). Mounts the
// REAL component with mocked props inside a card frame that mimics the
// inbox detail pane (overflow-hidden, like InboxView's card), so the
// mobile-stacking + overflow behaviour can be screenshotted at a phone
// width without standing up the whole inbox data hook.
//
// Mounted on /dev/compose-preview, gated by `import.meta.env.DEV` in the
// router so it never bundles into production.
// ============================================================

import { ComposePanel } from "../views/inbox/thread/ComposePanel.jsx";

// last_inbound_at a few minutes ago → the Meta 24h window is OPEN, so
// ComposePanel renders the free-text textarea (the box the bug is about).
const recentInbound = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const conversation = { id: "demo-open", last_inbound_at: recentInbound };

async function noopSend() {
  return { ok: true };
}
async function noopGenerate() {
  return { ok: true, replyText: "Here's a friendly suggested reply." };
}

function Frame({ title, children }) {
  return (
    <section className="mb-8">
      <h3 className="text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">
        {title}
      </h3>
      {/* Mimic the inbox card: overflow-hidden so any compose overflow would
          clip at this edge exactly as it does in the real layout. */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">{children}</div>
      </div>
    </section>
  );
}

export function ComposePreview() {
  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h2 className="text-base font-bold text-slate-800 mb-1">
        Compose bar preview
      </h2>
      <p className="text-[13px] text-slate-500 mb-6">
        Resize the viewport across the <code>sm</code> (640px) breakpoint to see
        mobile stacking vs the desktop row. The reply box must keep the Send
        button on-screen at all widths.
      </p>

      <Frame title="With Generate reply (inbound present)">
        <ComposePanel
          conversation={conversation}
          onSend={noopSend}
          onSendTemplate={noopSend}
          dogNames={["Bella"]}
          inFlight={false}
          hasPendingDraft={false}
          hasInbound
          onGenerateReply={noopGenerate}
        />
      </Frame>

      <Frame title="Without Generate reply (no inbound)">
        <ComposePanel
          conversation={conversation}
          onSend={noopSend}
          onSendTemplate={noopSend}
          dogNames={["Bella"]}
          inFlight={false}
          hasPendingDraft={false}
          hasInbound={false}
          onGenerateReply={noopGenerate}
        />
      </Frame>
    </div>
  );
}
