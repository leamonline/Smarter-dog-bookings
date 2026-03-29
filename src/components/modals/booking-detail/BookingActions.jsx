import { BRAND } from "../../../constants/index.js";
import {
  IconTick,
  IconEdit,
  IconMessage,
  IconBlock,
} from "../../icons/index.jsx";

export function BookingActions({
  isEditing,
  editData,
  saving,
  booking,
  onSave,
  onCancelEdit,
  onEnterEdit,
  onShowContact,
  onRemove,
  onClose,
  onRebook,
}) {
  if (isEditing) {
    return (
      <div
        style={{
          padding: "16px 24px 20px",
          display: "flex",
          gap: 10,
          background: BRAND.offWhite,
          borderTop: `1px solid ${BRAND.greyLight}`,
        }}
      >
        <button
          onClick={onSave}
          disabled={!editData.slot || saving}
          style={{
            flex: 1,
            padding: "12px 0",
            borderRadius: 10,
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: !editData.slot || saving ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background:
              !editData.slot || saving ? BRAND.greyLight : BRAND.blue,
            color: !editData.slot || saving ? BRAND.textLight : BRAND.white,
            transition: "background 0.15s",
          }}
        >
          <IconTick size={16} colour={BRAND.white} />{" "}
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button
          onClick={onCancelEdit}
          style={{
            flex: 1,
            padding: "12px 0",
            borderRadius: 10,
            border: `1.5px solid ${BRAND.greyLight}`,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: BRAND.white,
            color: BRAND.textLight,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = BRAND.offWhite)
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = BRAND.white)
          }
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "16px 24px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: BRAND.offWhite,
        borderTop: `1px solid ${BRAND.greyLight}`,
      }}
    >
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={onEnterEdit}
          style={{
            flex: 1,
            padding: "12px 0",
            borderRadius: 10,
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: BRAND.blue,
            color: BRAND.white,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = BRAND.blueDark)
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = BRAND.blue)
          }
        >
          <IconEdit size={16} colour={BRAND.white} /> Edit
        </button>
        <button
          onClick={onShowContact}
          style={{
            flex: 1,
            padding: "12px 0",
            borderRadius: 10,
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: BRAND.teal,
            color: BRAND.white,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "#236b5d")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = BRAND.teal)
          }
        >
          <IconMessage size={16} colour={BRAND.white} /> Message
        </button>
        <button
          onClick={async () => {
            const removed = await onRemove(booking.id);
            if (removed !== false) onClose();
          }}
          style={{
            flex: 1,
            padding: "12px 0",
            borderRadius: 10,
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: BRAND.coralLight,
            color: BRAND.coral,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "#fbd4df")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = BRAND.coralLight)
          }
        >
          <IconBlock size={16} colour={BRAND.coral} /> Cancel
        </button>
      </div>
      {booking.status === "Completed" && onRebook && (
        <button
          onClick={() => {
            onRebook(booking);
            onClose();
          }}
          style={{
            width: "100%",
            padding: "12px 0",
            borderRadius: 10,
            border: `2px solid ${BRAND.blue}`,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: BRAND.blueLight,
            color: BRAND.blueDark,
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = BRAND.blue;
            e.currentTarget.style.color = BRAND.white;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = BRAND.blueLight;
            e.currentTarget.style.color = BRAND.blueDark;
          }}
        >
          {"\uD83D\uDD01"} Rebook this dog
        </button>
      )}
    </div>
  );
}
