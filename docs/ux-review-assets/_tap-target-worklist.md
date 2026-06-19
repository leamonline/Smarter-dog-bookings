# Tap-target worklist (≥44px) — from the 2026-06-19 audit

Audit found **100** sub-44px interactive controls (none:14 low:72 medium:13 high:1).

## Shared approach
Add a reusable Tailwind v4 `@utility` in index.css called `tap-44` (and optional `tap-44-responsive` for mobile scaling) that ensures all interactive controls meet the 44x44px WCAG 2.5.5 minimum. Apply this utility or the canonical class string `min-h-11 min-w-11 inline-flex items-center justify-center` (responsive: `min-h-8 min-w-8 max-sm:min-h-11 max-sm:min-w-11 inline-flex items-center justify-center`) consistently across: DatePickerModal close/nav buttons, AddHumanModal close button, AvailabilityCalendar nav buttons, RightRailCalmRow chip buttons, DogPill buttons, and AddToCalendarButton compact mode. Use `min-height`/`min-width` instead of `h-`/`w-` to preserve glyph size while expanding the invisible touch area.

```css
/* Add to index.css after @theme block, in a new @layer utilities section: */

@layer utilities {
  .tap-44 {
    @apply min-h-11 min-w-11 inline-flex items-center justify-center;
  }

  .tap-44-responsive {
    @apply min-h-8 min-w-8 max-sm:min-h-11 max-sm:min-w-11 inline-flex items-center justify-center;
  }
}
```
_(Implemented as the simpler `.tap-target { min-width:44px; min-height:44px }` in src/index.css — glyph size unchanged, hit area grows.)_

## ✅ Applied in batch 4 (PR — modal close/nav buttons)
Reusable `.tap-target` utility + applied to modal header close/nav icon buttons (layout-safe standalone controls): AddDogModal, AddHumanModal, TodoModal, WaitlistModal, PhotoUploadModal, PhotoGalleryModal, PhotoLightbox, DatePickerModal (prev/next/close), ChainBookingModal, SendReminderModal, CollectionNoticeModal, OverviewDrawer.

