import { useEffect, useState } from "react";
import {
  getAiWhatsAppSetting,
  isAiMessagingBackendAvailable,
  setAiWhatsAppEnabled,
} from "../../../supabase/repositories/aiMessagingRepo";
import { Card, CardBody, CardHead, SettingRow, Toggle } from "./shared.jsx";

function firstRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

export function AiWhatsAppSettings() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isAiMessagingBackendAvailable()) {
        if (!cancelled) {
          setError(
            "Automatic AI WhatsApp messages are blocked because the setting is unavailable.",
          );
          setLoading(false);
        }
        return;
      }
      const { data, error: readError } = await getAiWhatsAppSetting();
      const row = firstRow(data);
      if (cancelled) return;
      if (readError || typeof row?.enabled !== "boolean") {
        setEnabled(false);
        setError(
          "Automatic AI WhatsApp messages are blocked because the setting could not be read.",
        );
      } else {
        setEnabled(row.enabled);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    if (!isAiMessagingBackendAvailable() || loading || saving || error) return;
    const next = !enabled;
    setSaving(true);
    const { data, error: saveError } = await setAiWhatsAppEnabled(next);
    const row = firstRow(data);
    if (saveError || typeof row?.enabled !== "boolean") {
      setError(
        "Automatic AI WhatsApp messages are blocked because the change could not be confirmed.",
      );
      setEnabled(false);
    } else {
      setEnabled(row.enabled);
    }
    setSaving(false);
  }

  return (
    <Card id="settings-ai-whatsapp">
      <CardHead
        variant="teal"
        title="AI WhatsApp messages"
        desc="The master safety switch for messages sent automatically by the AI"
      />
      <CardBody>
        <SettingRow
          border={false}
          label="Allow automatic AI WhatsApp messages"
          sublabel="When off, the AI cannot send WhatsApp messages. Staff can still write and send messages manually."
          control={
            <Toggle
              on={enabled}
              onToggle={toggle}
              disabled={loading || saving || Boolean(error)}
              aria-label="Allow automatic AI WhatsApp messages"
            />
          }
        />
        <p
          role={error ? "alert" : "status"}
          className={`mt-2 text-xs font-semibold ${
            error
              ? "text-brand-coral"
              : enabled
                ? "text-emerald-700"
                : "text-slate-600"
          }`}
        >
          {error ||
            (loading
              ? "Checking the current setting…"
              : enabled
                ? "On — customer-level blocks still take priority."
                : "Off — automatic AI WhatsApp messages are blocked.")}
        </p>
      </CardBody>
    </Card>
  );
}
