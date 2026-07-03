// The one and only "Today" heading. The app shell hides its context row on
// /today, so this header carries the page identity plus the two numbers a
// groomer wants in the first second: how many dogs, and whether anything
// needs them right now.
export function TodayHeader({ dateLabel, dogsBooked, actionCount, isDayOpen }) {
  const dogsLabel = `${dogsBooked} ${dogsBooked === 1 ? "dog" : "dogs"} booked`;
  return (
    <header>
      <h1 className="font-display text-[24px] font-extrabold text-brand-purple leading-tight">
        Today
      </h1>
      <p className="text-[13px] text-slate-600 mt-0.5">
        <span className="font-semibold text-slate-700">{dateLabel}</span>
        {!isDayOpen && (
          <>
            {" · "}
            <span className="font-bold text-brand-coral-text">salon closed</span>
          </>
        )}
        {" · "}
        {dogsLabel}
        {" · "}
        {actionCount > 0 ? (
          <span className="font-bold text-brand-coral-text">
            {actionCount} {actionCount === 1 ? "action" : "actions"} needed
          </span>
        ) : (
          <span className="font-semibold text-brand-teal-text">all calm</span>
        )}
      </p>
    </header>
  );
}
