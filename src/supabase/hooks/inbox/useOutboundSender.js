// useOutboundSender — staff-initiated message sends from the inbox
// header's "New message" composer. Decoupled from the rest of the
// inbox hook because the conversation context is supplied by the
// picker (humanId + phoneE164) rather than read from the currently
// selected thread.
//
// Returns:
//   sendOutboundSMS({ humanId, phoneE164, text })
//     → { ok: true } | { ok: false, reason: string }
//   sendOutboundTemplate({ humanId, phoneE164, template, paramValues })
//     → { ok: true } | { ok: false, reason: string }
//
// Both refetch the conversation list on success so the newly-upserted
// conversation shows up immediately (the realtime channel also fires,
// but the explicit refetch keeps the post-send navigation
// synchronous).
import { useCallback } from "react";
import { supabase } from "../../client";
import { buildTemplateParams } from "../../../constants/whatsappTemplates.js";
import { SEND_FUNCTION_PATH, parseSupabaseFunctionError } from "./helpers.js";

export function useOutboundSender({ refreshList }) {
  const sendOutboundSMS = useCallback(
    async ({ humanId, phoneE164, text }) => {
      if (!phoneE164 || !text) {
        return { ok: false, reason: "missing recipient or text" };
      }
      const { error } = await supabase.functions.invoke("sms-send", {
        body: {
          mode: "manual",
          to: phoneE164,
          text,
          human_id: humanId ?? null,
        },
      });
      if (error) {
        const detail = await parseSupabaseFunctionError(error, "SMS send failed");
        return { ok: false, reason: detail };
      }
      const conversations = await refreshList();
      return { ok: true, conversations };
    },
    [refreshList],
  );

  const sendOutboundTemplate = useCallback(
    async ({ humanId, phoneE164, template, paramValues }) => {
      if (!phoneE164 || !template) {
        return { ok: false, reason: "missing recipient or template" };
      }
      const params = buildTemplateParams(template, paramValues);
      const { error } = await supabase.functions.invoke(SEND_FUNCTION_PATH, {
        body: {
          mode: "template",
          to: phoneE164,
          template_name: template.name,
          language: template.language,
          params,
          human_id: humanId ?? null,
        },
      });
      if (error) {
        const detail = await parseSupabaseFunctionError(error, "Template send failed");
        return { ok: false, reason: detail };
      }
      const conversations = await refreshList();
      return { ok: true, conversations };
    },
    [refreshList],
  );

  return { sendOutboundSMS, sendOutboundTemplate };
}
