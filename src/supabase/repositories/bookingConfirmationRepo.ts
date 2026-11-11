import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Client = SupabaseClient<Database>;
export type ConfirmationService = "sms" | "whatsapp" | "email";
export interface ConfirmationContact {
  preferredService: ConfirmationService | null;
  phone: string | null;
  whatsapp: boolean;
  email: string | null;
  whatsappOptedOut: boolean;
  smsOptedOut: boolean;
  emailOptedOut: boolean;
}

export async function fetchConfirmationContact(client: Client, humanId: string): Promise<ConfirmationContact | null> {
  const { data, error } = await client.from("humans")
    .select("preferred_channel, phone, whatsapp, email, whatsapp_opted_out, sms_opted_out, email_opted_out")
    .eq("id", humanId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    preferredService: ["sms", "whatsapp", "email"].includes(data.preferred_channel ?? "")
      ? data.preferred_channel as ConfirmationService : null,
    phone: data.phone,
    whatsapp: data.whatsapp === true,
    email: data.email,
    whatsappOptedOut: data.whatsapp_opted_out,
    smsOptedOut: data.sms_opted_out,
    emailOptedOut: data.email_opted_out,
  };
}

export interface ConfirmationLog {
  bookingId: string;
  groupId: string | null;
  humanId: string | null;
  trigger: string;
  channel: string;
  status: string;
  error: string | null;
  createdAt: string | null;
  providerId: string | null;
}
export interface ConfirmationDelivery {
  providerId: string;
  channel: string;
  status: string;
}
export interface ConfirmationSnapshot {
  logs: ConfirmationLog[];
  deliveries: ConfirmationDelivery[];
}

export async function fetchConfirmationSnapshot(client: Client, bookingIds: string[]): Promise<ConfirmationSnapshot> {
  if (!bookingIds.length) return { logs: [], deliveries: [] };
  const { data, error } = await client.from("notification_log")
    .select("booking_id, group_id, human_id, trigger_type, channel, status, error_message, created_at, provider_message_id")
    .in("booking_id", bookingIds).in("trigger_type", ["confirmed", "confirmed_sms_fallback"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  const logs: ConfirmationLog[] = (data ?? []).flatMap((row) => row.booking_id ? [{
    bookingId: row.booking_id, groupId: row.group_id, humanId: row.human_id,
    trigger: row.trigger_type, channel: row.channel, status: row.status,
    error: row.error_message, createdAt: row.created_at, providerId: row.provider_message_id,
  }] : []);
  const providerIds = [...new Set(logs.flatMap((row) => row.providerId ? [row.providerId] : []))];
  if (!providerIds.length) return { logs, deliveries: [] };
  const receipts = await client.from("whatsapp_messages")
    .select("meta_message_id, channel, status").in("meta_message_id", providerIds)
    .eq("direction", "outbound");
  if (receipts.error) throw receipts.error;
  return {
    logs,
    deliveries: (receipts.data ?? []).flatMap((row) => row.meta_message_id ? [{
      providerId: row.meta_message_id, channel: row.channel, status: row.status,
    }] : []),
  };
}
