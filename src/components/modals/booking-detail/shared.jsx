import { BRAND } from "../../../constants/index.js";

export const modalInputStyle = {
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${BRAND.greyLight}`,
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "inherit",
  color: BRAND.text,
};

export function LogisticsLabel({ text }) {
  return (
    <span
      style={{
        color: BRAND.blueDark,
        textTransform: "uppercase",
        fontWeight: 800,
        fontSize: 12,
        letterSpacing: 0.5,
      }}
    >
      {text}
    </span>
  );
}

export function FinanceLabel({ text }) {
  return (
    <span
      style={{
        color: BRAND.openGreen,
        textTransform: "uppercase",
        fontWeight: 800,
        fontSize: 12,
        letterSpacing: 0.5,
      }}
    >
      {text}
    </span>
  );
}

export function DetailRow({
  label,
  value,
  editNode = null,
  verticalEdit = false,
  isEditing,
}) {
  return (
    <div
      style={{
        padding: "10px 0",
        borderBottom: `1px solid ${BRAND.greyLight}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems:
            isEditing && editNode && !verticalEdit ? "center" : "flex-start",
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: BRAND.textLight,
            flexShrink: 0,
            paddingRight: 12,
            paddingTop: isEditing && editNode && !verticalEdit ? 0 : 2,
          }}
        >
          {label}
        </span>
        {isEditing && editNode && !verticalEdit ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              justifyContent: "flex-end",
              maxWidth: "65%",
            }}
          >
            {editNode}
          </div>
        ) : (
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: BRAND.text,
              textAlign: "right",
              wordBreak: "break-word",
            }}
          >
            {value}
          </span>
        )}
      </div>
      {isEditing && editNode && verticalEdit && (
        <div style={{ marginTop: 8 }}>{editNode}</div>
      )}
    </div>
  );
}
