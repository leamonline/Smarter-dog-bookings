// Records staff were shown that are no longer switched off on this number,
// but that nothing shows were switched back on: those that read as switched
// off now (still off, wherever their number is), and those it cannot be
// said either way. They are no longer in the scope list, so each gets its
// own "Open … profile" button here. Spans, not blocks: it sits inside the
// outcome message (a <p>) as well as inside a notice.
import { Button } from "../../ui/index.js";
import {
  leftNumberMessage,
  profileButtonLabel,
  unconfirmedRecordsMessage,
} from "../../../engine/whatsappReenable";

/**
 * The lines and buttons for `stillOff` and `unconfirmed`, or null when there
 * is nothing to say. On a profile (`ownId`), its own record is told to
 * refresh rather than to open itself, and is left out entirely when the
 * out-of-date line already says so (`hideOwn`).
 */
export function movedRecords({ stillOff = [], unconfirmed = [], ownId = null, hideOwn = false }) {
  const isOwn = (record) => Boolean(ownId) && record.id === ownId;
  const others = (records) => records.filter((record) => !isOwn(record));
  const own = (records) => (hideOwn ? [] : records.filter(isOwn));
  const lines = [
    leftNumberMessage(own(stillOff), { ownProfile: true }),
    unconfirmedRecordsMessage(own(unconfirmed), { ownProfile: true }),
    leftNumberMessage(others(stillOff)),
    unconfirmedRecordsMessage(others(unconfirmed)),
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
