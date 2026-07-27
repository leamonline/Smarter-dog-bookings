// Staff-only persistence for the global AI WhatsApp safety switch.
// Components deliberately do not touch the Supabase client directly.
import { supabase } from "../client.js";

export interface AiWhatsAppSetting {
  enabled: boolean;
  updated_at: string;
  updated_by: string | null;
}

export function isAiMessagingBackendAvailable(): boolean {
  return Boolean(supabase);
}

export async function getAiWhatsAppSetting() {
  if (!supabase) {
    return { data: null, error: new Error("offline") };
  }
  return supabase.rpc("get_ai_whatsapp_settings");
}

export async function setAiWhatsAppEnabled(enabled: boolean) {
  if (!supabase) {
    return { data: null, error: new Error("offline") };
  }
  return supabase.rpc("set_ai_whatsapp_enabled", { p_enabled: enabled });
}
