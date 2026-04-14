import { titleCase } from "./helpers.js";
import { IconEdit } from "../../icons/index.jsx";

export function DogCardHeader({
  isEditing,
  resolvedDog,
  displayAge,
  editName,
  setEditName,
  editBreed,
  setEditBreed,
  editDobMonth,
  setEditDobMonth,
  editDobYear,
  setEditDobYear,
  sizeTheme,
  headerTextColour,
  headerSubTextColour,
  onClose,
  onEnterEdit,
  titleId,
}) {
  const gradient = `linear-gradient(135deg, ${sizeTheme.gradient[0]}, ${sizeTheme.gradient[1]})`;
  const subtitle = [
    titleCase(resolvedDog.breed),
    displayAge ? displayAge.replace(" yrs", "yo") : "",
  ].filter(Boolean).join(" \u00b7 ");

  return (
    <div
      className="px-6 py-6 rounded-t-2xl relative"
      style={{ background: gradient }}
    >
      <div className="absolute top-5 right-5 flex items-center gap-2">
        {!isEditing && onEnterEdit && (
          <button
            onClick={onEnterEdit}
            className="bg-white/20 border-none rounded-lg w-9 h-9 flex items-center justify-center cursor-pointer shrink-0"
            style={{ color: headerTextColour }}
          >
            <IconEdit size={16} colour={headerTextColour} />
          </button>
        )}
        <button
          onClick={onClose}
          className="bg-white/20 border-none rounded-lg w-9 h-9 flex items-center justify-center cursor-pointer text-base font-bold shrink-0"
          style={{ color: headerTextColour }}
        >
          {"\u00D7"}
        </button>
      </div>

      {isEditing ? (
        <div className="pr-20">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Dog name"
            className="text-[24px] font-extrabold bg-white/15 border border-white/30 rounded-lg px-2.5 py-1 w-full box-border outline-none font-inherit"
            style={{ color: headerTextColour }}
          />
          <div className="flex gap-2 mt-2">
            <input
              value={editBreed}
              onChange={(e) => setEditBreed(e.target.value)}
              placeholder="Breed"
              className="text-[13px] bg-white/15 border border-white/30 rounded-md px-2 py-[3px] flex-1 outline-none font-inherit"
              style={{ color: headerTextColour }}
            />
            <span className="text-xs self-center" style={{ color: headerSubTextColour }}>Born</span>
            <select
              value={editDobMonth}
              onChange={(e) => setEditDobMonth(e.target.value)}
              className="text-xs bg-white/15 border border-white/30 rounded-md px-1 py-[3px] outline-none font-inherit cursor-pointer"
              style={{ color: headerTextColour }}
            >
              <option value="" className="text-slate-800">Month</option>
              {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                <option key={m} value={String(i + 1).padStart(2, "0")} className="text-slate-800">{m}</option>
              ))}
            </select>
            <select
              value={editDobYear}
              onChange={(e) => setEditDobYear(e.target.value)}
              className="text-xs bg-white/15 border border-white/30 rounded-md px-1 py-[3px] outline-none font-inherit cursor-pointer"
              style={{ color: headerTextColour }}
            >
              <option value="" className="text-slate-800">Year</option>
              {Array.from({ length: 26 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                <option key={y} value={String(y)} className="text-slate-800">{y}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <>
          <div
            id={titleId}
            className="text-[28px] font-extrabold leading-tight"
            style={{ color: headerTextColour }}
          >
            {titleCase(resolvedDog.name)}
          </div>
          {subtitle && (
            <div
              className="text-[15px] font-medium mt-1"
              style={{ color: headerSubTextColour }}
            >
              {subtitle}
            </div>
          )}
          {resolvedDog.size && (
            <div className="mt-2.5">
              <span
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[13px] font-bold"
                style={{
                  background: "rgba(255,255,255,0.2)",
                  color: headerTextColour,
                }}
              >
                {titleCase(resolvedDog.size)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
