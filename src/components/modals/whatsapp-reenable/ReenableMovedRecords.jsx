// Records staff were shown that are no longer switched off on this number,
// but that nothing shows were switched back on: those that read as switched
// off now (wherever their number is), those it cannot be said either way,
// and those that no longer exist (merged away, or deleted). They are no
// longer in the scope list, so each that still exists gets its own
// "Open … profile" button here. Spans, not blocks: it sits inside the
// outcome message (a <p>) as well as inside a notice.
import { Button } from "../../ui/index.js";
import {
  goneRecordsMessage,
  leftNumberMessage,
  profileButtonLabel,
  unconfirmedRecordsMessage,
} from "../../../engine/whatsappReenable";

/**
 * The lines and buttons for `stillOff`, `unconfirmed` and `gone`, or null
 * when there is nothing to say. On a profile (`ownId`), its own record is
 * told to refresh rather than to open itself. `hidden`: ids another line in
 * the dialog already speaks for (the profile's own record under the
 * out-of-date line, the chat's linked customer under its own line), left
 * out entirely.
 */
export function movedRecords({ stillOff = [], unconfirmed = [], gone = [], ownId = null, hidden = [] }) {
  const shown = (records) => records.filter((record) => !hidden.includes(record.id));
  const isOwn = (record) => Boolean(ownId) && record.id === ownId;
  const others = (records) => shown(records).filter((record) => !isOwn(record));
  const own = (records) => shown(records).filter(isOwn);
  const lines = [
    leftNumberMessage(own(stillOff), { ownProfile: true }),
    unconfirmedRecordsMessage(own(unconfirmed), { ownProfile: true }),
    leftNumberMessage(others(stillOff)),
    unconfirmedRecordsMessage(others(unconfirmed)),
    goneRecordsMessage(shown(gone)),
  ].filter(Boolean);
  if (lines.length === 0) return null;
  return { lines, linkable: [...others(stillOff), ...others(unconfirmed)] };
}

/** `afterText`: something precedes it in the same element, so the first line is spaced from it. */
export function ReenableMovedRecords({ moved, afterText = false, onOpenProfile, disabled = false }) {
  if (!moved) return null;
  const links = onOpenProfile ? moved.linkable : [];
  return (
    <>
      {moved.lines.map((line, index) => (
        <span key={line} className={index === 0 && !afterText ? "block" : "block mt-1.5"}>
          {line}
        </span>
      ))}
      {links.length > 0 && (
        <span className="flex flex-wrap gap-1.5 mt-1.5">
          {links.map((record) => (
            <Button key={record.id} variant="ghost" size="sm" disabled={disabled} onClick={() => onOpenProfile(record.id)}>
              {profileButtonLabel(record)}
            </Button>
          ))}
        </span>
      )}
    </>
  );
}
