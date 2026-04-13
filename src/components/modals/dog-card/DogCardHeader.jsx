import { titleCase } from "./helpers.js";

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
  titleId,
}) {
  return (
    <div
      className="px-6 py-5 rounded-t-2xl flex justify-between items-start"
      style={{
        background: `linear-gradient(135deg, ${sizeTheme.gradient[0]}, ${sizeTheme.gradient[1]})`,
      }}
    >
      <div className="flex-1 mr-3">
        {isEditing ? (
          <>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Dog name"
              className="text-xl font-extrabold bg-white/15 border border-white/30 rounded-lg px-2.5 py-1 w-full box-border outline-none font-inherit"
              style={{ color: headerTextColour }}
            />
            <div className="flex gap-2 mt-1.5">
              <input
                value={editBreed}
                onChange={(e) => setEditBreed(e.target.value)}
                placeholder="Breed"
                className="text-[13px] bg-white/15 border border-white/30 rounded-md px-2 py-[3px] flex-1 outline-none font-inherit"
                style={{ color: headerTextColour }}
              />
              <span className="text-xs" style={{ color: headerSubTextColour }}>Born</span>
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
          </>
        ) : (
          <>
            <div id={titleId} className="text-xl font-extrabold" style={{ color: headerTextColour }}>
              {titleCase(resolvedDog.name)}
            </div>
            <div
              className="text-[13px] mt-1"
              style={{ color: headerSubTextColour }}
            >
              {titleCase(resolvedDog.breed)}{displayAge ? ` \u00b7 ${displayAge}` : ""}
            </div>
          </>
        )}
      </div>
      <button
        onClick={onClose}
        className="bg-white/20 border-none rounded-lg w-7 h-7 flex items-center justify-center cursor-pointer text-sm font-bold shrink-0"
        style={{ color: headerTextColour }}
      >
        {"\u00d7"}
      </button>
    </div>
  );
}