## ⏳ Deferred (need visual/layout judgment — forcing 44px risks breaking dense layouts)
Key constrained cases: the A–Z rail (27 letters stacked vertically can't each be 44px), dense booking-card icon rows, calendar date grids (MiniCalendar/AvailabilityCalendar/TimeSlotPicker/Reschedule pickers), inline chips (add-ons, channel/notification pills), the BookingStatusBar stepper (high risk), Settings toggles, and the RevenueTrend chart bars (do NOT resize — height encodes data).

## Full worklist by area

### booking-grid (10)
| risk | file | control | est | current → proposed |
|---|---|---|---|---|
| low | GhostSeat.jsx line 19 | Block seat button in BlockMenu | ~24x22 | `py-1.5 px-3 rounded-md (in line 19 Block` → change to py-2.5 px-3 min-h-[44px] inline-flex items-center justify-ce |
| low | GhostSeat.jsx line 85 | Block button (circular) in GhostSeat | 40x40 | `w-10 h-10 rounded-full` → add min-w-11 min-h-11 OR change w-10 h-10 to w-11 h-11 |
| low | BookingCardNew.jsx line 154 | Close button in AlertsPopover | 24x24 | `w-6 h-6 rounded-full` → change to w-8 h-8 OR min-w-[44px] min-h-[44px] inline-flex items-cente |
| medium | BookingCardNew.jsx line 320 | Alerts icon button on booking card | 24x24 | `w-6 h-6 rounded-full` → change to w-8 h-8 OR add min-w-[44px] min-h-[44px] |
| low | BookingCardNew.jsx line 350 | Reminder confirmed (checkmark) badge | 20x20 | `w-5 h-5 rounded-full` → change to w-6 h-6 or w-8 h-8, OR mark as non-interactive decorative sp |
| low | BookingCardNew.jsx line 364 | Delivery failure badge (alert icon) | 20x20 | `w-5 h-5 rounded-full` → if interactive, change to w-6 h-6 or w-8 h-8; if decorative, remove cu |
| low | SlotRowMenu.jsx line 248 | MenuItem button in SlotRowMenu popup | ~54x32 | `px-3 py-2 rounded-full` → increase padding to py-2.5 px-4 and min-h-[44px] inline-flex items-cen |
| none | DayHeader.jsx line 41 | Previous day chevron button | 36x36 | `w-9 h-9 rounded-full` → change to w-10 h-10 OR add min-w-11 min-h-11 |
| none | DayHeader.jsx line 57 | Next day chevron button | 36x36 | `w-9 h-9 rounded-full` → change to w-10 h-10 OR add min-w-11 min-h-11 |
| none | DayHeader.jsx line 78 | Calendar icon button (open calendar overview) | 36x36 | `w-9 h-9 rounded-full` → change to w-10 h-10 OR add min-w-11 min-h-11 |

### dashboard-rail (7)
| risk | file | control | est | current → proposed |
|---|---|---|---|---|
| low | RightRailCalmRow.jsx line 24-31, Chip button component | Calm state card links (tertiary chips) in the right-rail summary row | ~24x24 | `inline-flex items-center gap-1 px-2 py-1` → min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-3 |
| low | MiniCalendarCard.jsx line 58-65, Previous month button | Previous month chevron button | ~36x36 | `w-9 h-9 rounded-full flex items-center j` → min-h-[44px] min-w-[44px] w-11 h-11 rounded-full flex items-center jus |
| low | MiniCalendarCard.jsx line 69-76, Next month button | Next month chevron button | ~36x36 | `w-9 h-9 rounded-full flex items-center j` → min-h-[44px] min-w-[44px] w-11 h-11 rounded-full flex items-center jus |
| medium | MiniCalendarCard.jsx line 138-162, Date number buttons in calendar grid | Calendar date buttons (clickable number cells) | ~32x32 | `relative w-full aspect-square rounded-md` → min-h-[44px] min-w-[44px] relative w-full rounded-md text-[11px] font- |
| low | TomorrowRemindersCard.jsx line 180-186, Error retry button | Inline 'Retry' text button in error alert | ~18x16 | `ml-2 underline font-semibold cursor-poin` → ml-2 px-2 py-1 underline font-semibold cursor-pointer bg-transparent b |
| low | OverviewDrawer.jsx line 90-98, Close drawer button | Close (X) button in drawer header | ~36x36 | `w-9 h-9 rounded-full flex items-center j` → min-h-[44px] min-w-[44px] w-11 h-11 rounded-full flex items-center jus |
| low | CapacityCard.jsx line 106-120, Next available date link | Text link button for next available booking slot | ~18x18 | `group text-left w-full flex items-center` → group text-left w-full flex items-center justify-between gap-2 text-sm |

### directories: DogsView.jsx, HumansView.jsx, SizeDot.jsx, AddDogModal.jsx, AddHumanModal.jsx, DogCardModal.jsx, HumanCardModal.jsx (9)
| risk | file | control | est | current → proposed |
|---|---|---|---|---|
| medium | DogsView.jsx line 69 | A–Z alphabet letter buttons (AlphabetRail) | 24x24 | `w-6 h-6 flex items-center justify-center` → Add min-w-11 min-h-11 (or max-sm:min-w-11 max-sm:min-h-11 for responsi |
| low | DogsView.jsx line 171 | WhatsApp message icon button (dog owner contact link) | 24x24 on desktop, 36x36 on mobile | `w-6 h-6 max-sm:w-9 max-sm:h-9 rounded-fu` → Change to min-w-11 min-h-11 (44px) all breakpoints, or at minimum max- |
| medium | HumansView.jsx line 38 | A–Z alphabet letter buttons (AlphabetRail) | 24x24 | `w-6 h-6 flex items-center justify-center` → Add min-w-11 min-h-11 (or max-sm:min-w-11 max-sm:min-h-11 for responsi |
| low | HumansView.jsx line 211 | WhatsApp message icon button (human contact link in list view) | 24x24 on desktop, 36x36 on mobile | `w-6 h-6 max-sm:w-9 max-sm:h-9 rounded-fu` → Change to min-w-11 min-h-11 all breakpoints, or max-sm:min-w-11 max-sm |
| low | HumansView.jsx line 262 | WhatsApp message icon button (human contact link in grid view) | 24x24 on desktop, 36x36 on mobile | `w-6 h-6 max-sm:w-9 max-sm:h-9 rounded-fu` → Change to min-w-11 min-h-11 all breakpoints, or max-sm:min-w-11 max-sm |
| none | AddDogModal.jsx line 195 | Modal close button (X) in AddDogModal header | 28x28 | `w-7 h-7 flex items-center justify-center` → Change to min-w-11 min-h-11, keep centered with flex; icon remains int |
| low | AddDogModal.jsx line 518 (px-2.5 py-1.5) | Alert/Allergy toggle buttons (e.g. 'Aggressive', 'Allergy') | ~20x20 to 24x20 (height only ~12px padding total) | `px-2.5 py-1.5 rounded-2xl text-[11px] fo` → Increase padding to py-2 (8px each side = 16px total) or use min-h-11, |
| none | AddHumanModal.jsx line 160 | Modal close button (X) in AddHumanModal header | 28x28 | `w-7 h-7 flex items-center justify-center` → Change to min-w-11 min-h-11 (44px) |
| low | AddHumanModal.jsx line 233 | Remove dog button (× close icon on selected dog chip) | 16x16 | `w-4 h-4 flex items-center justify-center` → Change to min-w-8 min-h-8 at minimum (32px), better: w-5 h-5 or min-w- |

### booking-modals (10)
| risk | file | control | est | current → proposed |
|---|---|---|---|---|
| high | BookingStatusBar.jsx line 54, button.py-2.px-0.5.md:px-1 | Status stepper pill (role=radio) - one of 5 booking status buttons in a grid | ~19px height on mobile (8px padding + 11px text), ~4px width at mobile (0.5 on each side) | `py-2 px-0.5 md:px-1 rounded-full text-[1` → min-h-11 min-w-11 md:min-h-auto md:min-w-auto inline-flex items-center |
| low | BookingActions.jsx line 85-97, button onClick setShowDeleteConfirm | Delete booking button (inline-flex with icon + text) | ~18-20px height (12px padding + 12px text), ~35px width with icon and gap | `inline-flex items-center gap-1.5 px-3 py` → py-3 px-4 or min-h-11 min-w-11 with inline-flex items-center justify-c |
| low | DogSearchSection.jsx line 146-160, button.px-2.py-[3px] (add-on chips) | Add-on toggle chips (e.g. 'Bath', 'Toenails') - clickable pills for optional services | ~18-20px height (6px padding + 10px text + border), ~40-50px width varies by addon name | `px-2 py-[3px] rounded-full text-[10px] f` → py-1.5 px-2.5 or min-h-10 min-w-10 inline-flex items-center justify-ce |
| low | DogSearchSection.jsx line 117-124, button onClick onRemoveDog with aria-label | Remove dog button (× symbol) - inline button to remove selected dog from booking | ~18px height (8px padding + ~16px text), ~32px width | `py-1 px-2 rounded-md text-lg text-slate-` → py-2 px-2.5 or min-h-10 inline-flex items-center justify-center |
| low | AvailabilityCalendar.jsx line 72, button onClick prevMonth | Previous month navigation button (< arrow icon) | 30x30 px on all devices | `w-[30px] h-[30px] rounded-md flex items-` → w-11 h-11 or min-w-11 min-h-11 (44px Tailwind size) |
| low | AvailabilityCalendar.jsx line 76, button onClick nextMonth | Next month navigation button (> arrow icon) | 30x30 px on all devices | `w-[30px] h-[30px] rounded-md flex items-` → w-11 h-11 or min-w-11 min-h-11 (44px Tailwind size) |
| low | AvailabilityCalendar.jsx line 140-151, button onClick onSelectDate (calendar date cells) | Calendar date picker buttons - clickable day numbers in 7-column grid | ~50-55px per column in typical 6-column grid on iPhone (container ~280-300px wide minus padding/gap) | `w-full aspect-square rounded-lg text-[13` → min-h-11 (add explicit min-height guarantee) or ensure container width |
| medium | TimeSlotPicker.jsx line 115, button className py-2.5 rounded-control | Time slot picker buttons (e.g. '10:30am', '2:00pm') in auto-fill grid minmax(80px,1fr) | ~20px height on all devices (10px padding top/bottom + ~13px text), 80px minimum width per spec | `py-2.5 rounded-control border-2 text-sm ` → min-h-11 py-3 or py-2.5 min-h-11 to guarantee 44px minimum height |
| low | RescheduleModal.jsx line 143-158, button onClick setSelectedDateStr (day picker) | Reschedule day picker buttons (e.g. 'Mon 11') in grid minmax(105px,1fr) | ~20px height (10px padding + 13px text), 105px minimum width | `py-2.5 px-2 rounded-lg text-[13px] font-` → min-h-11 py-3 or py-2.5 min-h-11 |
| medium | RescheduleModal.jsx line 186-198, button onClick pickSlot (available slots) | Reschedule slot picker buttons (e.g. '10:30') in grid minmax(70px,1fr) | ~18-20px height (8px padding + 13px text), 70px minimum width | `py-2 rounded-lg text-[13px] font-semibol` → min-h-11 py-3 or py-2 min-h-11 |

### other-modals (31)
| risk | file | control | est | current → proposed |
|---|---|---|---|---|
| low | TodoModal.jsx line 56-66 | Close button (×) in modal header | ~28x28 | `w-7 h-7 rounded-md flex items-center jus` → w-10 h-10 min-w-10 min-h-10 |
| low | TodoModal.jsx line 82-87 | Add button (+) in input form | ~32x32 | `w-8 h-8 rounded-lg` → w-10 h-10 min-w-10 min-h-10 |
| medium | TodoModal.jsx line 103-118 | Todo checkbox button | ~16x16 | `w-4 h-4 mt-0.5 rounded border-[1.5px]` → w-6 h-6 mt-1 min-w-6 min-h-6 (plus add padding px-1 py-1 to parent li) |
| low | TodoModal.jsx line 126-134 | Move up arrow button | ~20x20 | `w-5 h-5 rounded` → w-7 h-7 min-w-7 min-h-7 inline-flex items-center justify-center |
| low | TodoModal.jsx line 137-145 | Move down arrow button | ~20x20 | `w-5 h-5 rounded` → w-7 h-7 min-w-7 min-h-7 inline-flex items-center justify-center |
| low | TodoModal.jsx line 147-155 | Delete todo button | ~20x20 | `w-5 h-5 rounded` → w-7 h-7 min-w-7 min-h-7 inline-flex items-center justify-center |
| low | WaitlistModal.jsx line 72-82 | Close button (×) in modal header | ~28x28 | `w-7 h-7 rounded-md flex items-center jus` → w-10 h-10 min-w-10 min-h-10 |
| medium | WaitlistModal.jsx line 146-160 | Remove from waitlist button (text link) | ~20-30 height no padding | `text-[11px] font-bold text-brand-coral b` → Add min-h-10 min-w-10 py-1.5 px-2 to ensure min 44px target |
| low | PhotoUploadModal.jsx line 88-94 | Close button (×) in modal header | ~32x32 | `w-8 h-8 flex items-center justify-center` → w-10 h-10 min-w-10 min-h-10 |
| low | PhotoUploadModal.jsx line 117-128 | Clear preview button (×) | ~28x28 | `w-7 h-7 flex items-center justify-center` → w-9 h-9 min-w-9 min-h-9 |
| low | PhotoGalleryModal.jsx line 123-129 | Close button (×) in modal header | ~32x32 | `w-8 h-8 flex items-center justify-center` → w-10 h-10 min-w-10 min-h-10 |
| low | PhotoLightbox.jsx line 65-70 | Close button (×) at top-right of image | ~32x32 | `w-8 h-8 flex items-center justify-center` → w-10 h-10 min-w-10 min-h-10 |
| low | PhotoLightbox.jsx line 90-96 | Cancel button (inline, text-only) for editing notes | ~18x20 no vertical padding | `text-xs font-semibold text-slate-500 bg-` → py-1.5 px-2 min-h-10 min-w-10 inline-flex items-center |
| low | PhotoLightbox.jsx line 97-104 | Save Notes button (inline, text-only) | ~18x20 no vertical padding | `text-xs font-bold bg-transparent border-` → py-1.5 px-2 min-h-10 min-w-10 inline-flex items-center |
| low | PhotoLightbox.jsx line 121-128 | Delete Photo button (inline, text-only) | ~20x20 no padding | `text-xs font-bold text-brand-coral bg-tr` → py-1.5 px-2 min-h-10 min-w-10 inline-flex items-center |
| low | DatePickerModal.jsx line 56 | Previous month button | ~32x32 | `w-8 h-8 rounded-md flex items-center jus` → w-10 h-10 min-w-10 min-h-10 |
| low | DatePickerModal.jsx line 62 | Next month button | ~32x32 | `w-8 h-8 rounded-md flex items-center jus` → w-10 h-10 min-w-10 min-h-10 |
| low | DatePickerModal.jsx line 67 | Close date picker button (×) | ~32x32 | `w-8 h-8 rounded-md flex items-center jus` → w-10 h-10 min-w-10 min-h-10 |
| low | ConfirmDeleteModal.jsx line 65-75 | Cascade warning checkbox | ~16x16 | `mt-0.5 w-4 h-4 cursor-pointer accent-bra` → w-5 h-5 mt-1 min-w-5 min-h-5 (parent label should have min-h-11 or py- |
| low | ChainBookingModal.jsx line 315-321 | Close button (×) in modal header | ~36x36 | `w-9 h-9 flex items-center justify-center` → w-11 h-11 min-w-11 min-h-11 |
| low | ChainBookingModal.jsx line 483-489 | Remove booking (×) button from chain | ~28x28 | `w-7 h-7 rounded-lg border-none bg-brand-` → w-9 h-9 min-w-9 min-h-9 flex items-center justify-center |
| low | RecurringBookingModal.jsx line 131-135 | Close button in footer | ~38-40 height (py-2.5=10px) | `px-5 py-2.5 rounded-control border-[1.5p` → py-3 px-5 min-h-11 (to reach 44px minimum height) |
| low | RecurringBookingModal.jsx line 138-144 | Cancel Future button in footer | ~38-40 height (py-2.5=10px) | `px-5 py-2.5 rounded-control border-none` → py-3 px-5 min-h-11 |
| low | SendReminderModal.jsx line 197-204 | Close button (×) in modal header | ~28x28 | `w-7 h-7 rounded-full hover:bg-slate-100 ` → w-10 h-10 min-w-10 min-h-10 |
| low | SendReminderModal.jsx line 65-84 | Channel pill buttons (WhatsApp/SMS/Email) | ~32 height (h-8=32px), but minimal width on short text | `inline-flex items-center h-8 px-4 rounde` → h-10 min-h-10 min-w-10 px-4 |
| low | SmsComposer.jsx line 49-56 | Send SMS button | ~36x36 (h-9=36px) | `inline-flex items-center h-9 px-4 rounde` → h-11 min-h-11 min-w-11 px-4 inline-flex items-center justify-center |
| low | EmailComposer.jsx line 52-59 | Send Email button | ~36x36 (h-9=36px) | `inline-flex items-center h-9 px-4 rounde` → h-11 min-h-11 min-w-11 px-4 inline-flex items-center justify-center |
| low | WhatsAppComposer.jsx line 42-56 | Send WhatsApp button | ~36x36 (h-9=36px) | `inline-flex items-center h-9 px-4 rounde` → h-11 min-h-11 min-w-11 px-4 inline-flex items-center justify-center |
| low | CollectionNoticeModal.jsx line 215-222 | Close button (×) in modal header | ~28x28 | `w-7 h-7 rounded-full hover:bg-slate-100 ` → w-10 h-10 min-w-10 min-h-10 |
| low | CollectionNoticeModal.jsx line 285-300 | Send button (per recipient) | ~32x32 (h-8=32px) | `shrink-0 inline-flex items-center h-8 px` → h-10 min-h-10 min-w-10 inline-flex items-center justify-center px-4 |
| low | CollectionNoticeModal.jsx line 309-315 | Done/Close button in footer | ~36x36 (h-9=36px) | `inline-flex items-center h-9 px-4 rounde` → h-11 min-h-11 min-w-11 px-4 |

### reports (2)
| risk | file | control | est | current → proposed |
|---|---|---|---|---|
| low | ReportsView.jsx line 84 | Period toggle button ("7 days", "30 days", "90 days") | ~50px (width) × 19px (height, mobile) | `px-2.5 sm:px-3 py-1 sm:py-1.5 text-capti` → Add min-h-11 min-w-11 inline-flex items-center justify-center to ensur |
| medium | RevenueTrend.jsx line 52 | Revenue chart bar (tabIndex={0}, focusable) | ~30-50px (width, variable) × ~2-80px (height, variable) | `w-full rounded-t-sm bg-brand-teal/80 (dy` → Add min-h-11 to the bar div to ensure minimum touch height of 44px |

### settings (10)
| risk | file | control | est | current → proposed |
|---|---|---|---|---|
| low | shared.jsx line 64-82, Toggle component | Toggle switch button (role=switch) | ~44x24 | `w-11 h-6 p-0` → Add min-h-11 to ensure minimum 44px height (currently only 24px); chan |
| low | HoursSettings.jsx line 88-99, close-day button (X icon) | Icon button to toggle day closed state | ~32x32 | `w-8 h-8 flex items-center justify-center` → Add min-h-11 min-w-11 to expand hit area to 44x44 without enlarging th |
| low | HoursSettings.jsx line 115-123, remove-closure button (×) | Icon button to remove a closure | ~18x18 (text-sm × glyph, no padding) | `opacity-60 text-sm bg-transparent border` → Add p-1.5 min-h-11 min-w-11 inline-flex items-center justify-center to |
| medium | CalendarSettings.jsx line 126-129, regenerate button | Text-only button (secondary action) | ~auto width by text, no explicit height or padding | `text-xs cursor-pointer hover:text-slate-` → Add py-2 px-3 min-h-11 to ensure minimum height and padding for touch  |
| low | CapacitySettings.jsx line 81-92, remove-slot button (time pill with ×) | Dismissible pill/chip button (inline-flex) | ~variable width × 20 (py-[5px]=10px height, needs vertical padding check) | `inline-flex items-center gap-1 bg-brand-` → Change py-[5px] to py-2 to reach py-2=8px*2=16px, then add min-h-11 in |
| low | CapacitySettings.jsx line 102-108, add-slot button | Button to add a large dog slot (+ Add) | ~55×20 (py-[5px]=10px height too short) | `bg-slate-50 border-[1.5px] border-dashed` → Change py-[5px] to py-2.5 to reach ~20px, and add min-h-11 min-w-11 to |
| medium | PricingSettings.jsx line 104-116, delete-service button (× icon) | Icon button in table row to delete service | ~32x32 | `w-8 h-8 rounded-lg border border-slate-2` → Add min-h-11 min-w-11 to expand hit area to 44x44 without enlarging gl |
| low | HoursSettings.jsx line 144-150, +Add closure button | Button with dashed border to add a closure date | ~60×28 (py-1.5=6px×2=12px height + padding, sub-44px) | `border-[1.5px] border-dashed border-slat` → Change py-1.5 to py-2.5 or add min-h-11 to ensure 44px minimum height |
| low | PricingSettings.jsx line 130-136, +Add service button | Button with dashed border to add a new service | ~80×28 (py-2=4px×2=8px height + text, marginal) | `border-[1.5px] border-dashed border-slat` → Change py-2 to py-2.5 or add min-h-11 inline-flex items-center justify |
| low | NotificationSettings.jsx line 76-93, channel toggle badge (WhatsApp/Email/SMS pill) | Clickable span (pill badge) to toggle notification channel | ~70×22 (px-2.5=10px, py-1=4px, text-micro is small font) | `text-micro font-bold px-2.5 py-1 rounded` → Add min-h-11 min-w-11 or change to button element with inline-flex ite |

### inbox (11)
| risk | file | control | est | current → proposed |
|---|---|---|---|---|
| none | InboxView.jsx line 678-681 | Back to inbox button (mobile only) | 36x36 | `md:hidden text-brand-purple text-[18px] ` → min-h-11 min-w-11 inline-flex items-center justify-center |
| none | CustomerContextPanel.jsx line 62-71 | Close customer context (× button, mobile/slide-over only) | 36x36 | `w-9 h-9 rounded-full text-slate-500 hove` → min-h-11 min-w-11 inline-flex items-center justify-center |
| medium | TrustedHumansChips.jsx line 22-31 | Trusted human contact pill (clickable button to open profile) | ~16-18x20 | `inline-flex items-center px-2 py-0.5 rou` → min-h-11 min-w-11 py-2 px-3 inline-flex items-center justify-center |
| low | DogSummaryCard.jsx line 34-39 | Dog summary card button (to open full dog profile) | ~40 height (py-2.5 = 10px × 2 top+bottom + text height) | `w-full text-left rounded-2xl border bord` → min-h-11 py-3 inline-flex items-center |
| none | InboxFilterChip.jsx line 48-68 | Filter chip (All, Awaiting reply, Closing soon, etc.) | 36x36 (h-9 = 36px) | `inline-flex shrink-0 items-center gap-1.` → h-11 (no change needed, already meets 44px in height) |
| low | MarkCompleteButton.jsx line 71-77 | Mark complete / Reopen button | 32x32 (h-8 = 32px) | `inline-flex items-center gap-1 h-8 px-3 ` → h-10 or h-11 px-4 py-2 (expand to at least 40-44px) |
| none | BookingActionPanel.jsx line 174, 181, 191, 198 | Booking action buttons (Confirm reject, Cancel, Add to diary, Reject) | 32x32 (h-8 = 32px) | `inline-flex items-center h-8 px-3 rounde` → h-10 px-4 py-2 inline-flex items-center justify-center |
| none | ComposePanel.jsx line 92-98 | Send button in compose box | ~40x40 (self-stretch with 2-row textarea, should be OK but verify) | `self-stretch inline-flex items-center px` → min-h-11 inline-flex items-center justify-center (if rendered smaller) |
| none | GenerateReplyButton.jsx line 42-52 | Generate reply button (AI on demand) | 36x36 (h-9 = 36px) | `inline-flex items-center gap-2 h-9 px-4 ` → h-11 px-4 inline-flex items-center justify-center |
| none | ConversationListItem.jsx line 87-91 | Status indicator dot (red/amber dot for needs-review, pending-draft, pending-booking) | 8x8 (w-2 h-2 = 8px each, not interactive) | `inline-block w-2 h-2 rounded-full` → Not an interactive control - purely decorative aria-hidden indicator |
| none | LastBookingChip.jsx line 21-43 | Last booking chip (non-interactive display) | ~32x28 (not clickable, informational only) | `inline-flex items-center gap-1.5 px-2 py` → Not an interactive control - display only |

### layout-shared (10)
| risk | file | control | est | current → proposed |
|---|---|---|---|---|
| low | ErrorBanner.jsx line 36 | Dismiss error close button (×) | 28x28 | `w-7 h-7 rounded-md flex items-center jus` → min-h-11 min-w-11 inline-flex items-center justify-center (or w-11 h-1 |
| low | ErrorBanner.jsx line 26 | Retry button in error banner | 28x28 (height only) | `h-7 px-3 flex items-center rounded-md` → min-h-11 py-2 (increase vertical padding and min-height to 44px) |
| low | AppToolbar.jsx line 322 | Settings icon button (mobile top bar) | 36x36 | `w-9 h-9 rounded-full flex items-center j` → w-11 h-11 (expand from 36px to 44px) |
| low | AppToolbar.jsx line 339 | Account menu icon button (mobile top bar, right side) | 36x36 | `w-9 h-9 rounded-full flex items-center j` → w-11 h-11 (expand from 36px to 44px) |
| low | AppToolbar.jsx line 209 | Help menu icon button (desktop header, keyboard shortcuts) | 40x40 | `w-10 h-10 rounded-xl flex items-center j` → w-11 h-11 min-h-11 min-w-11 (expand from 40px to 44px) |
| low | AppToolbar.jsx line 243 | Account menu icon button (desktop header, right side) | 40x40 | `w-10 h-10 rounded-xl flex items-center j` → w-11 h-11 min-h-11 min-w-11 (expand from 40px to 44px) |
| low | WeekCalendarView.jsx line 180 | Previous day navigation button (mobile/tablet, left chevron) | 36x36 | `w-9 h-9 rounded-full flex items-center j` → w-11 h-11 min-h-11 min-w-11 (expand from 36px to 44px) |
| low | WeekCalendarView.jsx line 198 | Next day navigation button (mobile/tablet, right chevron) | 36x36 | `w-9 h-9 rounded-full flex items-center j` → w-11 h-11 min-h-11 min-w-11 (expand from 36px to 44px) |
| medium | HeaderIconButton.jsx line 10 | Modal header icon button (edit/overflow/close/gallery) - desktop size | 32x32 (on sm and above); correctly 44x44 on mobile via max-sm:w-11 | `w-8 h-8 max-sm:w-11 max-sm:h-11` → Remove w-8 h-8 entirely; use min-w-11 min-h-11 w-11 h-11 universally ( |
| none | PanelShell.jsx line 48 | Icon chip indicator (top-right corner accent, non-clickable but part of visual hierarchy) | 24x24 | `w-6 h-6 rounded-full flex items-center j` → This is decorative (aria-hidden), but if made interactive in future: m |
