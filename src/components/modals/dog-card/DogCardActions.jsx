import { IconEdit, IconTick } from "../../icons/index.jsx";

export function DogCardActions({
  isEditing,
  onSave,
  onCancel,
  onEdit,
  sizeTheme,
  headerTextColour,
}) {
  return (
    <div className="px-6 py-4 pb-5 flex gap-2.5 bg-slate-50 border-t border-slate-200 mt-4">
      {isEditing ? (
        <>
          <button
            onClick={onSave}
            className="flex-1 py-2.5 rounded-[10px] border-none text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-colors"
            style={{
              background: sizeTheme.gradient[0],
              color: headerTextColour,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = sizeTheme.primary)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = sizeTheme.gradient[0])
            }
          >
            <IconTick size={16} colour={headerTextColour} /> Save
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-[10px] border-[1.5px] border-slate-200 bg-white text-slate-500 text-[13px] font-bold cursor-pointer font-inherit transition-colors hover:bg-slate-50"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          onClick={onEdit}
          className="flex-1 py-2.5 rounded-[10px] border-none text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-colors"
          style={{
            background: sizeTheme.gradient[0],
            color: headerTextColour,
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = sizeTheme.primary)
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = sizeTheme.gradient[0])
          }
        >
          <IconEdit size={16} colour={headerTextColour} /> Edit
        </button>
      )}
    </div>
  );
}
