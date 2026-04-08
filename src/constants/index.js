export { SIZE_THEME, SIZE_FALLBACK } from "./brand.js";
export {
  SALON_SLOTS,
  MAX_DOGS_PER_SLOT,
  SERVICES,
  ALL_DAYS,
  LARGE_DOG_SLOTS,
  PRICING,
  ALERT_OPTIONS,
  BOOKING_STATUSES,
  NO_SHOW_STATUS,
} from "./salon.js";
// styles.js exports (inputStyle, labelStyle, closeBtnStyle, onInputFocus, onInputBlur)
// are no longer imported by any component — all forms now use Tailwind classes directly.
export {
  BREED_SIZE_MAP,
  BREED_LIST,
  getSizeForBreed,
} from "./breeds.js";
