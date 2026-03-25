import React from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap.ts";
import { BRAND } from "../../constants/index.ts";
import type { Human } from "../../types.ts";

interface Props {
  human: Human;
  onClose: () => void;
}

export function ContactPopup({ human, onClose }: Props) {
  const trapRef = useFocusTrap(onClose);
  if (!human) return null;

  const fullName = `${human.name} ${human.surname}`;

  const row = (label: string, value: React.ReactNode, active?: boolean) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${BRAND.greyLight}` }}>
      <span style={{ fontSize: 13, color: BRAND.textLight }}>{label}</span>
      {typeof active === "boolean" ? (
        <span style={{ fontSize: 13, fontWeight: 600, color: active ? BRAND.teal : BRAND.coral }}>
          {active ? "\u2705 On" : "\u274C Off"}
        </span>
      ) : (
        <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>{value}</span>
      )}
    </div>
  );

  return (
    <div ref={trapRef} onClick={onClose} style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.25)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100,
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()} style={{
        background: BRAND.white, borderRadius: 14, width: 280, overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }}>
        <div style={{
          background: `linear-gradient(135deg, ${BRAND.teal}, #236b5d)`,
          padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div id="modal-title" style={{ fontSize: 15, fontWeight: 700, color: BRAND.white }}>{fullName}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>Contact preferences</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 6, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12, color: BRAND.white, fontWeight: 700 }}>{"\u00D7"}</button>
        </div>
        <div style={{ padding: "10px 18px 16px" }}>
          {row("Phone", human.phone)}
          {row("SMS", null, human.sms)}
          {row("WhatsApp", null, human.whatsapp)}
          {human.email ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
              <span style={{ fontSize: 13, color: BRAND.textLight }}>Email</span>
              <a href={`mailto:${human.email}`} style={{ fontSize: 13, fontWeight: 600, color: BRAND.teal, textDecoration: "none" }}>{human.email}</a>
            </div>
          ) : row("Email", "\u2014")}
        </div>
      </div>
    </div>
  );
}
