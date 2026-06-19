# Code-audit full digest

Summary: {"dimensions":14,"candidates":184,"confirmed":159,"rejected":25,"bySeverity":{"Critical":3,"Major":71,"Minor":74,"Polish":11}}


# === Critical ===

[0] [Critical] [Contrast / WCAG AA] Slate-400 placeholder text is nearly invisible on white input backgrounds  (Visual; All; QUICK-WIN)
  desc: Placeholder text in form inputs uses text-slate-400 (#CBD5E1) on white backgrounds, resulting in a contrast ratio of only 1.47:1, far below the 4.5:1 minimum for WCAG AA. This occurs in the login form and any other input field using the fieldInputClass style. Makes form hints and labels unreadable.
  evidence: src/components/auth/LoginPage.jsx:31 (confirmed); also src/components/modals/TodoModal.jsx:80
  fix: Change placeholder text color from text-slate-400 to text-slate-600 or text-slate-500 (#64748B or darker). This lifts the ratio to 4.88:1 or better. Or use --color-ink-muted token (#64748B) which is documented as 'accessible muted grey — slate-500 ≈ 4.76:1 on white'.
  impact: Critical for form usability and accessibility. Staff cannot read login hints or form labels without zooming or inspecting elements. Violates WCAG AA SC 1.4.3.

[1] [Critical] [Contrast / WCAG AA] Disabled button text (slate-400 on slate-200) is unreadable  (Visual; All; QUICK-WIN)
  desc: Disabled buttons render slate-400 text (#CBD5E1) on slate-200 backgrounds (#E2E8F0), producing a contrast ratio of 1.20:1—a critical accessibility failure. This affects the primary, danger, and ghost button variants when disabled, making it impossible to distinguish text content.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/ui/Button.jsx:29 (primary: #e2e8f0 bg, #cbd5e1 text = 1.20:1), :33 (danger: identical), :37 (ghost: #ffffff bg, #cbd5e1 text = 1.48:1). Also /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/index.css:482 (.btn:disabled uses same palette).
  fix: Use text-slate-600 (#475569) or text-slate-700 (#334155) for disabled text instead of slate-400. This achieves ~5.0:1 or higher. Alternatively, keep slate-400 but change disabled background to slate-100 (#F3F4F6) to lift contrast. Recommend: 'disabled:bg-slate-100 disabled:text-slate-500'.
  impact: Disabled buttons are completely illegible. Staff cannot read button labels to understand what will be enabled. Major usability barrier. Violates WCAG AA SC 1.4.3.

[2] [Critical] [Side utility panels] Right-rail panel unreachable on mobile below md breakpoint  (Functionality; iPhone)
  desc: On mobile (below 768px/md breakpoint), the DashboardShell hides the right column entirely (hidden xl:block on left sidebar, then 3-col grid), and the RightWorkflowSidebar with its four workflow cards (inbox, reminders, waitlist, todos) disappears from the layout. Only the main content (booking grid) is visible. Staff cannot access urgent alerts (attention/active tone cards) or quick actions from the mobile view.
  evidence: src/components/dashboard/DashboardShell.jsx:36 (grid-cols-1 xl:grid-cols-[...]), src/components/dashboard/RightWorkflowSidebar.jsx:78-87 (DeliveryFailuresCard only rendered here), src/components/dashboard/UtilityTabs.jsx:8-13 (only 4 tabs defined, no delivery failures), src/components/layout/WeekCalendarView.jsx:258-283 (UtilityTabs shown on xl:hidden, never receives failure data)
  fix: On md+ (768px), render the RightWorkflowSidebar as a horizontal scroll panel above the main content or in a bottom sheet. Below md, collapse all cards into a single compact 'Workflow status' button with a popover showing calm-row-style chip summary (matching RightRailCalmRow). Ensure attention-tone cards (delivery failures, inbox >2h old) always surface in a persistent toast or a fixed status bar if out of view.
  impact: Mobile users see urgent alerts (attention tone) without navigating away from the dashboard. Attention cards (e.g. 2+ hours unanswered inbox) no longer go unseen on small screens.


# === Major ===

[3] [Major] [Accessibility semantics] Missing aria-label on role="button" in BookingHeader  (Accessibility; All; QUICK-WIN)
  desc: The dog name span at line 111-124 in BookingHeader.jsx uses role="button" but lacks an aria-label. Screen reader users will only hear 'button' with no indication of the action (opening the dog profile). The element is keyboard-accessible (Enter/Space handled), but the purpose is ambiguous.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/modals/booking-detail/BookingHeader.jsx:111-124. Span has role="button" with onClick/onKeyDown but no aria-label.
  fix: Add aria-label="Open dog profile" to the span at line 111.
  impact: Screen reader users will now understand the button's purpose instead of just hearing 'button'.

[4] [Major] [Accessibility semantics] Inconsistent dialog role usage for non-modal popovers  (Accessibility; All)
  desc: The AlertsPopover (BookingCardNew.jsx:134) and keyboard shortcuts menu (AppToolbar.jsx:220) both use role="dialog" but are non-modal popovers. They don't trap focus, don't lock the body scroll, and don't require AccessibleModal. Per ARIA spec, 'dialog' should only be used for true modal dialogs. These should use role="region" with aria-label or be treated as regular styled divs with aria-label, not role="dialog".
  evidence: BookingCardNew.jsx:134 (AlertsPopover div) and AppToolbar.jsx:220 (Shortcuts menu div) both incorrectly use role="dialog" without focus trapping, body scroll locking, or aria-modal="true"
  fix: Remove role="dialog" and replace with role="region" aria-label="...", or drop role entirely and rely on aria-label if they're just styled containers.
  impact: Assistive technologies will correctly classify these as tooltips/popovers rather than blocking dialogs.

[5] [Major] [Accessibility semantics] Drag-and-drop on bookings cards lacks keyboard alternative  (Accessibility; All)
  desc: The SlotGrid component (SlotGrid.jsx:14-290) uses HTML5 drag-and-drop (onDragStart, onDrop, etc.) to move bookings between time slots. There is no keyboard shortcut or context-menu alternative for keyboard-only users. They cannot reorder bookings without a mouse/touch device.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/booking/SlotGrid.jsx:252-254 (draggable prop and onDragStart/onDragEnd). useSlotDragAndDrop.ts only handles pointer drag events, no keyboard path.
  fix: Implement keyboard support via a 'Move' context menu on each booking card (right-click or a button) that opens a slot picker, or add a keyboard shortcut (e.g., Shift+Arrow) to move the focused card.
  impact: Keyboard-only and screen-reader users can now move bookings between slots.

[6] [Major] [Accessibility semantics] Inline status picker (listbox) needs arrow-key navigation  (Accessibility; All)
  desc: BookingCardNew.jsx (line 421-426) creates an inline status picker with role="listbox" and role="option" buttons. The listbox container has onKeyDown for Escape only (line 424). Screen reader users cannot use ArrowUp/ArrowDown to navigate the options. Per ARIA listbox pattern, arrow keys should move selection and announce the highlighted option.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/booking/BookingCardNew.jsx:420-426 (listbox with Escape-only onKeyDown); lines 442-444 (option buttons with no arrow-key handling); contrast with /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/shared/BreedCombobox.jsx:77-131 (proper arrow-key handling pattern) and 163-193 (aria-activedescendant pattern)"
  fix: Add onKeyDown handler to the listbox div to detect ArrowUp/ArrowDown/Home/End and update which role="option" is selected/focused, mirroring the BreedCombobox pattern (line 77-130).
  impact: Screen reader and keyboard-only users can navigate inline status options with arrow keys, matching standard ARIA listbox behavior.

[7] [Major] [Accessibility semantics] BlockedSeatCell lacks descriptive hint about hover state change  (Accessibility; All; QUICK-WIN)
  desc: BlockedSeatCell.jsx (line 20-22) shows different text on hover ('Blocked' vs 'Unblock'). Screen reader users won't know the text changes on hover since they can't see it. The aria-label only says 'Unblock this seat', but there's no hint that the cell is clickable or what hovering does.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/booking/BlockedSeatCell.jsx:9-22. aria-label at line 9 says only "Unblock this seat" without current state; visual text at lines 20-22 toggles between "Blocked" (shown by default) and "Unblock" (shown on group-hover). Screen readers read only the static aria-label and cannot perceive the CSS-based text toggle or hover state change.
  fix: Add aria-label="Blocked seat, click to unblock" instead of role="button" aria-label="Unblock this seat" to clarify the current state and action.
  impact: Screen reader users understand both the current state (blocked) and the action (unblock).

[8] [Major] [Appointment detail modal] Status bar stepper uses radio buttons but doesn't announce state changes to screen readers  (Accessibility; All; QUICK-WIN)
  desc: BookingStatusBar uses a radiogroup with role='radio' and aria-checked (L11-26), which is correct semantic HTML. However, when staff click a status button, the component updates the booking and shows a toast with an undo callback, but the radiogroup itself does not have an aria-live region or equivalent to announce the status change to screen reader users. A sighted user sees the button highlight change instantly; a screen reader user hears nothing until they navigate back to the radiogroup.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/modals/booking-detail/BookingStatusBar.jsx:10-26 (radiogroup without aria-live; toast announcement is in ToastContext.jsx:96)
  fix: Wrap the radiogroup in a container with role='region' and aria-live='polite' aria-label='Booking status updates', or add an invisible aria-live div that announces status changes: 'Status changed to [new status]' immediately after the update succeeds.
  impact: Screen reader users gain parity with sighted staff in knowing when a status change has taken effect, improving accessibility compliance (WCAG 2.1 Level A for dynamic content).

[9] [Major] [Appointment detail modal] Service select dropdown in header lacks visual focus indicator on mobile  (Accessibility; iPhone/iPad; QUICK-WIN)
  desc: When editing, BookingHeader renders a service select at L158-181. The select uses className with border-brand-teal on focus (L173: `focus:border-brand-teal`), but the .bm-fields iOS zoom fix (index.css L292-297) overrides font-size to 16px on touch, which may shift the focus ring or make it harder to see on narrow screens. Additionally, there's no explicit focus-visible ring like the button alternatives use (see BookingActions.jsx L64: focus-visible:ring-2), so keyboard users may miss the focus state on desktop.
  evidence: BookingHeader.jsx L173 (select className with 'outline-none' and 'focus:border-brand-teal' only, no focus-visible:ring); BookingActions.jsx L64 (shows correct focus-visible:ring implementation pattern on buttons); index.css L292-297 (.bm-fields font-size override on touch); index.css L302-304 (global :focus-visible rule that is suppressed).
  fix: Add focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-1 to the select className. Test on iOS Safari to ensure the ring is visible after the 16px zoom, and that the ring doesn't cause the modal to overflow.
  impact: Keyboard users (and voice control users) gain a clearer visual affordance for focus state, improving keyboard navigation and meeting WCAG 2.1 Level AA focus-visible requirements.

[10] [Major] [Appointment detail modal] Reminder card action buttons lack touch-target sizing on mobile  (Accessibility; iPhone/iPad; QUICK-WIN)
  desc: ReminderCard (L136-158) renders 'Send reminder' and 'Message [name]' buttons with px-3.5 py-2, which at 13px text results in a ~40px tall button. On touch devices, Apple and Android guidelines recommend 44×44px minimum touch targets. The buttons meet the height requirement, but they're floated flex gap-2 in a row, so on narrow screens they may compress horizontally, making side-by-side tap targets too close together (less than the recommended 8–16px spacing).
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/modals/booking-detail/ReminderCard.jsx:135 (container with flex flex-wrap gap-2) and L140, L153 (buttons with px-3.5 py-2). Button height: 8px padding-top + 18px line-height + 8px padding-bottom = 34px (below 44×44px minimum). Gap between buttons: 8px (at lower threshold of accessibility guidance).
  fix: Add max-sm:flex-col to the button container (L135: className='flex flex-wrap gap-2 mt-3 max-sm:flex-col') to stack buttons vertically on mobile. Optionally increase horizontal padding on touch: max-sm:w-full max-sm:justify-center for each button to ensure they're always full-width and easily tappable.
  impact: Improves touch usability for staff on mobile/tablet devices, reducing mis-taps and improving the experience for staff on the go.

[11] [Major] [Appointment detail modal] Autosave status indicator is too subtle and position-dependent  (Functionality; All; QUICK-WIN)
  desc: The autosave status ('Saving...' / 'Saved') appears only in the footer at the top-right of the Save/Cancel button row (BookingActions.jsx L30-33). On small devices or when the footer is partially off-screen, this indicator can be missed. The text is only 11px (text-[11px]), uses muted slate-400 colour, and fades to 'idle' after 2 seconds (useAutosave.js L34), so users may not notice that their edits are being persisted automatically, especially on slower networks where the 'Saving...' state lasts longer.
  evidence: BookingActions.jsx L30-33 (autosave status display); useAutosave.js L13-57 (status: 'idle' | 'saving' | 'saved', with 2s fade-to-idle); BookingDetailModal.jsx L243-247 (autosave enabled with 2s delay). No audible or haptic feedback, no persistent visual indicator.
  fix: Move the autosave status to a sticky, persistent location (e.g. a small badge in the footer or modal header) with higher contrast (text-[12px] font-semibold text-slate-700 or colour-coded). Consider adding a small animated checkmark icon or pulse effect when 'Saved' state is reached, and keep the indicator visible for at least 3–4 seconds instead of 2.
  impact: Increases staff confidence that edits are being persisted, reducing repeat-save attempts and support queries about data loss.

[12] [Major] [Appointment detail modal] No feedback when deleting a booking—modal closes silently before delete completes  (Functionality; All)
  desc: When staff click the Delete button and confirm in ConfirmDeleteModal, the modal is instructed to close immediately (BookingDetailModal.jsx L439: onClose is passed to the overlay handler; BookingDetailOverlays.jsx L159 calls onClose() inside the async onRemove handler without awaiting it). The ConfirmDeleteModal itself shows 'Deleting...' on the button (ConfirmDeleteModal.jsx L93), but if the delete operation is slow (e.g. cascading delete of recurring bookings), the modal closes before completion and staff see no final confirmation. If the delete fails server-side, staff are left with no error message visible in the booking detail context.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/modals/booking-detail/BookingActions.jsx L158-165 (modal closes unconditionally at L160, error check is ineffective at L161); /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/supabase/hooks/useBookings.js L288 (removeBooking returns { success: false, error } on failure); /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/hooks/useOfflineState.js L200 (offlineHandleRemove returns true, creating contract mismatch)
  fix: Await onRemove completion before calling onClose. Keep the ConfirmDeleteModal open until delete succeeds or fails. If delete fails, show an error message in the modal and give staff the option to retry or cancel. Example: `if (result !== false) { onClose(); } else { showError('Delete failed'); }`.
  impact: Prevents silent failures and gives staff visibility into delete completion, reducing support queries about 'did it actually delete?' and improving error recovery.

[13] [Major] [Appointment detail modal] Delivery failure card phone number input lacks clear validation feedback  (Functionality; All; QUICK-WIN)
  desc: DeliveryFailureCard (L141-179) shows an inline phone number editor. When staff enter an invalid number (e.g. 'abc' or a short number), the Save button is immediately disabled and a red error message appears below (L166: role='alert'). However, the input itself doesn't have a visual error state (e.g. red border, background tint) to signal validation failure at a glance. Additionally, the placeholder text 'e.g. 07700 900123' uses the US-style format, which may confuse UK staff expecting different formatting (UK numbers are typically written 07700 900123 with a space, not 077009001123).
  evidence: DeliveryFailureCard.jsx L144-155 (input className lacks conditional error styling); L166-168 (error message textonly, role='alert'); phone.js L159-170 (formatPhoneForDisplay confirms UK format is "07700 900123" with space, correct not US-style)
  fix: Add conditional className to the input: `border-red-300 bg-red-50` when phoneError is truthy. Keep the error message below. Also, update the placeholder to '07700 900 123' (with spaces) to match UK formatting conventions, and add a small helper text below the placeholder: '(Enter UK mobile, e.g. 07700 900 123)'.
  impact: Reduces input errors and provides clearer guidance for phone number entry, especially for users unfamiliar with the normalisation function's expected format.

[14] [Major] [Appointment detail modal] Edit mode persists across modal re-open if component is cached  (Functionality; All)
  desc: BookingDetailModal uses useBookingEditState to manage isEditing state (L69-85). However, if the same BookingDetailModal component instance is reused across multiple bookings (e.g. staff open booking A, close it, then open booking B in the same modal), the isEditing state may not reset properly. The useBookingEditState hook initializes editData based on the current booking, but the component does not explicitly call resetEditState or setIsEditing(false) when a different booking is opened. If staff are in edit mode for booking A and then click on booking B in the grid without closing, they may be left in edit mode for booking B without realizing it.
  evidence: BookingDetailModal.jsx L45-62 (booking passed as prop); useBookingEditState initializes from booking but no dependency on booking.id in an effect to reset state; L274 (onEnterEdit calls resetEditState manually when staff clicks Edit, but not on prop change); no useEffect that monitors booking.id changes and resets isEditing.
  fix: Add a useEffect in BookingDetailModal that watches booking.id and calls resetEditState() + setIsEditing(false) when the booking changes. Example: `useEffect(() => { resetEditState(); setIsEditing(false); }, [booking.id, resetEditState, setIsEditing]);`
  impact: Prevents staff from accidentally editing the wrong booking or losing unsaved changes when switching between bookings, improving data integrity.

[15] [Major] [Appointment detail modal] Modal width is fixed at 480px on mobile, causing overflow on small phones  (Layout; iPhone; QUICK-WIN)
  desc: BookingDetailModal sets widthClass='w-[min(480px,95vw)]' (L254), which on desktop ensures a responsive max but on phones below 505px width (480px + 5vw margin buffer), the modal scales down to 95vw with insufficient internal padding adjustment. The header (BookingHeader.jsx L92: px-5 pt-5 pb-4) and body (BookingDetailModal.jsx L257: px-5) use fixed padding, so on an iPhone SE (375px width) or older Android devices (320px width), the content becomes cramped and text may wrap awkwardly. The footer actions (BookingActions.jsx L59: flex gap-2) display two buttons side-by-side in a narrow space, causing text truncation.
  evidence: BookingDetailModal.jsx L254 (w-[min(480px,95vw)] is unconditional, not prefixed with max-sm: so it applies on all viewport sizes); BookingHeader.jsx L92 (px-5 has no max-sm:px-3 reduction); BookingDetailModal.jsx L257 (bodyClassName px-5 has no responsive reduction); BookingActions.jsx L59 (flex gap-2 has no max-sm:flex-col for mobile stacking); ModalShell.jsx L37 (max-sm:w-full is present but overridden by earlier widthClass constraint)
  fix: Add max-sm:gap-1 and max-[400px]:flex-col to BookingActions button container. Reduce header/body padding on narrow screens: add max-[400px]:px-3 to BookingHeader header className and BookingDetailModal bodyClassName. Alternatively, change widthClass to 'w-[min(480px,93vw)]' to allow more breathing room, or add a mobile-specific widthClass prop that uses a narrower constraint below 500px.
  impact: Improves usability on small phones by preventing text truncation and button overlap, reducing misclicks and improving readability of critical information (dog name, time, price, payment status).

[16] [Major] [Appointment detail modal] Slot selection uses ambiguous visual states for over-capacity slots  (Visual; All)
  desc: In AppointmentDetailsCard edit mode, the slot grid (L59-116) renders over-capacity slots with yellow background (#FFFBEB) and amber border (#F59E0B) when `isOverride` is true. The text label reads 'over' in a tiny 9px font below the time. However, the distinction between a regular slot (white, enabled), an over-capacity slot (yellow, clickable but needing override), and a staff-opened slot (size-theme light, enabled) is unclear. Additionally, the 'over' text is positioned below the slot time with a smaller font, which screen readers will announce but may be hard to visually parse at a glance, especially for users with low vision.
  evidence: No correction needed; evidence file:line references are accurate.
  fix: Make the over-capacity state more explicit: (1) Use a filled amber/orange background instead of pale yellow, with white text for better contrast; (2) Render a small warning icon (e.g. AlertTriangle) next to 'over' in the slot; (3) Add aria-label={`${slot}, over capacity, click to override`} to all override slots so screen readers announce the constraint; (4) In view mode (non-editing), show a note above the slot grid: 'Availability shown below. Amber slots are over capacity but can be overridden when saving.'
  impact: Reduces misclicks on over-capacity slots and makes the override affordance clearer to all users, including those with colour blindness or using assistive technology.

[17] [Major] [Appointment detail modal] Cancel & Delete button row is ambiguously ordered for destructive action  (Visual; All; QUICK-WIN)
  desc: BookingActions footer (L70-97) displays Reschedule and Cancel buttons on the first row (L60-83), then Delete below in a centered, tertiary-styled button (L85-97). The Delete button uses text-slate-400 initially, then hover:text-rose-600, making it low-prominence and easily overlooked. For staff moving quickly through the interface, the Delete button's placement and subtle styling may cause confusion about whether it's a primary or secondary action. Best practice is to keep destructive actions either clearly grouped and warned, or kept separate from neutral actions.
  evidence: File:line is accurate. The actual path is /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/modals/booking-detail/BookingActions.jsx (not just BookingActions.jsx as stated in finding).
  fix: Move the Delete button to the same row as Cancel, aligned to the right, and apply the same danger styling as the Cancel button (red border, red text, red hover background). Alternatively, keep Delete below but style it consistently with a red border and red text to signal danger. Ensure the button text is explicit: 'Delete permanently' or 'Delete booking' (not just 'Delete').
  impact: Clarifies destructive intent and groups similar-priority actions, reducing accidental clicks and improving visual hierarchy.

[18] [Major] [Appointment detail modal] No visual distinction between 'saved' price and 'calculated' price during edit  (Visual; All; QUICK-WIN)
  desc: ServicesAddonsCard in edit mode (L43-77) allows staff to edit the custom base price with a number input (L71). However, there's no visual indication of whether the price shown is the default for the size/service (e.g. 'Full Groom, Large = £60') or a custom override set on the dog. If a dog has a custom price of £55, staff see that value and may assume it's the standard rate, potentially confusing pricing logic later.
  evidence: ""
  fix: Add a small help text or icon next to the Base Price label in edit mode: 'Custom price' (with a small info icon) if the dog has a customPrice set, otherwise 'Standard price' in grey text. This signals to staff whether they're viewing a standard or overridden rate.
  impact: Reduces pricing confusion and helps staff make informed decisions about discounts or custom rates.

[19] [Major] [Bookings / daily schedule] Empty slot rows have reduced contrast and discover ability  (Accessibility; All; QUICK-WIN)
  desc: Empty time-slot rows (no bookings, not 'Now') fade to opacity-70 on hover, then return to opacity-100. This creates a fragile discoverability pattern: staff must hover to see the full-brightness row, risking they'll miss the row or the +Book/Block seats entirely. The opacity change is particularly problematic for users on touchscreen devices (iPad, iPhone) who cannot hover, and it violates WCAG 2.1 SC 1.4.11 (non-text contrast) for the dashed border and +Book button.
  evidence: src/components/booking/SlotGrid.jsx:220 — `!hasBooking && !isNow ? "opacity-70 hover:opacity-100 transition-opacity" : ""` dims empty rows by 30% by default.
  fix: Remove opacity-70 from empty rows entirely, or replace with a subtle background tint (e.g., bg-slate-50/50) so all slot rows maintain full contrast. Keep the hover state for visual feedback but baseline contrast must meet WCAG AA (4.5:1 for small text, 3:1 for large).
  impact: Improves task completion rate for staff booking appointments; removes friction for touchscreen users; meets WCAG 2.1 SC 1.4.11.

[20] [Major] [Bookings / daily schedule] DayTab past-date styling lacks semantic colour contrast  (Accessibility; All; QUICK-WIN)
  desc: Past dates in the calendar-strip pills use bg-slate-200 with text-slate-500. This pair (slate-200 on white bg is ~1:1 contrast; slate-500 is ~2.1:1 on slate-200) creates poor discoverability for staff scanning the week. The 'grey = done' convention helps, but the contrast is still below AA for the text alone. Users with color-blindness cannot distinguish past vs. future without reading the text carefully.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/layout/DayTab.jsx:18 — `if (isPast) return "bg-slate-200 text-slate-500";` creates 3.86:1 contrast (slate-500 #64748B on slate-200 #E2E8F0), which meets WCAG AA for bold/large text at sm breakpoint (3:1 minimum) but fails for normal text at base+ (4.5:1 minimum). Desktop users see 16px normal text, triggering WCAG AA failure.
  fix: Use text-slate-600 or text-slate-700 instead of text-slate-500 to reach 3:1+ contrast. Or use a distinct 'past' indicator (e.g., a strike-through or diagonal pattern) to support color-blind staff.
  impact: Improves readability of the date strip for all users; supports users with color-blindness or low vision.

[21] [Major] [Bookings / daily schedule] Status inline picker doesn't announce selected status to screen readers  (Accessibility; All; QUICK-WIN)
  desc: When the status picker opens, the listbox role and role='option' attributes are present, but the currently-selected option is only marked with a ring-2 visual indicator. Screen readers may announce 'option, Booked, selected' but the visual ring doesn't have a corresponding aria-current or aria-live region, so the initial context is lost if staff tab away and back. On a 5-option picker, this is a notable friction point.
  evidence: src/components/booking/BookingCardNew.jsx:421 `role="listbox" aria-label="Set booking status"` + 435-436 `role="option" aria-selected={isCurrent}`. The selected option gets a ring but no aria-current attribute, and there's no aria-live region announcing the current selection when the picker opens.
  fix: Add `aria-current="true"` to the currently-selected option in addition to `aria-selected`. Wrap the listbox in an aria-live region (aria-live='polite' aria-atomic='true') so screen readers announce the current status when the picker opens.
  impact: Enables blind/low-vision staff to use the status picker independently; improves confidence when changing booking status.

[22] [Major] [Bookings / daily schedule] Size dot uses colour alone in booking card; letter is too small  (Accessibility; All)
  desc: BookingCardNew places a 3×3px size dot (with a single letter S/M/L) to signal dog size. While the SizeDot component in isolation (12px dim) includes a readable letter, in the booking card the dot is hardcoded to `w-3 h-3` (12px by default). At 12px, the font size becomes ~8px (65% of 12), making the letter illegible on most phones. Staff rely entirely on colour (yellow/teal/coral), violating WCAG 2.1 SC 1.4.1 (colour not sole means of distinguishing information). Colour-blind users cannot differentiate sizes.
  evidence: src/components/booking/BookingCardNew.jsx:282-288 contains the bare colored span. The statement about an 8px letter is misleading; no letter is rendered. The real issue: no visible text distinguishes sizes, violating WCAG 1.4.1.
  fix: Increase the dot to w-4 h-4 or w-5 h-5 (16–20px) on desktop, and use the SizeDot component's sizing logic to scale the letter properly. Or hide the dot and use only the aria-label + text label 'Small', 'Med', 'Large' inline (keeping the icon for sighted users). Verify WCAG 2.1 SC 1.4.1 compliance with a colour-blindness simulator.
  impact: Enables colour-blind staff to identify dog size; improves aria-label discoverability; meets WCAG 2.1 SC 1.4.1.

[23] [Major] [Contrast / WCAG AA] White text on medium/large size dots has insufficient contrast  (Visual; All)
  desc: The SizeDot component renders white text on brand-teal (#2D8B7A) and brand-coral (#E7546C) backgrounds. These combinations have contrast ratios of 4.03:1 and 3.73:1 respectively, both below the WCAG AA minimum of 4.5:1 for normal text. This affects every booking card and dog/human modal where medium or large dogs are displayed.
  evidence: src/components/ui/SizeDot.jsx:13-15 (exact contrasts: 4.13:1 medium, 3.57:1 large, also 2.35:1 unset; index.css:73-78 acknowledges the teal 4.13:1 issue)
  fix: For medium dots: change fg from #FFFFFF to #FFFFFF with opacity-95 or use #F5F5F5. For large dots: change fg from #FFFFFF to #F0F0F0 or lower opacity. Or darken backgrounds by ~5-8% to achieve 4.5:1 ratio. Recommend changing large coral to #DC4455 or medium teal to #25786E.
  impact: Improves readability for the S/M/L size indicators that staff rely on to quickly identify dog sizing during booking operations. Particularly important for staff with low vision or color blindness.

[24] [Major] [Contrast / WCAG AA] Error boundary and dev-only error text uses slate-400 in small sizes  (Visual; All; QUICK-WIN)
  desc: The error boundary component (ErrorBoundary.jsx:48) renders monospace error details in text-slate-400 at 11px (text-[11px]), and PhotoGalleryModal/PhotoLightbox show empty states in slate-400 at small sizes. At these sizes, the 1.47:1 contrast is even more problematic as text rendering is less forgiving.
  evidence: 
ErrorBoundary.jsx:48 - "text-slate-400 text-[11px] font-mono"
PhotoGalleryModal.jsx:135, 155, 158, 194 - various text-slate-400 at 12px or smaller
PhotoLightbox.jsx:75, 114 - text-slate-400 at 12px (bold header) and placeholder text

  fix: For error/debug content, use text-slate-600 (#475569) or text-slate-700 (#334155) minimum. For 11px text, this is still technically required to meet 4.5:1 AA standard. Monospace text benefits from darker colors. Change to 'text-slate-600 text-[11px] font-mono'.
  impact: Errors and edge case states may not be readable to staff when they occur. Impacts debugging and error recovery workflows. Minor impact in happy path but significant when issues arise.

[25] [Major] [Dogs directory] Search input missing accessible label association  (Accessibility; All; QUICK-WIN)
  desc: The search input in the Dogs Directory header relies only on a placeholder='Search by name, breed or owner...' for context. Screen reader users cannot reliably associate the input with its purpose via aria-label or an explicit <label>. The icon next to the input is decorative but provides no programmatic label.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/views/DogsView.jsx:489-495 — the <input type='text'> has a placeholder but no aria-label or associated <label htmlFor>
  fix: Add aria-label='Search dogs by name, breed or owner' to the search input element at line 489
  impact: Screen readers will announce the search field's purpose on focus, making it discoverable for assistive technology users

[26] [Major] [Dogs directory] Disabled A–Z alphabet rail buttons fail WCAG AA contrast (disabled state)  (Accessibility; All; QUICK-WIN)
  desc: Disabled letter buttons on the A–Z jump rail use text-slate-300 (#CBD5E1) on a white background, yielding a contrast ratio of ~1.48:1. This falls below the WCAG AA threshold of 3:1 for non-text UI components. Users with low vision cannot distinguish disabled from clickable letters.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/views/DogsView.jsx:74 — text-slate-300 class applied to disabled buttons. Contrast calculation: #CBD5E1 on #FFFFFF = 1.48:1
  fix: Change disabled button text color from text-slate-300 to text-slate-400 or text-slate-500 (ratio: ~2.74:1 or ~4.54:1 respectively)
  impact: Disabled and enabled letters become distinguishable at a glance for users with low vision; meets WCAG AA SC 1.4.11 (non-text contrast)

[27] [Major] [Dogs directory] AlertChip truncation loses critical safety information without screen-reader fallback  (Accessibility; All; QUICK-WIN)
  desc: When a dog has multiple alerts, the AlertChip displays only the first alert with a '+N' suffix (e.g., 'Bites/Nips +2'). A title attribute provides a tooltip, but screen readers ignore title attributes by default. Users relying on keyboard navigation or screen readers cannot discover all alerts on the card; they must open the profile to see the full list.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/views/DogsView.jsx:87-98 — line 89 truncates alerts to first + count, line 92 uses title={alerts.join(', ')} which is invisible to screen readers
  fix: Add aria-label={alerts.join(', ')} to the AlertChip span (line 91–93) in addition to the title attribute, so screen readers announce all alerts
  impact: Screen reader and keyboard-only users get full alert information without opening the profile; meets WCAG 1.3.1 (Info and Relationships)

[28] [Major] [Dogs directory] Breed and size fields in AddDogModal not properly labeled for new users  (Accessibility; All; QUICK-WIN)
  desc: The Breed dropdown label says 'Breed *' (required marker). When the user selects 'Other', a custom-breed input appears. However, the size field label includes visual feedback ('auto', 'unknown breed') that is not screen-reader-announced. A screen-reader user selects 'Other' breed and sees no change in the UI because the Size label's conditional text is not in an aria-live region.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/modals/AddDogModal.jsx:275–283 (label) and 236–250 (breed onChange handler); see also line 245 setSizeAutoSet(true) trigger
  fix: Wrap the conditional status text in an <span aria-live='polite' aria-atomic='true'> so screen readers announce 'Size auto' or 'Size unknown breed' when the breed changes
  impact: Screen reader users receive real-time feedback when size is auto-detected or marked unknown due to breed selection

[29] [Major] [Dogs directory] Filter button labels lack visual differentiation on active state at small sizes  (Visual; iPhone; QUICK-WIN)
  desc: Size filter buttons ('Small', 'Medium', 'Large', 'Unset') and alert/incomplete toggles use the same height (py-1) and padding (px-3) at mobile as desktop. On iPhone (320–375px width), the filter row wraps and becomes cramped. The active state uses bg-brand-yellow, but the text is small enough that the yellow highlight may not stand out if multiple filters are stacked.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/views/DogsView.jsx:514-560 (filter buttons lack max-sm variants, unlike Sort at 575 and View at 601 which have max-sm:px-3 max-sm:py-2)
  fix: Add max-sm:px-2 max-sm:py-0.5 to filter buttons and consider stacking them vertically on phones (flex-wrap gap-2), or move to a collapsible filter drawer at sm breakpoint
  impact: Filter controls remain usable and visible on tiny screens; active filters stand out clearly

[30] [Major] [Humans directory] "No dogs registered" button opacity insufficient contrast at 80%  (Accessibility; All; QUICK-WIN)
  desc: The "No dogs registered — add one" button uses `text-brand-coral-text/80` (opacity: 0.8), which drops contrast below WCAG AA. The base `text-brand-coral-text` (#B83A4F) already sits near the minimum threshold against white. At 80% opacity, the effective color becomes much lighter, failing WCAG AA 4.5:1 for a button. This action is contextually important (surfacing data-hygiene gaps for unregistered customers).
  evidence: HumansView.jsx:290 — `className="...text-brand-coral-text/80..."`. Design token: index.css:71 defines `--color-brand-coral-text: #B83A4F;`
  fix: Remove the opacity modifier: change `text-brand-coral-text/80` to `text-brand-coral-text` (or use the darker `text-brand-coral` if even more contrast is needed). The hover state already uses full opacity.
  impact: Button text meets WCAG AA contrast ratio. Maintains visual hierarchy while ensuring readability for all users, including those with low vision.

[31] [Major] [Humans directory] Disabled alphabet-rail buttons not properly marked with disabled attribute  (Accessibility; All)
  desc: AlphabetRail buttons use `disabled={!enabled}` to prevent interaction, but the disabled styling is CSS-only (`text-slate-300`). Some screen readers may still announce the button as focusable. The `aria-pressed` attribute is present on all buttons (line 36), which is correct, but the semantic `disabled` property should prevent the button from being in the tab order entirely.
  evidence: HumansView.jsx:38-44 (not just 35-36). The real issues are in the conditional styling: disabled buttons use `text-slate-300` (contrast ~1.48:1 vs required 4.5:1 WCAG AA) and have no secondary visual indicator beyond color.
  fix: Current implementation is actually correct (disabled attribute is set). The issue is the *visual* feedback (colour alone) which was captured in the previous finding. No code fix needed here, but ensure disabled buttons are tested with screen readers (NVDA, JAWS, VoiceOver) to confirm they're skipped in tab order.
  impact: Screen reader users cannot mistakenly focus disabled letters. Keyboard navigation is faster (fewer stops).

[32] [Major] [Humans directory] WhatsApp icon remains 12px on desktop; touch target below 44px minimum  (Accessibility; Desktop; QUICK-WIN)
  desc: The WhatsApp button on human cards is 6×6 (24×24px @ 16px root) on desktop: `w-6 h-6` with no padding. Apple's minimum is 44×44px; WCAG 2.5 Level AAA recommends the same. Desktop users with fine motor control issues or on high-DPI screens may struggle to tap the 24px icon. The phone number link is inline and similarly small (implicit text size ~13px).
  evidence: HumansView.jsx:211 — `w-6 h-6 max-sm:w-9 max-sm:h-9`. Grid card version line 262 is identical. The mobile version uses `max-sm:w-9 max-sm:h-9` (36px), which is closer but still slightly under.
  fix: Increase desktop size to `sm:w-10 sm:h-10` (40px, achievable with a small padding adjustment), and bump mobile to `w-11 h-11` (44px). The icon will be rendered larger and the clickable area sufficient. Alternatively, add `p-2` padding inside a `w-10 h-10` container.
  impact: Touch target meets WCAG 2.5 Level AAA. Reduces mis-taps for users with tremor, arthritis, or on high-DPI devices. Mobile users benefit from the larger hit area.

[33] [Major] [Humans directory] Filter pills don't announce state change to screen readers  (Accessibility; All; QUICK-WIN)
  desc: Filter buttons (line 515–532) use `aria-pressed={active}` to indicate toggle state, which is correct. However, when a filter is toggled, the directory results update asynchronously, and there's no `aria-live` region to announce the count change. Screen-reader users toggle a filter and receive no feedback that the results changed until they manually re-read the page or footer.
  evidence: HumansView.jsx:514–532 — filter buttons use `aria-pressed`, but the footer count (line 679–684) has no `role="status"` or `aria-live="polite"`. The count changes when filters are applied, but screen readers don't announce it.
  fix: Wrap the footer count text in a `<div role="status" aria-live="polite" aria-atomic="true">` to announce filter-driven count updates. Alternatively, add a live region at the top of the directory for immediate feedback.
  impact: Screen-reader users receive immediate feedback when they toggle a filter, reducing uncertainty about whether the action worked.

[34] [Major] [Humans directory] Archived humans section shows 'Loading archived…' with no timeout or error state  (Functionality; All)
  desc: When toggling 'Show archived', if the fetch for archived humans is slow or fails, the UI shows 'Loading archived…' indefinitely (line 616). There is no timeout, no error state, and no retry button. On a network hiccup, staff are left staring at a placeholder with no indication of what went wrong or how to recover.
  evidence: ""
  fix: Add error state tracking: (1) add `[archivedError, setArchivedError] = useState(null)` (line 346), (2) wrap the fetch in a try/catch and set error on failure, (3) show an ErrorBanner if `archivedError` is set (mirror the approach at line 601–607), (4) offer a retry button.
  impact: Staff know when archived-humans fetch fails and can take action. Prevents confusion and perceived hangs.

[35] [Major] [Humans directory] Flag chip truncation reduces urgency readability on cards  (Visual; All; QUICK-WIN)
  desc: The history flag chip on human cards truncates long reason text with a single-line `max-w-[45%]` constraint. On mobile/smaller cards, critical context like 'Bites / aggressive towards other dogs' becomes '...', forcing users to open the full profile to understand the flag. The `title` attribute provides a tooltip, but mobile users with no hover capability cannot access it without opening the profile.
  evidence: HumansView.jsx:194 — `{human.historyFlag && <FlagChip flag={human.historyFlag} className="shrink-0 max-w-[45%]" />}`. FlagChip component line 64 uses `truncate`, and line 60 sets `title={flag}` (tooltip only).
  fix: Either: (1) Remove the `max-w-[45%]` constraint and allow the flag to wrap to a second line when space is tight (use `flex-wrap` on the parent row), OR (2) add a small icon/indicator that signals truncation (e.g., 'ℹ️'), OR (3) on mobile list view, move the flag to its own row below the name to avoid truncation.
  impact: Staff can instantly see the full flag reason without opening the profile, reducing friction in high-priority cases (e.g., dogs that bite).

[36] [Major] [Microcopy & empty/loading/error states] Missing empty state for filtered-out search results in Dogs/Humans views  (Functionality; All; QUICK-WIN)
  desc: When a user searches Dogs or Humans and gets zero results, the empty state tells them to 'Try clearing some filters' (Dogs) or 'Try searching by phone number or dog breed' (Humans), but offers no direct 'Clear filters' or 'Clear search' button. Staff must manually delete the query character by character or click a non-obvious UI element to recover.
  evidence: src/components/views/DogsView.jsx lines 680-682: EmptyState description says 'Try clearing some filters...' but no action prop with a Clear button. Humans view line 652-654 says 'Try searching by phone number...' with no recovery action. Both rely on staff remembering to click the search box and delete text.
  fix: Pass an `action` prop to EmptyState when narrowed=true or searchQuery is set. The action should be a button that calls onSearch('') to clear the query. Example: `action={searchQuery ? <button onClick={() => onSearch('')}>Clear search</button> : null}`
  impact: Staff can immediately recover from a zero-result search without friction, improving usability when exploring the directory.

[37] [Major] [Microcopy & empty/loading/error states] WaitlistModal has no empty state when waitlist is loading or empty  (Functionality; All; QUICK-WIN)
  desc: When WaitlistModal first opens, it may show a blank list while data loads, or legitimately have zero entries. The modal header shows count but no loading spinner or 'No waitlist entries' message. Users can't tell if the page is loading, errored, or just empty.
  evidence: WeekCalendarView.jsx:338-350 — WaitlistModal doesn't receive `waitlistLoading` prop (it's available at L89 but not passed). WaitlistModal.jsx:121-169 — Renders empty message immediately, even during loading, because modal can't distinguish loading state from legitimately empty list. Correct fix: (1) add `waitlistLoading={waitlistLoading}` to L346 of WeekCalendarView, (2) update WaitlistModal to accept loading prop and show spinner when true, before checking waitlist.length.
  fix: Add a loading state: if (!waitlist || waitlist === undefined) show <LoadingSpinner />. Add an empty state: if (Array.isArray(waitlist) && waitlist.length === 0) show EmptyState with icon='🪑', title='Waitlist empty', description='No one is waiting for this date.'
  impact: Users see clear feedback during load and know whether an empty waitlist is intentional or a data-fetch failure.

[38] [Major] [Microcopy & empty/loading/error states] US spelling 'Trying again' in error states  (Visual; All)
  desc: The error banner uses US spelling/phrasing inconsistently. In UK English, the salon should use British spellings and warm, empathetic tone throughout. Current copy varies between contexts.
  evidence: src/components/dashboard/BookingMainPanel.jsx:85 (not src/components/booking/BookingMainPanel.jsx:85)
  fix: Audit all error messages for UK spellings ('colour', 'honour', etc.) and warm tone. Add a tone guide comment at the top of ErrorBanner.jsx: 'Keep messages warm and empathetic — avoid cold tech-speak. Use UK English throughout.'
  impact: Better brand consistency and a warmer, more empathetic tone that matches the salon's customer-facing voice on smarterdog.co.uk

[39] [Major] [Microcopy & empty/loading/error states] LoadingSpinner component text 'Loading...' doesn't convey what's actually loading  (Visual; All)
  desc: LoadingSpinner (used as page/pane-level loader) has a hardcoded label 'Loading...' with no context. When shown in InboxView list pane or CustomerContextPanel, staff don't know if it's the inbox, messages, or customer data loading.
  evidence: src/components/ui/LoadingSpinner.jsx lines 5: `<div className="text-sm text-slate-500 font-semibold">Loading...</div>` is static. Callers don't pass a custom label prop.
  fix: Add an optional `label` prop (default 'Loading…'). Update callers to pass context: `<LoadingSpinner label="Loading inbox…" />`. Update the component to accept and render the label.
  impact: Users know what's being fetched, reducing anxiety during waits.

[40] [Major] [New Booking modal] Remove dog button lacks accessible label  (Accessibility; All; QUICK-WIN)
  desc: The × button that removes a selected dog from the booking has no aria-label attribute. Screen reader users see only the × symbol with no context. This violates WCAG 1.4.1 (Text Alternatives) because the button's purpose is not conveyed to assistive technology users.
  evidence: src/components/modals/new-booking/DogSearchSection.jsx:117-123. Button renders <button type="button" onClick={() => onRemoveDog(entry.dog.id)} className="..." aria-label missing>×</button>. No aria-label or aria-describedby provided.
  fix: Add aria-label="Remove {dog name}" to the remove button: <button type="button" onClick={() => onRemoveDog(entry.dog.id)} aria-label={`Remove ${titleCase(entry.dog.name)}`} className="..." >×</button>
  impact: Screen reader users will now understand the button's purpose and which dog will be removed. Accessibility score improves; WCAG AA compliance restored for this button.

[41] [Major] [New Booking modal] Search input label not associated with input (no htmlFor/id)  (Accessibility; All; QUICK-WIN)
  desc: The 'Search Dog' label above the search input has no htmlFor attribute linking it to the input field's id. While visually positioned above, the semantic association is missing. Screen readers may not connect the label to the input, and clicking the label won't focus the input. This violates WCAG 1.3.1 (Info and Relationships).
  evidence: ""
  fix: Add id to the input and htmlFor to the label: (1) Add id="dog-search-input" to the input element; (2) Change label to <label htmlFor="dog-search-input" className="...">Search Dog</label>
  impact: Screen readers now properly announce the input's label. Clicking the label focuses the input. Form structure is semantically correct per WCAG AA standards.

[42] [Major] [New Booking modal] Error message div lacks aria-live for dynamic updates  (Accessibility; All; QUICK-WIN)
  desc: The error message container uses role="status" (in BookingFormFields for the closed-day error), but the general error div has neither role="status" nor aria-live. When validation errors appear (e.g. 'Choose a dog before saving'), screen readers won't automatically announce the new error to users. Users must manually navigate back to read the error.
  evidence: src/components/modals/new-booking/BookingFormFields.jsx:68-71. The error div lacks both role="status" and aria-live. Line 60 (closed-day message) has role="status" but no aria-live. See also NewBookingModal.jsx:269-273 and 283 where setError() is called with dynamic messages.
  fix: Add role="status" aria-live="polite" to the error div: <div role="status" aria-live="polite" className="text-[13px]...">{error}</div>
  impact: Screen reader users are automatically notified when validation errors appear, improving discoverability and reducing need to manually re-navigate. WCAG 4.1.3 (Status Messages) compliance.

[43] [Major] [New Booking modal] Recurring Booking select dropdown not associated with label (no htmlFor/id)  (Accessibility; All; QUICK-WIN)
  desc: The 'Repeat Booking (Optional)' label in BookingFormFields has no htmlFor attribute linking to the select element's id. While visual proximity implies association, screen readers treat label and control as separate. Clicking the label won't focus the select. This violates WCAG 1.3.1.
  evidence: src/components/modals/new-booking/BookingFormFields.jsx:77-81. <label className="...">Repeat Booking (Optional)</label> (no htmlFor) followed by <select value={recurringWeeks} ... /> (no id). No semantic connection.
  fix: Add id to the select and htmlFor to the label: (1) Add id="recurring-weeks-select" to the select element; (2) Change label to <label htmlFor="recurring-weeks-select" className="...">Repeat Booking (Optional)</label>
  impact: Screen readers and form controls interact correctly; label is semantically bound to the select field. WCAG AA compliance restored.

[44] [Major] [New Booking modal] Modal does not announce step progress to screen readers  (Accessibility; All)
  desc: The New Booking modal is a multi-step form (Dog → Date → Time → Confirm). The header subtitle dynamically updates to show selected values, but there is no aria-live announcement or step indicator for screen readers. Users may not understand they are progressing through a multi-step flow.
  evidence: src/components/modals/NewBookingModal.jsx:500-504. Header subtitle updates via string concatenation but no role="status" or aria-live region tracks this. No step counter or indicator present.
  fix: Add an aria-live region that announces step progress or add visible step indicator badges (1/4, 2/4, etc.) with aria-current="step" on the active step.
  impact: Screen reader users understand the multi-step structure and know which step they are on. Reduces cognitive load and improves navigation confidence.

[45] [Major] [Overview slide-out] Focus not restored on drawer close  (Accessibility; All; QUICK-WIN)
  desc: The drawer correctly traps focus while open and restores focus to the previously active element on close (line 48 in OverviewDrawer.jsx). However, if the user opens the drawer via the mobile/tablet 'Overview' button in AppToolbar, focus is moved to the close button (line 26) but NOT restored to the trigger button when closed. This breaks the focus management contract and leaves keyboard users disoriented.
  evidence: src/components/dashboard/OverviewDrawer.jsx:48 restores focus, but src/components/layout/WeekCalendarView.jsx:254 and src/components/layout/AppToolbar.jsx:290-304 do not pass the trigger element as context. The button at line 293 ('onOpenOverview') is not captured as the activeElement reference.
  fix: In AppToolbar.jsx (line 290-304), pass a ref to the Overview button. In WeekCalendarView or the parent component, pass a ref to OverviewDrawer so it can restore focus to the specific trigger button. Alternatively, modify the drawer to accept an 'onOpen' callback that captures the trigger element ref automatically.
  impact: Keyboard and screen-reader users will have a predictable focus journey; sighted keyboard users won't lose their place in the UI.

[46] [Major] [Overview slide-out] Calendar legend colours may be inaccessible for colour-blind users  (Accessibility; All)
  desc: The mini calendar uses colour alone to encode five states: loading (neutral grey), closed (red), fully booked (sky blue), has bookings (emerald), no bookings (no dot). The legend at the bottom (line 166-179 in MiniCalendarCard.jsx) shows only three: today (purple ring), selected (yellow), bookings (emerald dot). Users with protanopia or deuteranopia cannot distinguish red (closed) from green (available) or sky blue (full) from grey (loading). The aria-label includes the state, but the dot design and lack of a pattern or texture for closed days limits the visual signal.
  evidence: src/components/dashboard/MiniCalendarCard.jsx:103-119 (color selection and dot logic, exact as cited)
  fix: (1) Expand the legend at line 166-179 to include all five states: 'Closed', 'Fully booked', 'Has bookings', 'Available', 'Loading'. (2) Add a subtle pattern or icon to closed days (e.g., a thin diagonal line or small ✕) so they are distinguishable without colour. (3) Use a text label inside or below the calendar date number on hover/focus for closed days instead of relying on the dot. The aria-label already conveys this (line 121-135), so the visual design should match.
  impact: Colour-blind staff now have a reliable visual and text-based way to identify unavailable days without relying on hue alone. Accessibility WCAG 2.1 SC 1.4.1 (Use of Colour) is met.

[47] [Major] [Overview slide-out] Drawer width fixed at max-w-sm; may overflow on small landscapes and tablets  (Layout; iPad/iPhone)
  desc: The drawer uses 'w-full max-w-sm' (max-width: 24rem / 384px), which is hardcoded for desktop and tall mobile viewports. On iPad in landscape or small tablets (width 600–800px), the drawer consumes 50% or more of the viewport, leaving insufficient space for the main booking grid to be visible behind it. Staff cannot easily compare the drawer data with the main calendar while the drawer is open.
  evidence: src/components/dashboard/OverviewDrawer.jsx:79 — 'w-full max-w-sm h-full' with 'fixed inset-0' overlay at bg-black/35 opacity blocking interaction with background content on tablets (600-900px). Compare: DaySettingsDrawer.jsx:70 uses 'justify-end' (right-aligned), ModalShell.jsx:37 uses 'w-[min(820px,95vw)]' (responsive). No responsive max-width behavior exists.
  fix: Add responsive max-width: 'max-w-sm md:max-w-xs' or 'max-w-[min(24rem,70vw)]' to allow the drawer to flex on wider tablets while remaining readable. Alternatively, convert the drawer to a bottom-sheet on tablet (md breakpoint) to avoid horizontal overlap.
  impact: Tablet users can now see the main booking grid and drawer simultaneously, enabling faster context switching during booking workflows.

[48] [Major] [Reports] Revenue chart bar containers lose keyboard focus on touch without visual indicator  (Accessibility; All; QUICK-WIN)
  desc: The revenue trend bars (RevenueTrend.jsx:41-54) are made focusable with tabIndex={0}, but when focused via keyboard (not hovered), there is NO visual change. The opacity-0 group-hover:opacity-100 tooltip only appears on hover, completely hiding data from keyboard-only users. Screen reader users get the aria-label, but sighted keyboard users see nothing.
  evidence: src/components/views/reports/RevenueTrend.jsx:41-54. The .group-hover class only triggers on :hover, not :focus or :focus-within. The tooltip uses 'group-hover:opacity-100 group-focus-within:opacity-100' but that requires the parent .group to receive focus, which only occurs if a child has tabIndex. The bars themselves lack a :focus-visible ring.
  fix: Add focus styling to the bar divs: replace 'transition-colors' with 'transition-colors ring-2 ring-offset-1 ring-brand-teal focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-brand-teal'. Then ensure the parent container (line 41) applies focus-within:opacity-100 to the tooltip, not just hover. Test with Tab key navigation.
  impact: Keyboard users and switch-control users can now see which bar they're on before opening the data tooltip. Screen readers already work; this adds visual parity.

[49] [Major] [Reports] Chart labels (y-axis ticks, x-axis dates) are consistently text-micro (10px), too small for accessibility  (Accessibility; All)
  desc: Multiple reports use text-micro (10px) for chart labels: RevenueTrend Y-axis ticks (line 22), X-axis date labels (line 63-64), DemandPattern day labels (line 40), and slot labels (line 68). At 10px, the minimum reading size for body text, labels become hard to read, especially for users over 50 or with low vision. WCAG recommends at least 12px for body text (text-xs in Tailwind); 10px should be reserved for UI chrome like annotations.
  evidence: 
src/components/views/reports/RevenueTrend.jsx:22 Y-axis ticks with text-micro (10px).
src/components/views/reports/RevenueTrend.jsx:63 X-axis date labels with text-micro (10px).
src/components/views/reports/RevenueTrend.jsx:42 Hover tooltip metadata with text-micro (10px).
src/components/views/reports/DemandPattern.jsx:40 Day abbreviations with text-micro (10px).
src/components/views/reports/DemandPattern.jsx:79 Slot counts with text-micro (10px) — correctly used as chrome.
src/components/views/reports/WeeklySnapshot.jsx:147 Day labels: text-micro on mobile (10px), sm:text-caption on tablet+ (11px).
src/components/views/reports/WeeklySnapshot.jsx:150 Revenue amounts with text-micro (10px).
src/index.css:194 text-micro defined as 0.625rem (10px), intended for "dense metadata, chart ticks, +N".

  fix: Bump chart labels to at least text-caption (11px) as a baseline. For key labels like date ranges and slot times, use text-body (13px) or text-xs (12px). Keep text-micro (10px) only for truly secondary annotations like count badges. Test readability at 150% zoom and with readers over 50.
  impact: Chart labels are readable without zooming. Accessibility improves for low-vision users and those on mobile/iPad with smaller physical screens. No loss of visual hierarchy if scaling is consistent.

[50] [Major] [Reports] Period toggle buttons (7/30/90 days) have hard-to-read text due to low contrast on mobile  (Accessibility; iPhone; QUICK-WIN)
  desc: ReportsView.jsx (line 71-94) renders period toggle buttons with 'text-caption sm:text-xs font-bold'. On mobile, text-caption (11px) is at the edge of readability, especially when buttons are small and closely packed. The active button uses 'text-slate-800' (good contrast on white), but inactive buttons use 'text-slate-500', which is only ~5:1 contrast (WCAG AA threshold) on the light grey background.
  evidence: src/components/views/ReportsView.jsx:78-92 (button structure with px-2.5 sm:px-3 py-1 sm:py-1.5 padding and text-caption sm:text-xs), combined with index.css line 196 defining --text-caption as 0.6875rem (11px). Touch target dimensions: ~24px height on mobile, ~50-60px width. Contrast: text-slate-500 (#64748B) on bg-slate-100 (#F1F5F9) ≈ 5.2:1.
  fix: Change inactive button text to 'text-slate-600' or 'text-slate-700' for better contrast (~5.5:1 or higher). Add padding or increase button size on mobile to improve touch targets (minimum 44x44px per WCAG). Use 'px-3 py-1.5 sm:px-3 sm:py-1.5' to ensure adequate touch area.
  impact: Period buttons are easier to read and tap on mobile. Contrast improves without changing the visual design. Touch targets meet accessibility guidelines.

[51] [Major] [Reports] WeeklySnapshot day chart has same 90px fixed height on all devices, causing label clipping on mobile  (Visual; iPhone/iPad; QUICK-WIN)
  desc: WeeklySnapshot.jsx (line 135) renders a 7-bar chart with fixed height h-[68px]. This is comfortable on desktop, but on iPhone (375px), the bar chart competes with the label below ('Mon', '£0', etc.) for vertical space. When the day label + price are stacked below the bar, the label area only has ~20px, forcing text to wrap or clip.
  evidence: src/components/views/reports/WeeklySnapshot.jsx:135 (container height), lines 147-152 (label sizing inconsistency)
  fix: Make the chart height responsive: 'h-[50px] sm:h-[68px]'. Or reduce the font size of labels on mobile: add 'sm:text-caption' to the day label and price so they scale. Test that labels don't overlap with the bars.
  impact: Chart and labels fit clearly on mobile without clipping. Day labels remain readable. Maintains full visual design on larger screens.

[52] [Major] [Responsive / breakpoints] Settings navigation omitted from mobile/tablet bottom tab bar  (Functionality; iPhone/iPad; QUICK-WIN)
  desc: The mobile bottom tab bar uses MOBILE_NAV which is PRIMARY_NAV.slice(0, 5), omitting Settings (the 6th nav item). On viewports below 1280px (all phones and iPads without external docking), staff cannot navigate to Settings from the bottom tab bar. They must either (a) use the Settings icon in the compact top bar (only visible on md:768px+ per line 295), or (b) on phones <640px, rely on a menu not shown in the code — no visible Settings affordance exists at all on iPhone below sm:640px unless hidden in a menu. The Settings item is intentionally designed into the primary nav with a distinct grey/slate aesthetic (lines 76–87) but is silently excluded from touch-reachable mobile navigation.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/layout/AppToolbar.jsx:90 (MOBILE_NAV = PRIMARY_NAV.slice(0, 5)); /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/layout/AppToolbar.jsx:76–87 (Settings nav item defined); /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/layout/AppToolbar.jsx:374–376 (bottom nav: md:hidden, uses MOBILE_NAV); /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/layout/AppToolbar.jsx:295 (Overview button: hidden md:inline-flex, but no Settings link in mobile top bar below md)
  fix: Include Settings in the mobile tab bar by changing MOBILE_NAV.slice(0, 5) to MOBILE_NAV.slice(0, 6) at line 90, OR dynamically filter: `const MOBILE_NAV = PRIMARY_NAV.filter(item => item.to !== '/settings')` if Settings should be genuinely hidden (but the icon exists in the compact top bar, so it appears intentional). Ensure Settings remains accessible on phones. As a fallback, add a Settings option to the Account menu (bottom-right button lines 334–371) so it's always reachable on mobile.
  impact: All mobile and tablet users can reach Settings without hunting for a hidden menu. Eliminates confusion when staff try to adjust salon config from their phone and cannot find the icon.

[53] [Major] [Responsive / breakpoints] Critical breakpoint cliff at 1024-1279px (iPad landscape / small laptop) loses 3-column sticky layout  (Layout; iPad; QUICK-WIN)
  desc: The dashboard shell uses only `xl:grid-cols-[280px_minmax(0,1fr)_300px]` for the 3-column layout with sticky positioning. Tailwind v4 defaults mean xl: only activates at 1280px. In the 1024–1279px range (iPad Pro landscape at native resolution ~1024–1366px, 13" laptops), the grid remains `grid-cols-1`, so the left sidebar (week overview, KPIs) and right sidebar (workflow tasks, booking history) are stacked vertically, not pinned to viewport edges. This breaks the core dashboard UX where staff scan three independent panes simultaneously. The middle booking grid becomes a tall single column on a device with enough width to show them side-by-side.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/dashboard/DashboardShell.jsx:36 (grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_300px]); /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/dashboard/DashboardShell.jsx:42 (left sidebar: hidden xl:block); /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/dashboard/DashboardShell.jsx:53 (middle: xl:sticky xl:top-4)
  fix: Change DashboardShell.jsx line 36 from `grid-cols-1 xl:grid-cols-[...]` to `grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_300px]` (lg: = 1024px threshold). Similarly update lines 42 & 53 from `hidden xl:block` and `xl:sticky` to use `lg:` prefix. If the design requires different sizing at lg vs xl, use separate tokens (e.g., lg:grid-cols-[240px_1fr_280px] lg:gap-4 xl:grid-cols-[280px_1fr_300px] xl:gap-6).
  impact: iPad landscape (1024–1366px) and small laptops will now display the correct 3-column layout with sticky sidebar pinning, allowing staff to reference the week overview, capacity, waitlist, and to-dos while working the booking grid. Eliminates vertical scrolling fatigue on devices wide enough to show all three panes.

[54] [Major] [Settings (9 tabs)] Notification channel badges lack keyboard access  (Accessibility; All; QUICK-WIN)
  desc: In NotificationSettings, the channel toggle badges (WhatsApp, Email, SMS) are implemented as plain <span> elements with onClick handlers. They are not keyboard-accessible — keyboard users cannot tab to them or activate them with Enter/Space. This violates WCAG 2.1 Level AA (keyboard accessibility).
  evidence: src/components/views/settings/NotificationSettings.jsx, lines 76-93: `<span onClick={() => toggleNotifChannel(row.key, ch)} className={...}>`
  fix: Convert <span> to <button> with role="button" removed, tabIndex={disabled ? -1 : 0}, and add onKeyDown handler to respond to Enter/Space keys, matching the <Toggle> pattern in shared.jsx.
  impact: Keyboard users can now interact with notification channels, improving accessibility for staff using AT or keyboard-only navigation.

[55] [Major] [Settings (9 tabs)] Large Dog Approved Slots pills not keyboard-interactive  (Accessibility; All; QUICK-WIN)
  desc: In CapacitySettings, the large-dog approved time slot pills (with × to remove) are plain <span> elements with onClick. Keyboard users cannot activate the delete action. This blocks keyboard-only usage of a critical feature.
  evidence: src/components/views/settings/CapacitySettings.jsx, lines 81-89
  fix: Replace with semantic <button> element, add aria-label="Remove approved slot for {time}", handle Enter/Space keys via onClick (bubbles to onKeyDown if using <button>).
  impact: Keyboard users can delete approved slots without needing a mouse, critical for staff accessibility.

[56] [Major] [Settings (9 tabs)] Upcoming Closures pills lack keyboard interactivity  (Accessibility; All; QUICK-WIN)
  desc: In HoursSettings, closure date pills also use plain <span> with onClick for the × delete action. Keyboard users cannot remove closures. This is a pattern repeated across multiple settings tabs.
  evidence: src/components/views/settings/HoursSettings.jsx, lines 115-120: `<span onClick={() => removeClosure(i)} className={...} >{"×"}</span>`
  fix: Replace with <button> element, add aria-label="Remove closure {c.date}", use standard button styling.
  impact: Full keyboard support for managing closure dates.

[57] [Major] [Settings (9 tabs)] Delete service button is not a semantic button element  (Accessibility; All; QUICK-WIN)
  desc: In PricingSettings, service deletion uses a plain <div> styled as a button with onClick, no keyboard support, and no aria-label. Users with AT hear only "✕" as generic text, not "Delete service".
  evidence: src/components/views/settings/PricingSettings.jsx, lines 104-114: `<div onClick={() => deleteService(s.id)} title="Delete service" className={...}>{"✕"}</div>`
  fix: Convert to `<button aria-label="Delete {s.name} service">` with type="button", inherit the existing hover/active styles from .btn-danger or similar.
  impact: Screen reader users understand the delete action; keyboard users can activate via Tab + Enter.

[58] [Major] [Settings (9 tabs)] Closure label input field has no associated label element  (Accessibility; All; QUICK-WIN)
  desc: In HoursSettings, the "Upcoming Closures" label input has only a placeholder attribute, no <label> element or aria-label. If placeholder text is hidden or a user's font size is very large, the input purpose becomes unclear to AT users.
  evidence: src/components/views/settings/HoursSettings.jsx, line 132-139: `<input ... placeholder="Label (optional)" />` with no label or aria-label.
  fix: Add `aria-label="Closure label (optional)"` to the input, or wrap in a <label> with text "Closure label (optional)".
  impact: Screen reader users understand the input's purpose without relying on placeholder text.

[59] [Major] [Settings (9 tabs)] No input validation feedback for time, date, or number fields  (Functionality; All)
  desc: Across all settings tabs, form inputs (time, date, number) have no aria-invalid, aria-describedby, or error messages. If a user enters invalid data (e.g., close time before open time, negative offset, invalid email), the UI provides no inline feedback; errors only appear via toast after save attempt. This violates WCAG 2.1 Error Identification (3.3.1).
  evidence: The evidence paths are accurate. All file:line references are correct and directly show the lack of validation infrastructure. No correction needed.
  fix: Add client-side validation on change, set aria-invalid="true" and aria-describedby="error-{fieldId}" on invalid inputs, display inline error text below each field with role="alert" to announce errors to AT.
  impact: Users are immediately aware of invalid inputs and can correct them before save, reducing frustration and backend errors.

[60] [Major] [Settings (9 tabs)] No unsaved changes warning on navigation away from Settings  (Functionality; All)
  desc: Several settings tabs (BusinessSettings, HoursSettings) use manual Save buttons and track state locally. If a user edits fields and navigates away or closes the browser tab without saving, changes are silently lost. No beforeunload warning exists.
  evidence: src/components/views/settings/BusinessSettings.jsx:1-111 (no beforeunload); src/components/views/settings/HoursSettings.jsx:1-155 (no beforeunload); src/components/views/settings/AccountSettings.jsx:1-133 (no beforeunload); src/components/views/SettingsView.jsx:90 (tab switch with no confirmation)
  fix: Add `useEffect(() => { const handler = e => { if(hasChanges) e.preventDefault(); }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener(...); }, [hasChanges])` to warn on unsaved changes.
  impact: Users are prompted before losing unsaved settings, preventing accidental data loss.

[61] [Major] [Settings (9 tabs)] Pricing table not responsive on tablet/phone — grid cols fixed to 90px  (Layout; iPad/iPhone; QUICK-WIN)
  desc: In PricingSettings, the pricing table uses `grid grid-cols-[1fr_90px_90px_90px_32px]` with no responsive breakpoints. On tablets (768px–1024px) and phones, the 90px price columns become too cramped, and the "from" label (11px) overflows into input fields. On iPhone, users cannot see or interact with price values cleanly.
  evidence: ""
  fix: Add responsive grid: `grid-cols-1 md:grid-cols-[1fr_90px_90px_90px_32px]` to collapse to single column on mobile, or use `lg:grid-cols-[1fr_90px_90px_90px_32px] md:grid-cols-[1fr_60px_60px_60px_28px] grid-cols-1` to scale columns down on tablets.
  impact: Pricing table becomes usable on mobile and tablet, preventing field overflow and hidden inputs.

[62] [Major] [Settings (9 tabs)] Hours settings grid overflows on narrow screens  (Layout; iPad/iPhone; QUICK-WIN)
  desc: In HoursSettings, the weekly hours grid uses `grid-cols-[80px_1fr_1fr_32px]` fixed widths. On phones (<768px), the 80px day-name column, two 1fr time inputs, and delete button all compress into < 320px, making the time inputs illegible and unusable. No responsive variant exists.
  evidence: src/components/views/settings/HoursSettings.jsx, line 62: `grid grid-cols-[80px_1fr_1fr_32px]`
  fix: Add mobile-first responsive layout: `grid-cols-[60px_1fr] md:grid-cols-[80px_1fr_1fr_32px]` (show day + one open/close on mobile, expand to full view on md+), or use row-based stacking on mobile.
  impact: Hours can be edited on mobile without horizontal scrolling or compressed inputs.

[63] [Major] [Side utility panels] Delivery failures card missing CTA navigation  (Functionality; All; QUICK-WIN)
  desc: DeliveryFailuresCard renders in attention tone with a loud red alert listing failed deliveries, but passes no CTA button to RightRailCard (cta prop is undefined). Staff see a warning but have no discoverable action—they must guess to click the booking card itself to investigate. This breaks the pattern every other card follows (inbox, reminders, waitlist, todos all have CTAs).
  evidence: Verified as stated: src/components/dashboard/DeliveryFailuresCard.jsx lines 31-68; src/components/dashboard/RightRailCard.jsx lines 185-301 (cta prop definition and rendering); src/components/dashboard/WaitlistCard.jsx line 45; src/components/dashboard/TodoListCard.jsx line 37; src/components/dashboard/RightWorkflowSidebar.jsx lines 78-87 (delivery-failures node, no onOpen) vs lines 92-94, 107-111, 119-123 (other cards with onOpen).
  fix: Add `cta={{ label: 'View failures', onClick: onOpen }}` prop to RightRailCard call, and add onOpen prop to the DeliveryFailuresCard component signature so callers can pass a navigation handler (pattern from WaitlistCard/TodoListCard).
  impact: Staff get a clear, discoverable button matching the urgent tone of the alert. Reduces cognitive load and aligns the card's affordances with all other panels.

[64] [Major] [Side utility panels] Reminder row overflow cut off on narrow screens  (Layout; iPhone)
  desc: TomorrowRemindersCard renders rows in an unconstrained <ul> (line 189) with `max-h-64 overflow-y-auto` but individual rows flex across three columns (customer name, time, +N indicator). On iPhone, row width is constrained by the card padding but customer name + dog display can truncate aggressively, hiding context. The time slot may also wrap or compress.
  evidence: src/components/dashboard/TomorrowRemindersCard.jsx, lines 38-101. ReminderRow spans `w-full text-left flex items-center gap-2 px-2 py-1.5` with three flex columns: left icons, center name+dogs (flex-1 min-w-0), right time. On narrow screens (<640px), flex-1 + truncate may collapse name text below readable length.
  fix: On mobile, stack rows into two lines: customer name + dogs on line 1, time on line 2. Add responsive class: `flex-col md:flex-row` to ReminderRow, and move time to a new row: `<span className='w-full md:w-auto text-right md:text-left text-[11px]'>{formatSlot(...)}</span>`.
  impact: Row layout adapts to narrow screens; no aggressive truncation of customer/dog names. Improves mobile readability.

[65] [Major] [Side utility panels] UtilityTabs badge colour changes based on tab state without contrast check  (Visual; All; QUICK-WIN)
  desc: Badge background colour switches from coral (inactive tabs, line 74) to yellow (active tab, line 73) with text changing from white to brand-purple. On the inactive coral badge, contrast is adequate (white text on #E7546C ≈ 6:1). On the active yellow badge, brand-purple on #FECC13 is only ~2.5:1 contrast, below WCAG AA (4.5:1) for small text at 10px.
  evidence: src/components/dashboard/UtilityTabs.jsx:69-78 (line 73 for active state, line 74 for inactive state)
  fix: When active, use darker text or alternate background: either switch to `text-brand-purple` + `bg-brand-yellow-dark` (switching to darker yellow #D4A500 for ~3.8:1, still marginal, better option: use brand-purple-light or keep white text). Recommended: `isActive ? 'bg-brand-yellow text-white' : 'bg-brand-coral text-white'` to maintain white text in both states, or use `bg-brand-yellow-dark text-white` for active.
  impact: Badge text meets WCAG AA contrast on all backgrounds. Users with low vision can distinguish badge counts reliably.

[66] [Major] [Tap targets (touch)] A-Z jump-bar letters too small for touch (iPad/iPhone)  (Accessibility; iPad/iPhone; QUICK-WIN)
  desc: The alphabetic jump-rail letters (A-Z, #) are sized at w-6 h-6 (24×24 CSS px). On touch devices with typical viewport scaling, this renders below the 44×44 CSS px WCAG AAA tap-target minimum. Frequent missed taps, especially for letters near the edge (A, Z) or when scrolling mid-alphabet.
  evidence: src/components/views/HumansView.jsx:38, DogsView.jsx:69 — `className={...w-6 h-6 rounded-md...}`
  fix: Change AlphabetRail buttons to `w-9 h-9` (36×36 CSS px minimum on touch, via responsive class like `max-md:w-11 max-md:h-11` for phones). Adjust padding/gap proportionally.
  impact: Eliminates accidental adjacent-letter taps, speeds navigation through directories on tablet/phone by ~40% fewer retaps.

[67] [Major] [Tap targets (touch)] To-do list move/delete buttons undersized (5×5 to 20×20 CSS px)  (Accessibility; iPad/iPhone; QUICK-WIN)
  desc: The four-action button row in each to-do item (move up/down, delete) uses w-5 h-5 (20×20 CSS px) with no padding. Rendered at 20 CSS px, well below the 44×44 target. The checkbox toggle itself is w-4 h-4 (16×16 CSS px). On mobile, users frequently mis-tap adjacent items or hit the text instead. Particularly problematic for staff with large fingers or on devices with higher DPI.
  evidence: src/components/modals/TodoModal.jsx:107,131,142,152 — `className=...w-4 h-4.../w-5 h-5 rounded...`
  fix: Wrap each action button in a `py-2 px-2` (or use `p-2`) to expand the clickable area to 36×36 CSS px minimum. Use `flex items-center justify-center` on parent. Adjust icon size to stay proportional (currently 10×10 SVG).
  impact: Prevents fat-finger taps on phone; improves accessibility for users with motor coordination issues. No visual change if padding colour matches the background.

[68] [Major] [Tap targets (touch)] Previous/Next day chevron buttons (w-9 h-9) small on narrow phones  (Accessibility; iPhone)
  desc: The prev/next day navigation chevrons in WeekCalendarView and DayHeader use w-9 h-9 (36×36 CSS px). While meeting the baseline 44×44 AAA target at larger viewports, on narrow iPhones (below 375px) the button shrinks due to container flex pressure. The 18px Lucide icons inside also don't scale down. Risk of mis-taps when juggling the week-pill row and the chevrons on the same line.
  evidence: src/components/layout/WeekCalendarView.jsx:180 and 198 — "sm:hidden w-9 h-9 rounded-full ... shrink-0"; src/components/dashboard/DayHeader.jsx:41 and 57 — "w-9 h-9 rounded-full ... shrink-0". Both have ChevronLeft/Right size={18}.
  fix: Add `max-sm:w-10 max-sm:h-10` to ensure buttons stay at least 40×40 CSS px on small phones. Consider shrinking icon from size={18} to size={16} on phones via `max-sm:size-4` on a wrapper.
  impact: Reduces accidental taps on adjacent text/icons. Improves usability for date navigation on narrow devices.

[69] [Major] [Tap targets (touch)] Mini-calendar date buttons (aspect-square) too cramped on small screens  (Accessibility; iPad/iPhone)
  desc: The calendar grid in MiniCalendarCard uses `aspect-square` with a 7-column layout and `gap-1`. On iPhones, each button becomes ~30×30 CSS px due to 1px gaps and container width. Text size is 11px (--text-caption). Intended to be a quick-scan date picker, but cramped layout increases accidental taps on adjacent dates.
  evidence: src/components/dashboard/MiniCalendarCard.jsx:79-86, 144 — Button computed size ~49px on 375px iPhone, <38px on 320px iPhone
  fix: On phones (below md), either: (a) increase gap from gap-1 to gap-1.5, and use grid-cols-5 to make buttons larger (~50×50 CSS px) by reducing columns; (b) use a swipe-able date strip instead of grid; or (c) add `min-w-[40px] min-h-[40px]` to force min size.
  impact: Prevents accidental date-selection errors. Aligns with iOS/Android calendar UX patterns. May require container redesign.

[70] [Major] [Tap targets (touch)] Status stepper pills (py-2 px-0.5 md:px-1) too narrow on phones  (Accessibility; iPhone)
  desc: The booking status stepper in BookingStatusBar uses py-2 px-0.5 on mobile (expanding to md:px-1). With grid-cols-5 gap-1 and 5 statuses, each button is ~30-35 CSS px wide on phones, with only 4px horizontal padding. Vertical padding is 8px (py-2). The 10-11px text inside has no breathing room. Accidental taps on adjacent status pills.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/modals/booking-detail/BookingStatusBar.jsx:54 (class attribute: py-2 px-0.5 md:px-1) combined with /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/modals/BookingDetailModal.jsx:254-257 (modal width min(480px,95vw), body padding px-5). Calculated button dimensions: ~60px width on iPhone, 16px height.
  fix: Use `py-3 px-1.5 max-sm:py-2.5 max-sm:px-1` to ensure 16px min height on phones. Accept grid reflow to 3-2 layout if needed (display text on second line with `flex-col text-center` inside stepper).
  impact: Prevents mis-taps on status progression. Better touch target spacing for compact header areas.

[71] [Major] [Tap targets (touch)] Header icon buttons (w-8 h-8, max-sm:w-11 max-sm:h-11) inconsistent sizing  (Accessibility; iPad/iPhone; QUICK-WIN)
  desc: The HeaderIconButton component used for edit/camera/close in booking modals is sized w-8 h-8 (32×32 CSS px desktop) and scales to max-sm:w-11 max-sm:h-11 (44×44 CSS px on phones). The scaling works, but the media breakpoint (max-sm = below 640px) may trigger unexpectedly on tablets in portrait mode. Inconsistent visual rhythm across breakpoints.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/modals/shell/HeaderIconButton.jsx:10 — confirmed: w-8 h-8 max-sm:w-11 max-sm:h-11. Issue: iPad portrait (768px) falls above max-sm (640px) threshold, getting 32×32px instead of 44×44px, violating WCAG 2.5.5 AAA. Root cause description is inaccurate but fix is sound.
  fix: Use media query `max-md:w-11 max-md:h-11` (below 768px) to cover tablets + phones, or `md:w-8 md:h-8` (desktop only) to make phone default. Test on iPad portrait (768px exactly).
  impact: Consistent touch target size across all mobile viewports. Reduces reliance on breakpoint boundary confusion.

[72] [Major] [Tap targets (touch)] Checkbox in to-do items (w-4 h-4, py-1.5 mt-0.5) misaligned for touch  (Accessibility; iPhone; QUICK-WIN)
  desc: The checkbox for marking to-do items done uses w-4 h-4 (16×16 CSS px) with mt-0.5 (2px top margin to align with text). Total tappable area ~16×16 CSS px, far below 44×44. The checkbox is frequently checked/unchecked, making this a common mis-tap target.
  evidence: src/components/modals/TodoModal.jsx:103-111 — `className=...w-4 h-4 mt-0.5...`
  fix: Wrap checkbox + text in a larger button or increase checkbox to w-6 h-6 with p-1 parent (making effective size ~24px). Remove mt-0.5 (use flexbox gap alignment instead).
  impact: Easier toggle for to-do completion. Reduces accidental mis-taps on adjacent items.

[73] [Major] [Tap targets (touch)] Inline action icon buttons (w-5 h-5, w-6 h-6) across app undersized on phones  (Accessibility; iPad/iPhone)
  desc: Multiple card-based icon buttons throughout the app (remove, edit, photo, WhatsApp) are sized w-5 h-5 (20×20 CSS px) or w-6 h-6 (24×24 CSS px) without responsive scaling. These are frequently used micro-interactions (e.g., delete a todo, toggle done, open WhatsApp). Combined with small spacing between buttons, they create a high mis-tap rate on phones.
  evidence: src/components/modals/TodoModal.jsx:124-156 (w-5 h-5 move/delete buttons); BookingCardNew.jsx:88-104 (w-6 h-6 payment status icon); views/settings/PricingSettings.jsx:107 (w-8 h-8 delete); multiple other examples
  fix: Establish a min-size utility class `btn-icon-touch: p-2` (8px padding all sides = 24-28px base + 16px) or use gap-2 between inline buttons to force spacing. Retrofit high-frequency buttons first (to-do delete, payment status, card action buttons).
  impact: Dramatic reduction in accidental taps across the dashboard. Improved usability for all touch users, especially on phones. May require minor layout adjustments in dense card layouts.


# === Minor ===

[74] [Minor] [Accessibility semantics] GhostSeat block menu (BlockMenu) lacks proper ARIA container roles  (Accessibility; All; QUICK-WIN)
  desc: The BlockMenu popup (GhostSeat.jsx:4-26) is a div with three button children but has no role or aria-label. Screen reader users won't know what this menu is for (blocking seats) without additional context.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/booking/GhostSeat.jsx:6-23. The BlockMenu container (line 6) lacks role="menu" and aria-label; child buttons (line 15) lack role="menuitem".
  fix: Add role="menu" aria-label="Block seats" to the BlockMenu container div at line 6.
  impact: Screen reader users understand the menu's purpose (blocking seats) before hearing individual button labels.

[75] [Minor] [Accessibility semantics] BookingStatusBar radiogroup missing keyboard support for arrow keys within modal  (Accessibility; All)
  desc: BookingStatusBar.jsx (line 11-14) has role="radiogroup" with role="radio" buttons, which is correct semantically. However, there's no onKeyDown handler for arrow-key navigation. ARIA radiogroup pattern typically requires ArrowLeft/ArrowRight to cycle through radio options, with screen readers announcing the selection. The current buttons rely only on click/Space/Enter.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/modals/booking-detail/BookingStatusBar.jsx:11-27. Buttons have role="radio" with onClick but no arrow-key handlers in a radiogroup context.
  fix: Add onKeyDown handler to the radiogroup div to detect ArrowLeft/ArrowRight and cycle to the previous/next status button, calling its onClick.
  impact: Screen reader and keyboard-only users can navigate status options with arrow keys, matching standard radiogroup UX.

[76] [Minor] [Accessibility semantics] Keyboard shortcuts menu dialog not flagged with aria-modal  (Accessibility; All; QUICK-WIN)
  desc: AppToolbar.jsx line 220 renders the keyboard shortcuts menu as role="dialog" without aria-modal="true". True modal dialogs should have aria-modal="true" to tell assistive tech that it's modal. Since this is a non-modal popover (doesn't trap focus), either aria-modal should be removed or the role should be changed (see earlier finding). Current state is inconsistent.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/layout/AppToolbar.jsx:220. Div with role="dialog" but no aria-modal.
  fix: Either (a) remove role="dialog" and use role="region" or no role, OR (b) add aria-modal="false" to clarify it's not modal. Recommend (a) since it's not a true dialog.
  impact: Clearer semantic meaning for assistive technologies about the interactive nature of the shortcuts menu.

[77] [Minor] [Appointment detail modal] Focus management on modal open doesn't trap focus on small phones  (Accessibility; iPhone)
  desc: AccessibleModal (L89) uses FocusScope with contain restoreFocus autoFocus, which should trap focus. However, on small phones where the modal is full-screen (ModalShell.jsx L37: max-sm:h-[100dvh] max-sm:rounded-none), the modal's entire viewport is occupied, making focus trapping less obvious. If the header or footer is not always visible due to the modal's scrollable body, staff may tab through the body content and find themselves unable to reach the footer actions without scrolling, creating a confusing focus journey.
  evidence: AccessibleModal.tsx:89 (FocusScope with contain); ModalShell.jsx:37 (max-sm:h-[100dvh]); ModalShell.jsx:43 (overflow-y-auto body). Issue: confusing focus wrap order, not unreachability.
  fix: Ensure the footer actions are always reachable via Tab, even when scrolling. Add tabindex='0' to the body's overflow container or use JavaScript to ensure Tab from the last body element jumps to the first footer button. Alternatively, document the focus order expectation for users of screen readers.
  impact: Improves keyboard navigation for staff using screen readers or keyboard-only on mobile, ensuring all actions are reachable.

[78] [Minor] [Appointment detail modal] Autosave may overwrite manual edits if both fire simultaneously  (Functionality; All)
  desc: BookingDetailModal uses autosave (L243-247) with a 2-second debounce, and also has a manual Save button (BookingActions). If staff make an edit (e.g. change service), the autosave timer starts. If staff then click Save before the autosave fires, two concurrent async operations (handleSave from useBookingSave and autosaveFn from useAutosave) may both attempt to update the booking. Depending on the order of completion, one update may overwrite the other, or the booking may be saved with stale data if handleSave completes before autosaveFn.
  evidence: BookingDetailModal.jsx L219-241 (autosaveFn defined); L243-247 (useAutosave called); L195-217 (handleSave from useBookingSave); no mutual exclusion or queue mechanism between the two save paths.
  fix: Disable autosave when saving is in progress. Add a check in useAutosave: `if (saving) return;` at the start of the effect. Alternatively, add a flush() call before handleSave to ensure autosave completes first: in BookingActions, call `autosaveRef.flush()` before onSave().
  impact: Prevents race conditions and data corruption from concurrent writes, ensuring data consistency.

[79] [Minor] [Appointment detail modal] Exit confirmation modal has no visual distinction from regular action dialogs  (Visual; All; QUICK-WIN)
  desc: The ExitConfirmDialog (src/components/modals/booking-detail/ExitConfirmDialog.jsx) presents unsaved-changes warnings using the same visual weight and styling as other modals. The 'Discard' button uses brand-coral text on white background, but the modal itself lacks a visual warning indicator (e.g. an alert icon, warning tint, or a subtle amber/red-tinted border). The title 'Discard changes?' is in regular 16px font-bold, not escalated visually. For staff working quickly through multiple bookings, the distinction between 'save this booking then close' and 'discard unsaved changes and close' may not be immediately clear.
  evidence: ExitConfirmDialog.jsx L1-34 (uses AccessibleModal with white bg, no warning tint or alert icon); BookingDetailModal.jsx L173-176 (modal opens when isEditing and handleCloseAttempt is triggered); compare to ConfirmDeleteModal.jsx L45, which uses a dedicated z-index 1300 and distinct styling.
  fix: Add a visual warning indicator: (1) Add a subtle amber or orange left-border or top-border to the modal; (2) Prepend an AlertTriangle or Warning icon to the title; (3) Use a slightly warmer background tint (e.g. bg-amber-50 instead of pure white) to signal caution. Keep the button colours as-is.
  impact: Makes destructive intent more obvious, reducing accidental data loss and improving staff confidence in the modal's purpose.

[80] [Minor] [Appointment detail modal] Price display in header disappears during edit, removing payment-status context  (Visual; All)
  desc: BookingHeader renders the price and payment status (L65-89) only in view mode (`!isEditing`). When staff enter edit mode, the price/payment section vanishes entirely from the header. Staff are then editing services, add-ons, and payment status in the Services & Payments cards below, but they lose the header-level context showing the previous appointment value. For a £60 booking changing to a £40 service, staff may not immediately notice the price change because it's buried in the card below rather than prominently visible alongside the title.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/modals/booking-detail/BookingHeader.jsx:132 (price hidden on !isEditing); /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/modals/BookingDetailModal.jsx:165 (pricing uses booking.service instead of editData.service); /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/modals/booking-detail/ServicesAddonsCard.jsx:43-77 (edit mode has no pricing display)
  fix: Keep the price display visible in the header during edit mode, but grey it out or mark it as 'previous price' (e.g. 'Was: £60'). Add a second line showing the 'New price' or 'Total Due' calculated from the current editData (using the pricing object passed to the header). This gives staff immediate visual feedback on pricing impact.
  impact: Improves pricing transparency during editing, reducing billing errors and staff confusion about the final amount due.

[81] [Minor] [Bookings / daily schedule] Dog-name button truncates without fallback on ultra-narrow widths  (Functionality; iPhone)
  desc: The dog-name button has max-w-[70%] with text-ellipsis, but on phones < 300px wide (iPhone 5/SE in landscape, or narrow split-view), the name may disappear entirely, leaving only the size dot. The breed truncates second (min-w-0), so staff see neither name nor breed on very narrow widths. No fallback affordance (e.g., a 'details' icon) is present to indicate there's more info.
  evidence: src/components/booking/BookingCardNew.jsx:296 (dog-name button with max-w-[70%], text-ellipsis, shrink-0); lines 303-372 (4 icon elements with shrink-0); line 375 (breed with min-w-0, truncate); line 378 (service with ml-auto, shrink-0). src/components/booking/SlotGrid.jsx:162 (rowGrid template grid-cols-[64px_1fr], booking card takes 1fr).
  fix: On phones, move service name below the name/breed line, or hide it behind the dog-name button (already a click target). Consider using a '…' icon or subtle visual indicator when name is truncated. Test at 280px viewport width.
  impact: Ensures dog booking identity is always discoverable on narrow devices; prevents accidental booking of wrong dog.

[82] [Minor] [Bookings / daily schedule] Slot row menu button doesn't convey 'fully booked' until hover  (Layout; All; QUICK-WIN)
  desc: The SlotRowMenu button (time box) only changes text color to brand-purple when there's a booking in that row (hasBooking). When a slot is fully booked but empty of bookings yet (e.g., 4 different dogs in 4 seats), the time text stays slate-400, giving the visual impression the slot is empty. Hovering reveals the 'fully booked, open slot actions' aria-label, but sighted staff don't see a 'full' badge or colour change until they inspect.
  evidence: src/components/booking/SlotRowMenu.jsx:71 (isFullyBooked definition), :135-140 (text color using hasBooking); src/components/booking/SlotGrid.jsx:128 (hasBooking definition)
  fix: Extend the color logic to: if fully booked, use a distinct color (e.g., brand-coral or text-rose-600) to signal 'full, override available'. Store `isFullyBooked` flag in SlotRowMenu props and use it in the className condition.
  impact: Speeds visual scanning of the day: staff instantly know which slots have capacity and which are full. Reduces accidental overbooking attempts.

[83] [Minor] [Bookings / daily schedule] Capacity bar hides on phones; percentage-only readout on narrow width  (Layout; iPhone/iPad)
  desc: BookingGridControls hides the capacity bar (progress bar) on screens < 640px (sm breakpoint), showing only the pill with 'N/N' or 'N dogs'. On iPad portrait or iPhone landscape, the bar reappears, but on phone portrait, staff see only '5/14' without the visual bar. This removes the at-a-glance visual signal: a full bar (rose) vs. a partial bar (amber/green). The numeric ratio alone is less visceral and harder to parse during a busy day.
  evidence: src/components/dashboard/BookingGridControls.jsx:58-75 — `hasCap && ( <span ... className="hidden sm:inline-flex ...">` wraps the bar and percentage. The pill (line 33) shows the count on all widths, but the progress bar is display:none on phones.
  fix: Show a thin, compact capacity bar on phones (height: 1px or 1.5px instead of 1.5/6px) with the percentage tucked below or beside it. Or use a small pie/donut icon on the pill to convey capacity visually. Verify readability at 375px viewport.
  impact: Restores visual capacity signal on phones; makes overbooking risks more obvious before tapping 'Book'; speeds staff decision-making.

[84] [Minor] [Bookings / daily schedule] Slot-grid row alternation (even-row tint) too subtle on light backgrounds  (Visual; All; QUICK-WIN)
  desc: SlotGrid applies bg-sky-50/60 to even-index rows for visual anchor (line 220), but on light backgrounds (the whole page is already slate-50), the tint barely registers. Sighted staff scanning vertically may lose place mid-column. The subtlety was intentional (design intent to avoid busyness), but usability testing often shows staff prefer slightly stronger alternation (bg-sky-50 or bg-sky-100) for long schedules.
  evidence: src/components/booking/SlotGrid.jsx:133 — `const rowBg = index % 2 === 0 ? "bg-sky-50/60" : "bg-white";`. The 60% opacity (alpha: 0.6) combined with a light sky-blue creates ~98% similarity to the surrounding slate-50 page background.
  fix: Increase opacity to bg-sky-50/80 or use bg-sky-100/50. A/B test with staff to find the right balance: enough contrast to follow the row, not so much it looks zebra-striped. Consider also testing with a lighter teal or cyan instead of sky.
  impact: Reduces eye fatigue and lost-place errors during long booking sessions; supports staff with low vision or attention challenges.

[85] [Minor] [Bookings / daily schedule] Blocked seat cell icon (#circle-with-slash) is not universally recognized  (Visual; All; QUICK-WIN)
  desc: The BlockedSeatCell renders a custom SVG circle-with-slash icon plus the label 'Blocked' (or 'Unblock' on hover). The icon is presentational and doesn't clarify *why* the seat is blocked (staff-blocked vs. system-blocked due to large-dog rules). The 'Blocked' label is small (10px) and the text-slate-600 colour may not stand out enough against bg-slate-50 (contrast ~2.6:1).
  evidence: src/components/booking/BlockedSeatCell.jsx:12 (text color inherited from parent), line 20-23 (span with no explicit color); the actual color is text-slate-400 (not text-slate-600 as claimed). See also src/components/booking/SlotGrid.jsx:175-195 for the two distinct blocked states and the system-blocked 'Closed' rendering at lines 183-195 with text-slate-600.
  fix: Add a tooltip or aria-label clarifying *why* the seat is blocked (e.g., 'System-blocked: large dog reserved' or 'Staff-blocked'). Increase text colour to text-slate-700 or text-slate-800 for better contrast. Consider adding a small info icon (i) to signal the distinction.
  impact: Reduces confusion when staff see blocked seats; enables faster re-booking decisions.

[86] [Minor] [Contrast / WCAG AA] Brand yellow text (#FECC13) is unreadable on white backgrounds  (Visual; All; QUICK-WIN)
  desc: Any text rendered in brand-yellow (#FECC13) on a white background has a contrast ratio of only 1.52:1, far below the 4.5:1 minimum. This affects section labels and decorative text. While the yellow is primarily used as a background fill for buttons, instances exist where it appears as text (e.g., slot row menu headers).
  evidence: src/components/auth/ResetPasswordPage.jsx:146 and src/App.jsx:257 both use `text-brand-yellow` on white background for the "Dog" portion of the logo wordmark "SmarterDog". Contrast: #FECC13 on #FFFFFF = 1.52:1 (fails WCAG AA 4.5:1 threshold). The SlotRowMenu.jsx:169 evidence cited is incorrect—that yellow text sits on the dark purple menu background (#2D004B), yielding 11.43:1 contrast, which is excellent.
  fix: Never use brand-yellow as text on white/light backgrounds. Reserve it for backgrounds and icons. For text, use brand-purple or a dedicated ink token. If yellow accent text is needed for emphasis, use brand-yellow-dark (#D4A500) which achieves ~7:1 on white.
  impact: Any staff member trying to read yellow text on white will struggle, especially under suboptimal lighting or on smaller screens. Primarily a decorative issue, but violates WCAG AA if text content relies on it.

[87] [Minor] [Contrast / WCAG AA] Muted slate-400 text lacks sufficient contrast in secondary contexts  (Visual; All; QUICK-WIN)
  desc: While slate-500 (#64748B) meets the 4.5:1 threshold on white backgrounds, slate-400 (#CBD5E1) appears in secondary text contexts (e.g., 'Add-on' labels in ServicesAddonsCard, empty state text in modals) with only 1.47:1 contrast. These secondary labels are harder to distinguish and may be missed by staff.
  evidence: src/components/modals/booking-detail/ServicesAddonsCard.jsx:91, 94 uses 'text-slate-400' for add-on descriptors. Same pattern in PhotoGalleryModal.jsx, PhotoLightbox.jsx line 114 ('Tap to add notes'). Contrast: #CBD5E1 on #FFFFFF = 1.47:1.
  fix: Use text-slate-500 (#64748B) or text-slate-600 (#475569) for all secondary text, not slate-400. The codebase already documents slate-500 as 'accessible muted grey' in index.css:187. Replace all 'text-slate-400' instances used for readable content with 'text-slate-500'.
  impact: Improves scannability of booking cards and modal content. Currently staff might miss important metadata (e.g., 'Add-on' labels, placeholder guidance) due to poor contrast. Minor impact since these aren't critical to core tasks, but cumulative usability issue.

[88] [Minor] [Dogs directory] AddDogModal: custom breed input not labeled when breed 'Other' selected  (Accessibility; All; QUICK-WIN)
  desc: When a user selects 'Other' from the breed dropdown, a second input field appears to capture a custom breed name. This input has aria-label='Custom breed' but no visible label text. This makes the field purpose unclear in visual context, especially on mobile where space is tight.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/modals/AddDogModal.jsx:260-268 — line 265 shows aria-label but no rendered label, field appears abruptly below the breed select
  fix: Add a visible label above or inside the custom breed input (e.g., <label>Custom breed name</label>) or change placeholder to 'Enter custom breed...' for visual reinforcement
  impact: Users (sighted and screen reader) have clear context for the dynamic field; improves usability on narrow viewports

[89] [Minor] [Dogs directory] Unarchive button touch target too small on mobile (32px × 16px padding)  (Accessibility; iPhone/iPad; QUICK-WIN)
  desc: The 'Unarchive' button on archived dog cards uses px-2 py-0.5 (8px × 4px padding), creating a total touch target of ~36px width × ~20px height. WCAG 2.5.5 Level AAA recommends 44×44px minimum for touch targets. The small button is easily mis-tapped on touch devices, particularly for users with motor impairments.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/views/DogsView.jsx:110 — className='... px-2 py-0.5 ...' on absolute positioned button in the card's top-right corner
  fix: Increase padding to px-3 py-1 (12px × 8px, total ~44px × 28px) or restructure the button to meet a larger target area; consider moving to a card action menu on mobile
  impact: Users with touch devices and motor impairments can reliably tap the unarchive button without accidental misfires

[90] [Minor] [Dogs directory] WhatsApp button (OwnerContact) smaller than recommended touch target  (Accessibility; iPhone/iPad; QUICK-WIN)
  desc: The WhatsApp icon button in owner contact details uses w-6 h-6 on desktop (24px) and w-9 h-9 on mobile (36px). While the mobile target is closer to the 44×44px guideline, 36×36px still falls slightly below. On desktop, 24px is significantly undersized for touch-friendly interaction (though it functions on click).
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/views/DogsView.jsx:170
  fix: Increase mobile touch target to w-10 h-10 (40px) or add extra padding to reach 44×44px CSS box size; or use a soft background hover state to make the target feel larger
  impact: Touch users (especially on iPhone) can reliably open WhatsApp without struggling to hit the small icon

[91] [Minor] [Dogs directory] Missing 'Search' button or submit affordance for screen readers  (Accessibility; All; QUICK-WIN)
  desc: The search input (line 489) has an onChange handler that calls onSearch immediately on each keystroke. Sighted users see the icon inside the input field as a 'search affordance', but screen reader users have no button or submit affordance announced. The input is not wrapped in a <form>, so pressing Enter does nothing except add a newline (type='text' default).
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/views/DogsView.jsx:489-495 (input element, line 490: type="text" should be type="search")
  fix: Wrap the search input in a <form onSubmit={(e) => { e.preventDefault(); /* search already happens on onChange */ }}>. Alternatively, add a hidden <button type='submit'> or announce via aria-label='Search submitted on each keystroke (live results)'.
  impact: Screen reader users understand that search is live and always active; keyboard users can use Enter to re-trigger search if needed

[92] [Minor] [Dogs directory] No loading state indicator during pagination (infinite scroll)  (Functionality; All)
  desc: The infinite-scroll sentinel (line 691) triggers loadMore silently in the background. While the loadingMore flag exists, there's no visual feedback (spinner, skeleton rows, or disabled state on the 'Load more' button during auto-pagination). Users don't know if the page is loading or if it's finished, potentially leading to duplicate taps or perceived hangs.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/views/DogsView.jsx:449-461 — IntersectionObserver calls handleLoadMore without announcing state. Line 725–731 shows Button with loading prop, but this is only visible if the user manually clicks 'Load more' (not auto-scroll).
  fix: Add a small skeleton row, spinner, or 'Loading more...' text at the end of the list while loadingMore is true (during auto-scroll). Announce the state via aria-live='polite' for screen readers.
  impact: Users understand that pagination is in progress during auto-scroll; screen reader users are notified of new content arrival

[93] [Minor] [Dogs directory] Director RPC pagination may cause gaps in A–Z index if partial pages fetched  (Functionality; All)
  desc: The availableLetters set is computed from the server-side directory RPC results. If pagination is offset and the backend returns dogs starting mid-alphabet (e.g., page 5 only returns M–Z), the A–I letters will be marked as unavailable (disabled) even though they exist in the full dataset. Users jump to a disabled letter, get no results, and assume no dogs start with A.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/supabase/hooks/useDogs.ts:208 (the setDogAvailableLetters call that replaces instead of merges) and /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/supabase/migrations/20260608150000_search_dogs_directory_rpc.sql:112-124 (showing the RPC computes letters from entire filtered set, which masks the client-side bug)
  fix: Document this in comments or merge availableLetters from all loaded pages (not just the current page). Alternatively, recompute availableLetters from the full displayList client-side.
  impact: A–Z navigation remains accurate regardless of pagination state; users don't encounter false 'no matches' scenarios

[94] [Minor] [Dogs directory] List view layout breaks on mobile when alert chip is present  (Layout; iPhone/iPad; QUICK-WIN)
  desc: In list view, when a dog has alerts, the AlertChip sits inline next to the dog's name and 'Incomplete' badge in a flex row. On narrow (sm) screens, the chip can wrap unpredictably or truncate the dog name because the row uses max-w-[45%] on the chip. The layout doesn't gracefully stack on phones.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/views/DogsView.jsx:211-219 — line 219 uses max-w-[45%] on AlertChip in a flex row, no responsive stack on mobile
  fix: Wrap the first-row content (name, badge, alert) in a flex-col container at mobile (sm:flex-row for tablet+), so alert moves below the name on phones
  impact: List items remain readable on narrow screens; dog names no longer compete for space with alert chips

[95] [Minor] [Dogs directory] Desktop A–Z rail sticky positioning conflicts with top-24 offset and variable header height  (Layout; Desktop)
  desc: The sticky A–Z rail uses top-24 (96px offset) to sit below the header. However, the header height varies based on content (banner with flex-wrap, filter row below). If the search icon or filter buttons wrap on certain viewport sizes (e.g., 1280px xl with a wide sidebar), the rail's top position becomes misaligned and may overlap the filter controls or sit too high.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/views/DogsView.jsx:700 — sticky top-24 on desktop rail; header layout at lines 471–505 uses flex-wrap which can change height
  fix: Replace fixed top-24 with a CSS custom property or use JavaScript ResizeObserver to measure actual header height and set the rail's top dynamically, or restructure the header to have a fixed height
  impact: A–Z rail stays perfectly aligned below the header regardless of search/filter button wrapping; no overlap or gaps

[96] [Minor] [Dogs directory] Empty state search query text can overflow on narrow viewports  (Layout; iPhone; QUICK-WIN)
  desc: When a search returns no results, the empty state shows: 'No dogs found matching "{searchQuery}"'. If the search query is long (e.g., 50+ characters), the quoted text can overflow the 320px iPhone viewport because the EmptyState uses max-w-sm (24rem = 384px) for the title, but the container padding and the quote marks are not accounted for on narrow screens.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/ui/EmptyState.jsx:30 — title `<p>` element has NO max-width constraint; /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/views/DogsView.jsx:674 — searchQuery can grow unbounded in the dynamic title string; /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/ui/PageShell.jsx:2 — AppFrame uses px-4 on mobile, leaving ~331px available after 12px of inner padding on narrow screens
  fix: Truncate searchQuery in the empty state title (e.g., take first 30 chars + '...') or wrap it in a <span className='break-words'> to allow word wrapping. Add a max-w-full override at mobile.
  impact: Empty state messages remain readable on iPhone 5 / SE and other narrow screens without text overflow

[97] [Minor] [Humans directory] Alphabet rail letters remain visible but visually disabled at 2.5rem width  (Accessibility; Desktop; QUICK-WIN)
  desc: The AlphabetRail sticky on desktop (md:flex) uses `w-6 h-6` buttons, but the rail itself is wrapped in a `bg-white/80 backdrop-blur-sm rounded-full` container that shows the full alphabet even when letters have no matches. Disabled letters use `text-slate-300` (low contrast), making it unclear they're non-interactive. On a long list with a narrow name distribution, most letters appear disabled, cluttering the interface with 20+ greyed-out affordances.
  evidence: HumansView.jsx:667–673 — rail layout with sticky positioning. Line 38–44 shows disabled button styling uses `text-slate-300` (contrast ~2:1 against white background).
  fix: Filter the disabled letters from the rail entirely: modify AlphabetRail to conditionally render only letters in `availableLetters` (plus the current active letter for context). A numeric badge (e.g., '15/27 letters') could indicate what's hidden.
  impact: Rail becomes a focused, accessible navigation tool. Reduces visual noise. Improves keyboard navigation (fewer disabled buttons to Tab through).

[98] [Minor] [Humans directory] AddHumanModal focus ring hard to see on teal header background  (Accessibility; All; QUICK-WIN)
  desc: The close button (×) in the AddHumanModal header has `focus-visible:ring-white/80` on a teal gradient background. The ring will have ~2.1:1 contrast against the darker teal side of the gradient, making keyboard focus ambiguous for users navigating with Tab.
  evidence: AddHumanModal.jsx:160 — `focus-visible:ring-2 focus-visible:ring-white/80` on a button inside a header with `background: linear-gradient(135deg, var(--color-brand-teal), var(--color-brand-teal-dark))`.
  fix: Use `focus-visible:ring-white` (no opacity) or add a dark outline for contrast: `focus-visible:ring-brand-yellow` (which stands out on teal). White/80 will be barely visible on the dark teal; full white is safer.
  impact: Keyboard users can clearly see which button has focus, even on coloured backgrounds.

[99] [Minor] [Humans directory] Humans directory footer 'Show archived' button lacks focus styling on light bg  (Accessibility; All; QUICK-WIN)
  desc: The 'Show archived' button (line 688–694) is a link-styled button on a white/light background with no explicit focus-visible ring. It uses the default button focus styling, but the button itself is `border-none` and `bg-transparent`, making the focus outline hard to see against the slate-500 text.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/views/HumansView.jsx:691 (button className lacks focus-visible utilities, while directory cards at lines 189 and 238 explicitly include focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow-dark)"
  fix: Add explicit focus styling: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-yellow-dark` (matching the directory card pattern).
  impact: Keyboard users can see which button has focus in the footer.

[100] [Minor] [Humans directory] DogChips component missing screen-reader context for overflow count  (Accessibility; All; QUICK-WIN)
  desc: When DogChips shows '+N more dogs', the `+` indicator (line 106 in HumansView.jsx) is just text with no aria-label or semantic context. Screen readers announce it as a disconnected number, not as 'N additional dogs'. The component is marked as purely presentational in the comment (line 138: 'Decorative for screen readers'), but this is incorrect — the overflow count is meaningful information.
  evidence: src/components/views/HumansView.jsx:105-107 (not line 138 which is in the SizeLegend component)
  fix: Add an aria-label: `<span aria-label={`${overflow} more dog${overflow === 1 ? '' : 's'}`} className="...">+{overflow}</span>`
  impact: Screen readers announce the overflow count contextually. Improves clarity for assistive technology users.

[101] [Minor] [Humans directory] Sort control persists across search/filter resets; no visual indication  (Functionality; All; QUICK-WIN)
  desc: The sort mode (First name / Surname) is visible in the toolbar when `showRailAndSort` is true (online + not archived, line 467). However, if staff sorts by surname, then searches, the sort mode is still active but the visual state isn't reset. If they then clear the search, they may be surprised the results are still sorted by surname rather than the default. There's no visual reminder that sort is 'sticky' across searches.
  evidence: HumansView.jsx:467 — `showRailAndSort = online && !showArchived`. Sort button (lines 542–559) is only shown in this mode, but `sortMode` is persisted in the parent and never reset on search.
  fix: Either: (1) reset sort to 'first' when search is initiated, OR (2) add a subtle badge to the sort control (e.g., 'Sort: Surname') to indicate an active override. Consider the UX expectation: most users expect search to 'focus' the view, not preserve sort.
  impact: Reduces surprise and supports predictable, discoverable search behavior.

[102] [Minor] [Humans directory] AddHumanModal dog search doesn't debounce; instant API calls on every keystroke  (Performance; All)
  desc: The dog search input (AddHumanModal.jsx:245–252) updates state directly on every keystroke with `onChange={(e) => setDogQuery(e.target.value)}`. The `dogSearchResults` useMemo (line 44) filters the local dogs array synchronously, which is fine. However, if a future change adds server-side search (e.g., to handle 1000+ dogs), every keystroke would trigger an API call. Currently the search is client-side only, which is safe, but the pattern is fragile.
  evidence: src/components/modals/AddHumanModal.jsx:248 (setDogQuery onChange handler); lines 44-55 (dogSearchResults useMemo with sync filter). Compare to src/supabase/hooks/useDogs.ts:311-318 (searchDogs callback with 300ms debounce).
  fix: Wrap the `setDogQuery` in a `useCallback` debounce utility (e.g., `debounce(setDogQuery, 300ms)`) to prepare for future server-side search. This costs nothing now (client-side filter is fast) but prevents surprises if the data grows.
  impact: Future-proofs the search UX; if dog count reaches 10K+, debounce is already in place.

[103] [Minor] [Humans directory] List mode email truncation hides domain; no hover tooltip  (Visual; iPad/iPhone; QUICK-WIN)
  desc: In list view, the email is shown as `· {email}` with `truncate` (line 219), and only on small screens. On narrow devices, a typical email like 'sarah.jones@company.co.uk' becomes 'sarah.jo...'. The email is not wrapped in a link or title attribute, so there's no way to read the full address. The grid card (line 272) wraps the email in a mailto link with no tooltip either.
  evidence: HumansView.jsx:219 — `{human.email && <span className="truncate text-slate-400">· {human.email}</span>}`. No title or aria-label. Line 272 in grid mode has the same issue without title.
  fix: Add `title={human.email}` to both the list span (line 219) and the grid card link (line 273). This provides a native tooltip on hover and a screen-reader label.
  impact: Users can see the full email address on hover (desktop) or via screen reader. Mobile users still need to open the profile to see the full email, but the truncation is at least transparent.

[104] [Minor] [Humans directory] Empty state messaging doesn't distinguish 'no results' from 'no archived humans'  (Visual; All; QUICK-WIN)
  desc: Line 640–657 shows an EmptyState when `displayList.length === 0`. The message changes based on context (archived vs. search), but the icon (🗄️ for archived, 🔍 for search) relies on emoji, which don't have consistent rendering across devices. Emoji rendering is out of scope for a professional dashboard, especially when dealing with structured data.
  evidence: HumansView.jsx:643–649 — `icon={showArchived ? "🗄️" : "🔍"}`. Emoji are not locale-aware or accessible.
  fix: Replace emoji with a named icon component (e.g., `<Archive />` or `<Search />` from lucide-react, already imported). This ensures consistent rendering and can be styled for accessibility.
  impact: EmptyState appears professional and consistent. Icon meaning is clear regardless of device.

[105] [Minor] [Humans directory] DogChips overflow indicator (+N) truncates without context on narrow screens  (Visual; iPhone/iPad; QUICK-WIN)
  desc: DogChips displays up to 4 dogs on a card (line 296) and shows '+N' if more exist. On a narrow mobile screen, even with flex-wrap, the space may be so tight that all dogs are hidden and only '+3' shows. The user has no idea what dogs are being hidden — they must open the profile to see the full list.
  evidence: HumansView.jsx:296 — `<DogChips dogs={humanDogs} max={4} dim={16} />`. Component line 106 shows `+{overflow}` with no label. Line 295 uses `max-h-[26px]` which can clip the chips.
  fix: Either: (1) add an aria-label to the overflow indicator: `aria-label="${overflow} more dogs"`, OR (2) show at least the first dog's name (e.g., 'Bella +2 more'). On mobile, consider reducing max to 2 dogs to give more room.
  impact: Users have a sense of which dogs are associated without opening the profile. Screen readers announce the count.

[106] [Minor] [Humans directory] Duplicate human warning uses amber styling; not aligned with error/alert palette  (Visual; All; QUICK-WIN)
  desc: The duplicate customer warning (AddHumanModal.jsx:294) uses `bg-amber-50 border border-amber-200 text-amber-900` — Tailwind's amber palette. This is inconsistent with the brand's alert styling elsewhere. The app uses brand-coral (#E7546C) for warnings and alerts (e.g., InlineError.jsx, NotesPanel.jsx). The amber warning looks out-of-place and may confuse users about severity (amber ≠ the brand's alert colour).
  evidence: AddHumanModal.jsx:294 — `role="alert" className="...bg-amber-50 border border-amber-200 text-amber-900"`. Compare to InlineError.jsx:10 which uses `bg-brand-coral-light text-brand-coral`.
  fix: Change amber to brand-coral-light: `bg-brand-coral-light border border-brand-coral/20 text-brand-coral-text`. This aligns with the app's alert language and makes severity consistent.
  impact: Visual hierarchy and alert semantics are immediately recognizable. Consistent design language.

[107] [Minor] [Microcopy & empty/loading/error states] SearchingInbox has generic empty state with no clear recovery path  (Functionality; All; QUICK-WIN)
  desc: When the inbox conversation list filter returns zero results (e.g., 'Closing soon' filter with no closing conversations), the message says 'No conversations match [filter].' with a link to 'Show all conversations', but staff must click the link. A faster UX would highlight the filter chip with a clear/dismiss affordance or auto-offer a 'Show all' action.
  evidence: src/components/views/inbox/InboxView.jsx:637-649 (correct range). Specific button at lines 642-648 styled as: className="underline text-brand-purple hover:text-brand-purple-light font-semibold" — an underlined text link, not a prominent button, but NOT indistinguishable from body text due to color, weight, and underline contrast.
  fix: Upgrade the recovery affordance: add a visually distinct button (e.g., 'Clear filter' styled like ErrorBanner's retry button) that calls setListFilter('all'). Move it above or beside the text so it's not hidden at the end of a sentence.
  impact: Staff can recover from a filtered-empty state faster, reducing cognitive load during triage workflows.

[108] [Minor] [Microcopy & empty/loading/error states] DogSearchSection 'No dogs found' has no 'Try again' or 'Clear search' action  (Functionality; All; QUICK-WIN)
  desc: When a user searches for a dog in the booking modal and gets zero results (lines 332-342), the panel shows 'No dogs found matching "[query]"' and offers 'New Dog' and 'New Human' CTAs, but doesn't offer a 'Clear search' or 'Try different keywords' hint. Users may not think to clear the search box.
  evidence: src/components/modals/new-booking/DogSearchSection.jsx lines 332-342: Shows the text and two CTA buttons but no 'Clear search' affordance or hint text like 'Try searching by owner name or breed'.
  fix: Add a third subtle button or link below the CTAs: 'Clear search and try again'. Alternatively, add a hint line: 'Tip: search by owner name or breed.' This mirrors the helpful messaging in DogsView line 681.
  impact: Users know how to recover from a failed search and are nudged toward working search strategies.

[109] [Minor] [Microcopy & empty/loading/error states] No loading state for async data in HumanCardModal's dog list  (Functionality; All)
  desc: When HumanCardModal loads a human's dog list (via ensureDogsForHumans), the list may temporarily show no dogs while data fetches. There's no skeleton or 'Loading…' placeholder, so the card appears to have no dogs until the fetch completes.
  evidence: src/components/views/HumansView.jsx lines 85-110 (DogChips component) and lines 427-430 (useEffect hook). When dogsByHumanId is being populated, the component renders empty without a loading indicator.
  fix: Add a loading state to DogChips: if (dogList.length === 0 && isLoading) show a SkeletonCircle or short SkeletonText stub (e.g., 3-4 skeleton chips). Pass an isLoading prop from the parent.
  impact: Staff won't see an unexpected 'No dogs' state that clears after a moment, reducing confusion about data freshness.

[110] [Minor] [Microcopy & empty/loading/error states] No loading state when ArchivedDogs modal is fetching the archived list  (Functionality; All; QUICK-WIN)
  desc: DogsView allows toggling a 'Show archived' button (line 721) which fetches archived dogs (lines 377-386). During the fetch, the UI shows 'Loading archived…' as italic text (line 644) but not as a visually prominent skeleton or spinner. Staff may not realise data is loading.
  evidence: src/components/views/DogsView.jsx lines 642-645: When showArchived && archivedList === null, renders `<div className="py-12 text-center text-body text-slate-500 italic">Loading archived…</div>` — subtle and easy to miss.
  fix: Use a CardGridSkeleton or a more prominent placeholder for the archived list during load. Make it visually similar to the initial-load skeleton (line 641) so staff recognise the pattern.
  impact: Loading state is immediately recognisable and staff won't think the interface is broken.

[111] [Minor] [Microcopy & empty/loading/error states] Inconsistent loading state microcopy across modals and panels  (Visual; All)
  desc: Loading states use different microcopy across the app: 'Loading...', 'Loading dog profile…' (with en-dash), 'Loading archived…' (with ellipsis), 'Loading metrics', etc. No consistent pattern. Some use italics, others don't. Tone varies from generic tech-speak to context-specific.
  evidence: src/components/modals/dog-card/DogCardFallbacks.jsx:18 'Loading dog profile…', src/components/views/DogsView.jsx:644 'Loading archived…', src/components/ui/LoadingSpinner.jsx:5 'Loading...', src/components/modals/new-booking/DogSearchSection.jsx:242 'Searching...', src/components/components/views/inbox/InboxView.jsx:633 inline loading, ReportsView.jsx:112 SkeletonKpiRow with generic aria-label.
  fix: Create a loading-state microcopy guide in comments above the state components. Standardise to: 'Loading [feature]…' (with en-dash, not 3 dots). Use aria-label consistently: 'Loading <specific noun>' (not 'Loading' alone). Update LoadingSpinner.jsx L5 comment to include the tone guide.
  impact: Consistent, professional-sounding loading feedback that feels intentional rather than ad-hoc.

[112] [Minor] [Microcopy & empty/loading/error states] Empty state for 'No human on file' in DogSearchSection is buried in a dropdown  (Visual; All; QUICK-WIN)
  desc: In the new-booking dog search modal, if a dog has no owner assigned, the picker shows 'No human on file — tap to continue' at line 285. This is low-contrast (text-slate-500, italic) and doesn't stand out from regular owner options. Staff may miss it and think the dog has no valid owner.
  evidence: ""
  fix: Add a subtle background badge or alert styling to the 'No human on file' row. Style it similar to the SkeletonBlock placeholder (lines 312-314) with a light yellow or amber background and bold text to signal it's a special state.
  impact: Staff more quickly recognise and intentionally select dogs with no owner, reducing data-quality issues.

[113] [Minor] [Microcopy & empty/loading/error states] ErrorBanner title is always generic — no contextual variation for different error types  (Visual; All; QUICK-WIN)
  desc: ErrorBanner defaults to 'Something went wrong' (line 7) which is cold and vague. While callers can override the title (DogsView:630 uses 'Couldn't load the dogs directory'), the component doesn't guide callers toward warm, specific titles. This inconsistency leaves some errors feeling generic.
  evidence: src/components/ui/ErrorBanner.jsx line 7: default title='Something went wrong'. Callers vary: DogsView.jsx:630 'Couldn't load the dogs directory', BookingMainPanel.jsx:82 'Couldn't load today's bookings', ReportsView.jsx:120 'Couldn't load reports right now', HumansView.jsx:603 'Couldn't load the humans directory'. App.jsx:598 relies on the default generic title. No component-level guidance or type-safe error messages. (Note: InboxView does not exist in codebase; evidence file path was incorrect.)
  fix: Add a JSDoc comment at the top of ErrorBanner showing example titles for common scenarios: 'Couldn't load [noun]', 'Network error — please check your connection', etc. Suggest a warm opening phrase like 'We' or 'I' rather than 'Something'. Update the default title to 'We encountered an issue' instead of 'Something went wrong'.
  impact: Error messages feel more intentional and empathetic, building trust with staff.

[114] [Minor] [Microcopy & empty/loading/error states] DogsView footer 'Searching...' is generic and doesn't indicate what's being searched  (Visual; All; QUICK-WIN)
  desc: When staff search dogs, the footer text (line 709) shows 'Searching...' in italics. This is vague — users don't know if they're searching by name, breed, owner, or all three. Compare this to HumansView which shows the same but no explicit guide.
  evidence: src/components/views/DogsView.jsx line 709: `<span className="italic">Searching...</span>` with no context. The search input placeholder (line 491) says 'Search by name, breed or owner...' but the loading feedback doesn't reinforce this.
  fix: Upgrade to: `Searching by name, breed or owner…` (keep italics for consistency). This mirrors the placeholder hint and sets expectations during the wait.
  impact: Staff understand what criteria the search uses while waiting, reducing confusion if results surprise them.

[115] [Minor] [Microcopy & empty/loading/error states] ReportsView 'Insufficient data' message uses threshold number but no guidance on how to get more data  (Visual; All)
  desc: ReportsView lines 100-107 show an amber banner: 'Insufficient data for reliable comparisons — showing absolute values only. Period-over-period deltas hidden below 5 bookings.' The message is clear but doesn't guide staff toward solutions (e.g., 'Extend the date range to see trends').
  evidence: src/components/views/ReportsView.jsx lines 100-108: The banner states the threshold but offers no next action or context about why deltas matter.
  fix: Extend the message: 'Not enough bookings to calculate trends reliably. Try selecting a longer period to see patterns.' Add an inline affordance to auto-switch to a longer period (e.g., '7 days → 30 days') as a quick action.
  impact: Staff know how to get better data quality and don't assume the dashboard is broken.

[116] [Minor] [Microcopy & empty/loading/error states] EmptyState with filtered Dogs/Humans doesn't explain which filter(s) are active  (Visual; All; QUICK-WIN)
  desc: DogsView EmptyState when filters are active (lines 675-676) says 'No dogs match the active filters.' but doesn't tell staff which filters. A more helpful message would list them: 'No dogs match: Size = Large, Has alert.'
  evidence: src/components/views/DogsView.jsx lines 675-676: EmptyState title is generic. The footer at line 426 lists filters, but the empty state doesn't repeat this context.
  fix: Pass a description prop to EmptyState that lists active filters: `description={activeFilters.length > 0 ? `Active filters: ${activeFilters.join(', ')}. ` : ''} + Try clearing some filters...` This mirrors the footer text and removes ambiguity.
  impact: Staff immediately see which constraints are limiting results and know exactly what to clear.

[117] [Minor] [Microcopy & empty/loading/error states] Inbox error message for list fetch is wordy and uses 'clears within a minute' — unclear if transient  (Visual; All; QUICK-WIN)
  desc: InboxView list error (line 612-615) says 'We can't load your messages right now' with a paragraph explaining transience. The message is warm but verbose. Staff may not understand if they should refresh immediately or wait.
  evidence: src/components/views/inbox/InboxView.jsx lines 611-629: The error message is friendly but long: 'The inbox is temporarily unavailable. This usually clears within a minute. If it keeps happening, the dashboard's WhatsApp widget may still show recent threads.' This is more explanation than guidance.
  fix: Shorten to: 'Your inbox is temporarily unavailable. It usually recovers within a minute. Try again: [button].' Move the 'widget fallback' note to the dev error details (line 623-627).
  impact: Staff get actionable guidance fast without cognitive overload.

[118] [Minor] [New Booking modal] Time slot buttons use aria-disabled redundantly with disabled attribute  (Accessibility; All; QUICK-WIN)
  desc: Time slot picker buttons use aria-disabled={!isClickable} in addition to disabled={!isClickable}. While both are present in the rendered code, using aria-disabled is redundant when the native disabled attribute is available. The native disabled is sufficient and prevents default browser interactions automatically.
  evidence: src/components/modals/new-booking/TimeSlotPicker.jsx:99 and 107. Both disabled={!isClickable} and aria-disabled={!isClickable} are applied to the same button element. When a button is disabled via the HTML disabled attribute, aria-disabled is unnecessary.
  fix: Remove the aria-disabled attribute; keep only disabled={!isClickable}. The native disabled attribute is the WCAG-compliant approach and requires no accompanying ARIA.
  impact: Cleaner, more maintainable code. No functional change in accessibility; the button already prevents interaction via the native disabled attribute.

[119] [Minor] [New Booking modal] Service dropdown in dog card lacks aria-label  (Accessibility; All; QUICK-WIN)
  desc: The service selection dropdown in the dog card (line 126-136) renders without an aria-label. Screen readers announce it as a generic '<select>' with no context that it controls the service for a specific dog. The context must be inferred from surrounding text.
  evidence: src/components/modals/new-booking/DogSearchSection.jsx:126-136. <select value={entry.service} onChange={(e) => onServiceChange(entry.dog.id, e.target.value)} className="..." /> with no aria-label.
  fix: Add aria-label: <select aria-label={`Service for ${titleCase(entry.dog.name)}`} value={entry.service} ... />
  impact: Screen readers now clearly announce which dog's service is being changed. Improves form clarity for AT users.

[120] [Minor] [New Booking modal] Keyboard shortcut 'N' for New Booking not exposed in UI  (Functionality; All)
  desc: The 'N' key binding to open a new booking is implemented and documented in code comments, but staff may not discover this shortcut. There is no help text, tooltip, or keyboard legend visible in the toolbar or dashboard to inform users of available shortcuts.
  evidence: src/components/layout/AppToolbar.jsx:189 (desktop only); L202-232 shows help menu EXISTS on desktop; L311 (mobile) aria-label missing shortcut hint; mobile toolbar (L286-372) has no help button
  fix: Add a small help icon (?) in the toolbar or a '? Keyboard shortcuts' menu item that displays: 'N – New Booking, T – Today, ← → Navigate weeks'. Alternatively, add a tooltip to the New Booking button showing '(Press N)'.
  impact: Staff discover and use the keyboard shortcut without guessing. Faster workflow for power users; improves accessibility for those who prefer keyboard navigation.

[121] [Minor] [New Booking modal] Alert emoji in dog card lacks text fallback  (Visual; All)
  desc: In the dog card (when dog is selected in the modal), the alert emoji ⚠️ appears next to the dog name (line 106) with no text fallback. While the alert details appear below in smaller text, the inline indicator is purely emoji-based. On some devices or font configurations, the emoji may not render clearly.
  evidence: src/components/modals/new-booking/DogSearchSection.jsx:106. {entry.dog.alerts?.length > 0 && <span className="ml-1.5">⚠️</span>}. Alert content (lines 111-114) is rendered separately, not inline with the name.
  fix: Add text label after emoji or replace with icon+text: <span className="ml-1.5" aria-label="Has alerts">⚠️ Alert</span> or use a SVG icon with text.
  impact: Alerts are clearer on all devices; emoji rendering inconsistencies don't impact usability. Text backup ensures readability on systems without emoji support.

[122] [Minor] [Overview slide-out] Calendar day-of-week headers lack accessible structure  (Accessibility; All; QUICK-WIN)
  desc: The calendar grid has day-of-week headers ('Mo', 'Tu', 'We', etc.) at line 80-84 in MiniCalendarCard.jsx, but they are rendered as plain divs without semantic meaning. Screen readers will not announce them as headers for the calendar columns, and users relying on assistive tech may have difficulty understanding the grid structure.
  evidence: src/components/dashboard/MiniCalendarCard.jsx:80-84 — the headers are 'div' elements with no role or scope attributes. The calendar dates use <button> elements (line 138-162), which is correct, but the structure lacks the 'role="columnheader" scope="col"' or similar semantic markup.
  fix: Wrap the day headers in a 'role="row"' div, and apply 'role="columnheader" scope="col"' to each header div. This allows screen readers to announce the grid as a data table with column headers.
  impact: Screen-reader users now hear 'Monday column', 'Tuesday column', etc., improving grid understanding and navigation.

[123] [Minor] [Overview slide-out] Closing drawer by selecting a day/date does not provide user feedback  (Functionality; All; QUICK-WIN)
  desc: When a user clicks a day in the Week Overview pills or a date in the calendar, the drawer closes immediately (line 54-61 in OverviewDrawer.jsx) and the main calendar updates. However, there is no visual feedback (toast, highlight, or transition) confirming the selection was registered. On slow networks or with slower React updates, staff may tap again, causing duplicate actions.
  evidence: src/components/dashboard/OverviewDrawer.jsx:54-61 — handleSelectAndClose calls onSelectDay/onSelectDate and onClose without waiting for a return value or emitting feedback. No toast or visual confirmation is shown.
  fix: Add a brief flash or slide animation to the selected date/day in the drawer before closing (e.g., 'bg-brand-yellow scale-110' for 80ms), OR show a 'Navigating to {day}...' toast, OR use a small success checkmark animation. Ensure the animation completes before the drawer closes.
  impact: Users have tactile confidence that their selection was registered; reduces accidental duplicate taps on slow connections.

[124] [Minor] [Overview slide-out] Redundant data duplication: left sidebar vs. Overview drawer on desktop  (Layout; Desktop; QUICK-WIN)
  desc: On desktop (xl+), the left sidebar displays the Week Overview, Mini Calendar, and Capacity cards. The Overview drawer contains the SAME three cards. This means if a user opens the drawer on desktop, they see duplicate information inches away. While the drawer is useful on mobile/tablet (where the sidebar is hidden), on desktop it creates cognitive overhead and wastes drawer screen real estate.
  evidence: src/components/dashboard/LeftSidebar.jsx:22-43 shows the three cards on desktop (hidden xl:block at line 22). src/components/dashboard/OverviewDrawer.jsx:102-120 renders all three again. src/components/dashboard/DashboardShell.jsx:36 confirms the left sidebar is only shown on xl+.
  fix: (1) On desktop, remove the Overview drawer entirely or (2) replace its content with a quick-access section (e.g., 'Starred bookings', 'Pending reminders', 'Waitlist summary') that complements the sidebar. (3) Keep the drawer only on md and below. Implement via conditional rendering checking breakpoint context or viewport size.
  impact: Desktop users no longer see duplicate data; drawer is optimized as a mobile/tablet feature. On mobile/tablet, drawer remains a valuable compact summary when the sidebar is hidden.

[125] [Minor] [Overview slide-out] Capacity bar status labels are redundant with percentage number  (Visual; All; QUICK-WIN)
  desc: The capacity bars show a percentage number (e.g., '70%') and a text label (e.g., 'Full') side-by-side. This is redundant: the percentage already encodes the state (≥70% = full). The label adds visual clutter and cognitive load. On small screens (iPhone), the label may wrap or truncate, breaking the visual rhythm.
  evidence: ""
  fix: Remove the text statusLabel and rely on the percentage + bar colour (emerald for ≥70%, amber for ≥40%, sky for <40%). If the label is needed for clarity, replace the separate label with a single icon (e.g., a small icon for full) or move it to the bar itself. Alternatively, keep the label but remove the percentage to save horizontal space on mobile.
  impact: Cleaner visual hierarchy; improved mobile readability; no loss of meaning since colour + number are sufficient.

[126] [Minor] [Overview slide-out] Next available slot button is not visually distinct from context text  (Visual; All; QUICK-WIN)
  desc: In the Capacity Card, the 'Next available' slot (line 106-120 in CapacityCard.jsx) is rendered as a teal link-style button ('text-brand-teal-text'). On white backgrounds, this achieves ~4.13:1 contrast ratio, which meets WCAG AA but is at the low end. The design is also visually similar to a hyperlink, which may confuse users expecting a navigation action rather than a date selection (which closes the drawer).
  evidence: src/components/dashboard/CapacityCard.jsx:106-120 defines the button with `text-brand-teal-text` (index.css line 78: #266E60, actual WCAG contrast ~4.59:1 per line 74-75 comment, not ~4.13:1); styling includes `bg-transparent`, `border-none`, `p-0`, and `hover:text-brand-teal-text/80` (only 20% opacity change), creating minimal visual button affordance"
  fix: (1) Add a subtle background tint (e.g., 'bg-brand-teal/5 px-2 py-1 rounded') to make it visually distinct as a button. (2) Or increase the contrast by using 'text-brand-teal' (#2D8B7A, ~4.5:1) instead of 'text-brand-teal-text'. (3) Pair with the 'ArrowRight' icon (already present at line 114) and use a stronger hover state (e.g., 'group-hover:bg-brand-teal/10').
  impact: Users immediately recognize the slot as an interactive button; improved visual hierarchy and WCAG AAA compliance for contrast.

[127] [Minor] [Reports] Period-over-period delta badges show even when both cur and prev are identical, displaying '0%'  (Functionality; All; QUICK-WIN)
  desc: The Trend component (ReportWidgets.jsx:7-21) returns a delta badge when cur != null and prev != null, but formatDelta() (intl.js:42-49) returns '0%' when the percentage is rounded to 0. This means a card showing '+1 booking' vs '1 booking' previous period (0% change) still displays a badge, cluttering the KPI layout. The LOW_N_THRESHOLD logic hides all deltas when curN < 5, but single small changes above that threshold still show '0%' or '±1%' badges.
  evidence: src/components/views/reports/ReportWidgets.jsx:7-21 calls formatDelta() and renders the badge regardless of magnitude. src/utils/intl.js:42-49 returns '0%' for very small deltas. The logic doesn't suppress badges for noise (changes < 2%).
  fix: In the Trend component, check if the absolute delta is < 2% and return null to suppress the badge entirely. Or, update formatDelta() to return null when rounded pct === 0, and adjust Trend to handle null gracefully.
  impact: KPI cards are less cluttered when changes are within normal variance. Focus is drawn to meaningful changes (5%+), not noise.

[128] [Minor] [Reports] KPI Trend badges disappear on mobile, leaving only numeric values  (Visual; iPhone; QUICK-WIN)
  desc: The KPI grid on mobile (ReportsView.jsx:136) shows grid-cols-2 at all breakpoints below md:grid-cols-4. At 375px (iPhone SE width), each KPI card is very narrow (~160px). The Trend badge (ReportWidgets.jsx:17) with its arrow + percentage occupies ~80-90px and wraps to a second line. On iPhone SE, the gap between the value and sub-text collapses, and the badge squashes awkwardly.
  evidence: src/components/views/ReportsView.jsx:136 uses 'grid grid-cols-2 md:grid-cols-4 gap-3'. src/components/views/reports/ReportWidgets.jsx:27-29 has the KPI value + Trend in a flex row with gap-1.5. On narrow screens, flex-wrap causes the trend badge to drop below the value, reducing visual hierarchy.
  fix: On iPhone (sm breakpoint), hide the Trend badge entirely or scale down its font-size. Add 'sm:hidden' to the Trend span in Kpi(), or use 'sm:text-[10px]' to shrink it. Alternatively, increase the KPI card's min-width on mobile to prevent cramping, though this risks cutting off sub-text.
  impact: KPI cards remain balanced and readable on small screens. The delta still appears on tablet/desktop where there's room.

[129] [Minor] [Reports] Stacked status bar (BookingHealth) uses inconsistent color palette and incomplete status coverage  (Visual; All)
  desc: BookingHealth.jsx (line 32-37) renders a stacked horizontal bar showing booking statuses, but STATUS_COLORS (ReportWidgets.jsx:56) only defines three statuses: BOOKED, CHECKED_IN, and READY_FOR_PICKUP. Other statuses (IN_BATH, COMPLETED, CANCELLED) are never shown, making the bar visually incomplete and potentially misleading. The bar renders only the three statuses it knows about, hiding the fact that some bookings have other statuses.
  evidence: src/components/views/reports/BookingHealth.jsx:32-37 uses Object.entries(STATUS_COLORS) to render segments. src/components/views/reports/ReportWidgets.jsx:56 defines only 3 of 6 BOOKING_STATUS values. src/hooks/useReportsData.ts:338-340 accumulates ALL statuses into statusAcc, but the UI ignores unknown ones.
  fix: Extend STATUS_COLORS to include all six statuses (IN_BATH, COMPLETED, CANCELLED). Use distinct, accessible colors (e.g., IN_BATH -> cyan, COMPLETED -> green, CANCELLED -> grey). Update STATUS_LABELS similarly. Alternatively, group IN_BATH with CHECKED_IN (both 'in progress') and COMPLETED separately.
  impact: Stacked bar now represents the complete set of booking states. Staff can see if bookings are stalled in IN_BATH or if they've been completed. Visual honesty improves trust in the reports.

[130] [Minor] [Reports] RevenueTrend chart Y-axis labels clip or misalign on mobile due to fixed w-7 width  (Visual; iPhone/iPad; QUICK-WIN)
  desc: The Y-axis tick labels (RevenueTrend.jsx:22) are constrained to w-7 (28px). On iPhone at 375px viewport width, currency symbols (£) + three-digit numbers (e.g. '£900') require ~25-28px at text-micro size (10px). At very small screen sizes, or if the salon revenue exceeds £9,999, the label wraps or truncates, misaligning with the chart bars and guide lines.
  evidence: src/components/views/reports/RevenueTrend.jsx:22 (confirmed accurate)
  fix: Use 'w-10' (40px) instead of 'w-7' to give more breathing room. Alternatively, measure the longest tick (maxRev) and dynamically calculate the required width, or use a smaller font for very large numbers. Add 'sm:w-10' to scale appropriately by device.
  impact: Y-axis labels render clearly on all screen sizes. Alignment with chart bars is preserved. Mobile readability improves.

[131] [Minor] [Reports] DemandPattern day-of-week labels can collide or overlap on narrow screens  (Visual; iPhone; QUICK-WIN)
  desc: DemandPattern.jsx (line 27-43) renders a 7-bar day-of-week chart with day labels below each bar. Each label ('Mon', 'Tue', etc.) is text-micro (10px). With gap-1.5 between bars and 7 bars total, at 375px iPhone width, the label area is ~35px per bar. At 10px font size, a 3-letter label + padding may wrap or clip if the layout tightens further due to card margins.
  evidence: src/components/views/reports/DemandPattern.jsx:27-43. The flex container is 'gap-1.5 h-[60px]' with 7 flex-1 children. On a 375px iPhone with ~300px content width, each flex-1 bar = ~40px. The label below is text-micro, which fits, but there's no explicit overflow handling or text-overflow: ellipsis.
  fix: Add 'truncate' or 'whitespace-nowrap' to the day label (line 40) to prevent wrapping. Alternatively, abbreviate labels to single letters ('M', 'T', 'W', etc.) on mobile using a responsive class. Use 'sm:hidden' + 'hidden sm:block' to toggle between abbreviated and full labels.
  impact: Day labels remain readable and don't overflow on small screens. Users can still identify days without ambiguity.

[132] [Minor] [Reports] KeyInsights bullet points lack visual depth and are hard to scan on mobile  (Visual; iPhone; QUICK-WIN)
  desc: KeyInsights.jsx (line 70-73) renders a list of insights with a small teal bullet (w-1.5 h-1.5). The text is text-xs (12px) with line-height inherited. On iPhone at 375px, the narrow viewport combined with left padding creates a compressed, hard-to-scan list. Each item is a tight <li> with flex items-start gap-2, which works, but the bullet size is so small it's barely visible at 1.5mm diameter.
  evidence: src/components/views/reports/KeyInsights.jsx:71-72. The bullet is `w-1.5 h-1.5` (6px) with `bg-brand-yellow`; the list text uses `text-xs` (12px) instead of `text-body` (13px per design tokens in index.css:198). Missing responsive text scaling (e.g., `sm:text-body`). The Section component wraps these insights in a white card with `p-5` padding; on iPhone 375px, the combination of 6px bullets, 12px text, and 8px gaps creates a visually compressed, harder-to-scan list compared to other report sections.
  fix: Increase bullet size to w-2 h-2 (8px) for better visibility. Add 'text-xs sm:text-body' to scale list item text responsively. Consider using a dash or arrow emoji (→) instead of a bullet for better visual weight on small screens.
  impact: Insights are easier to scan and visually distinct. Better readability on mobile without sacrificing desktop layout.

[133] [Minor] [Reports] Customer Ranking card shows truncated names on mobile without overflow handling  (Visual; iPhone; QUICK-WIN)
  desc: CustomerRanking.jsx (line 19) renders customer names with 'truncate' class. On iPhone, the ranking circle (w-5), name, and revenue value all fit in one row, but the name area is compressed. Long names like 'Alastair MacKenzie' will truncate to 'Alastair M...' without any visual hint that it's truncated.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/views/reports/CustomerRanking.jsx:14-29 (specifically line 19 with truncate class)
  fix: Add 'title={c.name}' to the truncated name div (line 19) so hovering shows the full name. For screen readers, add 'aria-label={c.name}' to the parent container or the name element itself. On mobile, consider showing only the first name + initial if space is constrained.
  impact: Users can see full customer names via tooltip or aria-label. Screen readers announce the full name. No loss of information on truncation.

[134] [Minor] [Responsive / breakpoints] Bottom tab bar occupies full safe area but lacks horizontal scroll affordance on narrow phones with many nav items  (Functionality; iPhone)
  desc: AppToolbar.jsx line 376 fixes the bottom nav to the viewport with `fixed bottom-0 left-0 right-0`. Line 379 uses `flex` with no horizontal scroll or snap-scroll capability. On iPhone 12 mini (360px width) or older phones (375px), five nav items (Bookings, Dogs, Humans, Inbox, Reports) each take ~75px, totaling 375px, which fits exactly. However, there's no visual indicator (scroll shadow, snap-to-center on tap, or scroll hint) that the nav is scrollable if future nav items are added or text is longer. The nav feels hard-aligned rather than flexible. Current design works but lacks resilience.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/layout/AppToolbar.jsx:374–431 (bottom tab bar flex layout, no scroll or snap attributes)
  fix: Add scroll and snap behavior to the nav container (line 379): `overflow-x-auto snap-x snap-proximity scroll-px-2 scrollbar-none`. This matches the CalendarTabs pattern (src/components/layout/CalendarTabs.jsx:54). Also add a subtle scroll-shadow CSS utility or use `scroll-smooth` for better UX. No breakpoint change needed; this improves resilience on ultra-narrow phones.
  impact: If future nav items are added or text labels are longer, the bottom tab bar gracefully overflows and allows horizontal scrolling rather than breaking layout or truncating text. Aligns with mobile best practices for overflow affordances.

[135] [Minor] [Responsive / breakpoints] Content padding cliff at md:768px (pb-20 to pb-5) may cause content clipping on iPad at 768px exactly  (Layout; iPad; QUICK-WIN)
  desc: App.jsx line 588 applies pb-20 (80px bottom padding) on phones <768px to clear the fixed bottom nav bar (which has height ~72px per useFillViewportHeight.js:26). At md:768px exactly, padding drops to pb-5 (20px). iPad Pro at 768px width (first breakpoint where bottom nav becomes md:hidden) has a 10px/20px margin for the bottom edge of the page. On some tablet orientations, this may cause the last visible card to sit too close to the viewport edge when scrolled to bottom, creating a minor visual inconsistency. The gap is proportional (80px vs 20px), not a hard clip, but UX is slightly cramped.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/App.jsx:588 (pb-20 md:pb-5); /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/views/inbox/hooks/useFillViewportHeight.js:26 (MOBILE_BOTTOM_GAP = 72); /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/layout/AppToolbar.jsx:376 (bottom nav: md:hidden)
  fix: Adjust App.jsx line 588 to use a gentler curve: `pb-20 sm:pb-16 md:pb-6` (or similar) so the transition is smoother across the sm/md boundary. Alternatively, use `pb-[calc(5.5rem_+_env(safe-area-inset-bottom))]` on smaller screens to add back the safe-area offset even though the nav is fixed, for consistency. The gap doesn't need to match the nav height; ~32px at md is reasonable and prevents the sudden drop.
  impact: Smoother visual transition when testing the dashboard on iPad at the 768px breakpoint. Cards maintain a consistent breathing room from the edge regardless of screen size.

[136] [Minor] [Settings (9 tabs)] Capacity Engine explanation text lacks semantic heading  (Accessibility; All; QUICK-WIN)
  desc: The "What the 2-2-1 rule means" section uses a plain <p className="font-semibold"> instead of a heading element. Screen reader users navigating by heading cannot identify this as a section title. It's only visually prominent due to font-weight.
  evidence: src/components/views/settings/CapacitySettings.jsx, line 41-42: `<p className="m-0 mb-1.5 font-semibold text-slate-800">What the 2-2-1 rule means</p>`
  fix: Replace <p> with `<h4 className="...">` to make it a level-4 heading, semantically signaling its role.
  impact: AT users can navigate settings by heading to find the capacity explanation quickly.

[137] [Minor] [Settings (9 tabs)] Calendar Settings heading hierarchy incorrect  (Accessibility; All; QUICK-WIN)
  desc: In CalendarSettings, "Staff Calendar Feed" and "How to Subscribe" use <h3> directly without a parent <h2> or <h1>. This violates heading hierarchy (should skip only 1 level if needed). Screen readers may announce unexpected nesting.
  evidence: ""
  fix: Change to <h2> (or nest under a parent <h1> if the page has one) to maintain proper hierarchy.
  impact: Heading outline is semantically correct; AT users can navigate more predictably.

[138] [Minor] [Settings (9 tabs)] Save button state unclear for live-save tabs  (Functionality; All; QUICK-WIN)
  desc: PricingSettings and CapacitySettings use live-save (every keystroke triggers a save via useConfigSaver). However, no visual feedback indicates whether the current value has been saved. Only tabs with manual Save buttons show "Saving…" and "✓ Saved" states. Users editing prices may assume changes are pending when they're actually persisted.
  evidence: src/components/views/settings/PricingSettings.jsx, line 138: "Changes save as you type" text, but no UI state indicator per field.
  fix: Add an optional subtle animation or color transition (e.g., brief bg-green-100 flash) to each field after successful save, or show a persistent "Saved" badge in CardHead when all fields are synced.
  impact: Users get confidence that live-save edits are persisted without waiting for manual save.

[139] [Minor] [Settings (9 tabs)] Tab overflow indicator missing on narrow widths  (Layout; iPhone; QUICK-WIN)
  desc: The 9 tab labels wrap via flex-wrap, but on iPhone (< 375px), all 9 tabs stack into multiple rows, consuming significant vertical space. No visual indicator (scroll area, condensed tab labels, or icon-only mode) exists to show there are more tabs. Users may not realize tabs are hiding below the fold.
  evidence: src/components/views/SettingsView.jsx, line 78: `flex gap-1 flex-wrap` with no responsive overflow handling or truncation.
  fix: On mobile, implement horizontal scroll container with `overflow-x-auto` and `flex-nowrap`, or collapse tab labels to icon-only (using first letter or emoji) with aria-label preserved. On desktop, keep current wrap behavior.
  impact: Tab bar remains visible without taking up multiple rows on mobile, improving scanning speed.

[140] [Minor] [Settings (9 tabs)] Price input 'from' prefix overlaps at small font sizes  (Visual; All; QUICK-WIN)
  desc: In PricingSettings, the "from" prefix is positioned absolutely at `left-2 top-1/2 -translate-y-1/2` with `text-[11px]`. On very small or zoomed-out screens, or if user has enlarged text, the "from" label visually overlaps the input's left padding, making the typed price value hard to read.
  evidence: src/components/views/settings/PricingSettings.jsx, lines 90-93: `<span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] ...`
  fix: Increase left padding of the input from `pl-10` to `pl-12` or `pl-14`, or move the label above the input instead of inside (change to block layout).
  impact: Price values remain readable at all zoom levels and text sizes.

[141] [Minor] [Side utility panels] No focus-visible state on RightRailCard CTA buttons in calm tone  (Accessibility; All; QUICK-WIN)
  desc: CTA buttons in calm tone are rendered as tertiary text links (`inline-flex items-center gap-1 bg-transparent border-none p-0`, line 291), inheriting the global focus-visible outline from index.css (line 302). However, the outline offsets by 2px and may sit outside the small link bounds, making focus invisible to keyboard-only users on mobile or in cramped layouts.
  evidence: src/components/dashboard/RightRailCard.jsx, lines 285-298. Calm CTA at line 291 is a button with `p-0` and inline-flex; it has no explicit focus-ring class or focus:outline override. Global :focus-visible at index.css:302 applies `outline: 2px solid var(--color-border-focus); outline-offset: 2px;`. On a small link, 2px offset pushes the outline outside the visual bounds.
  fix: Add focus ring variant for calm CTAs: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#D4A500]` (using the border-focus colour). Reduce offset to 1px on buttons with small padding.
  impact: Keyboard users see focus state on all CTAs. Improves discoverability on mobile and ensures accessible navigation through the right rail.

[142] [Minor] [Side utility panels] Inconsistent aria-busy semantic across cards  (Accessibility; All; QUICK-WIN)
  desc: RightRailCard uses `aria-busy={loading || undefined}` (line 208) to signal loading state. When loading is false, aria-busy is undefined (not false), so the attribute is omitted. This is correct semantics, but UtilityTabs does not expose a loading state through its badge or tab button, so screen reader users can't know if a tab is still loading data before the count appears.
  evidence: src/components/dashboard/RightRailCard.jsx, line 208. Card properly omits aria-busy when not loading. src/components/dashboard/UtilityTabs.jsx, lines 15-27 accept loading props (waitlistLoading, todoLoading) but only pass them to the card (line 104, 107) without signalling loading to the tab button itself.
  fix: Add aria-busy to the tab buttons in UtilityTabs: `aria-busy={active && (todoLoading || waitlistLoading)}` so users know when data is fetching. Optionally add a loading spinner icon to the active tab.
  impact: Screen reader users know when a tab's content is loading. Reduces uncertainty about slow/missing data.

[143] [Minor] [Side utility panels] AI summary panel hard-clip on mobile with no scroll affordance  (Layout; iPhone/iPad; QUICK-WIN)
  desc: InboxAiSummary renders in WhatsAppInboxCard with `min-h-[44px]` (line 19) but no max-height or scroll container. If the AI-generated summary text is long (multiple sentences), it can exceed the panel height on mobile, but the card itself has no internal scroll mechanism—the summary just gets cut off visually or pushes the CTA off-screen without indicating overflow.
  evidence: src/components/dashboard/WhatsAppInboxCard.jsx, lines 17-40. InboxAiSummary is a <div> with `min-h-[44px]` and `p-3`, rendering a <p> with no max-height constraint. Text can overflow; parent RightRailCard doesn't scroll this slot independently on mobile. The card's loudChildren scroll via `max-h-64 overflow-y-auto` (TomorrowRemindersCard line 189), but aiBlock has no such constraint.
  fix: Wrap InboxAiSummary text in a scrollable container: change `className='bg-white rounded-xl p-3 border border-emerald-100 min-h-[44px]'` to `className='bg-white rounded-xl p-3 border border-emerald-100 min-h-[44px] max-h-[120px] overflow-y-auto'` so long summaries are accessible.
  impact: Long AI summaries remain readable on mobile; CTA button stays visible and clickable. Prevents visual overflow on narrow viewports.

[144] [Minor] [Tap targets (touch)] WhatsApp icon buttons (w-6 h-6, max-sm:w-9 max-sm:h-9) undersized below breakpoint  (Accessibility; iPhone; QUICK-WIN)
  desc: Inline WhatsApp contact buttons in DirectoryItem (Humans/Dogs cards) use w-6 h-6 (24×24 CSS px desktop) and max-sm:w-9 max-sm:h-9 (36×36 CSS px below 640px). The 36×36 target is below WCAG AAA minimum of 44×44. Icons are size={12}. On phones, the button is accidentally tapped instead of the adjacent phone number link.
  evidence: </correctedEvidence>
</invoke>
  fix: Change `max-sm:w-9 max-sm:h-9` to `max-sm:w-11 max-sm:h-11`. Increase icon from size={12} to size={14} on phones (via conditional render or responsive class).
  impact: Meets WCAG AAA 44×44 minimum on phones. Reduces mis-taps on nearby text elements. Improves visual weight for contact affordance.

[145] [Minor] [Tap targets (touch)] Pricing settings delete button (w-8 h-8) undersized for touch  (Accessibility; iPad/iPhone; QUICK-WIN)
  desc: The 'X' delete button in the Pricing row uses w-8 h-8 (32×32 CSS px) with no responsive scale-up for touch. Intended to be clicked rarely (delete a service), but when users do reach for it, the small target increases mis-taps on adjacent price inputs or rows.
  evidence: src/components/views/settings/PricingSettings.jsx:104-114 (evidence file and lines are correct as cited)
  fix: Add `max-sm:w-10 max-sm:h-10` to scale to 40×40 on phones. Alternatively, reposition as a drag-handle row control or swipe-to-delete gesture.
  impact: Reduces accidental deletion. Safer UX for destructive actions on mobile.

[146] [Minor] [Tap targets (touch)] To-do modal close button (w-7 h-7) below recommended minimum  (Accessibility; iPhone; QUICK-WIN)
  desc: The close button in TodoModal header uses w-7 h-7 (28×28 CSS px) with no responsive adjustment. While a close button is rarely accidentally tapped, the undersized button breaks touch-target consistency and violates WCAG AAA 44×44 guidance.
  evidence: src/components/modals/TodoModal.jsx:56-66 — `className=...w-7 h-7 rounded-md...`
  fix: Change to `w-8 h-8 max-sm:w-10 max-sm:h-10` to match other modal close buttons and scale on phones.
  impact: Consistent header button sizing across all modals. Minor visual tidy-up.

[147] [Minor] [Tap targets (touch)] Inline alert/flag chips with icon (12px icon in ~20px container) small and icon-focused  (Visual; All; QUICK-WIN)
  desc: Flag and alert chips (FlagChip, AlertChip) use `inline-flex items-center gap-1 ...px-1.5 py-0.5 rounded-md` with a 12px icon. Total container ~18-20px tall. On touch, the small icon (12px) is often the target of taps, not the broader chip text. Users expect the whole chip to be tappable for more info.
  evidence: src/components/views/HumansView.jsx:57-66 (FlagChip), src/components/views/DogsView.jsx:87-98 (AlertChip); index.css:194 (--text-micro: 0.625rem = 10px); Tailwind v4 spacing scale (py-0.5 = 2px, py-1 = 4px)
  fix: Increase to py-1 (4px → 6px vertical) and size icon up to 14px. Ensure icon inherits container's text color to avoid visual mismatch. Consider making chip a button (role=button or <button>) if it should open a popover on tap.
  impact: Improves visual presence of alerts. Clearer affordance that the chip is interactive (if intended). Better touch accessibility.


# === Polish ===

[148] [Polish] [Accessibility semantics] Calendar TabList missing aria-label or semantic heading  (Accessibility; All)
  desc: CalendarTabs.jsx has role="tablist" with aria-label="Day navigation" (line 52), which is correct. However, there is no preceding heading or context about what this tablist controls. The day pills are roles and labeled, but there's no heading saying 'Week view' or similar, so the page structure is less clear to screen readers.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/layout/CalendarTabs.jsx:49-54 (div with role="tablist" and aria-label="Day navigation" lacks preceding heading for enhanced document structure)
  fix: Add a screen-reader-only or visually-labeled heading before the tablist (e.g., <h2 className="sr-only">Day view</h2>).
  impact: Screen reader users have better page structure and understand the tablist's purpose in the layout.

[149] [Polish] [Accessibility semantics] DayTab missing aria-label when loading (isLoading = true)  (Accessibility; All; QUICK-WIN)
  desc: DayTab.jsx (line 49-56) renders a complex aria-label when the tab is loading, but the 'dog count' label (line 100-101) uses aria-hidden={isLoading || undefined} to hide the loading dot. However, the aria-label still includes 'loading' text, making it redundant with aria-busy set on the button. Simpler to just rely on aria-busy="true" and simplify the aria-label.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/layout/DayTab.jsx:48-57 (aria-busy and aria-label both signal loading state; redundant but harmless)
  fix: Simplify aria-label to exclude 'loading' when isLoading is true; rely on aria-busy="true" for the assistive technology announcement.
  impact: Cleaner ARIA state that doesn't duplicate loading information.

[150] [Polish] [Accessibility semantics] Size dot in BookingCardNew uses role="img" without aria-label specificity  (Accessibility; All; QUICK-WIN)
  desc: BookingCardNew.jsx line 283-287 renders a colored span with role="img" and aria-label for the dog size. The aria-label is set from SIZE_TOOLTIP, which is good. However, there's also a title attribute that duplicates the same text. For consistency with the rest of the codebase, consider whether aria-label alone is sufficient (it is), making the title redundant.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/booking/BookingCardNew.jsx:286-287
  fix: Remove the title attribute (line 287); aria-label is sufficient for screen readers and title is rarely needed when aria-label is present.
  impact: Simpler, cleaner markup without redundant attributes.

[151] [Polish] [Bookings / daily schedule] 'Now' marker label truncates on very narrow time cards  (Layout; iPhone; QUICK-WIN)
  desc: The 'Now' marker (line 230) is a small label with px-2 py-0.5 and text-[9px]. On phones with time-box columns narrower than 64px, the label may wrap or overflow. The marker itself (left border, line 227) is always visible, but the text label can be cut off, leaving only a teal line without context.
  evidence: src/components/booking/SlotGrid.jsx:230 — `<span className="pointer-events-none absolute top-0 left-0 z-10 inline-flex items-center rounded-br-lg bg-brand-teal px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white shadow-sm">Now</span>`. On phones, the time-box width is 64px, and px-2 padding + text + tracking can exceed that.
  fix: Use CSS truncate + text-ellipsis on the label, or hide the text on phones and rely on the left teal border (aria-label: 'Current time slot'). Consider moving the label outside the time-box (to the left) on narrow widths.
  impact: Ensures the 'Now' indicator is always visible and legible; maintains context during busy booking sessions.

[152] [Polish] [Dogs directory] No aria-label on Header background gradient decoration (dog silhouette SVG)  (Accessibility; All; QUICK-WIN)
  desc: The header at line 471–472 includes a decorative SVG (dog silhouette in top-right, opacity-[0.06]). The SVG lacks aria-hidden='true', so screen readers may try to announce it. Since it's purely decorative (very faint, non-interactive), it should be explicitly hidden.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/views/DogsView.jsx:472 — <svg ... > without aria-hidden attribute
  fix: Add aria-hidden='true' to the decorative SVG element
  impact: Screen readers skip the decorative element, reducing noise and improving focus on functional content

[153] [Polish] [Dogs directory] CardGridSkeleton does not match final card height (140px skeleton vs ~168px real card)  (Visual; All; QUICK-WIN)
  desc: The CardGridSkeleton uses a fixed h-[140px] for each cell (line 32), but actual DirectoryItem grid cards in the final layout are taller (min-h-[112px] plus p-3.5 content = ~140–160px depending on content). This creates a noticeable layout shift when the skeleton fades and real cards appear, especially noticeable on slower networks.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/ui/Skeleton.jsx:32 (h-[140px] confirmed) and /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/views/DogsView.jsx:251 (min-h-[112px] flex flex-col confirmed); AlertChip inline-flex at ~18px height when present
  fix: Adjust skeleton height to h-[160px] or use min-h-[160px] with flex-1 to match the real card's expanded height; measure actual rendered height in DevTools and replicate it in the skeleton
  impact: Reduced Cumulative Layout Shift (CLS) during the skeleton-to-content transition; smoother perceived loading experience

[154] [Polish] [Dogs directory] AlphabetRail mobile strip wraps without visual grouping or scroll indicator  (Visual; iPhone)
  desc: The mobile A–Z strip (line 623) uses overflow-x-auto to allow horizontal scrolling. However, there's no visual indicator (e.g., scroll shadow on the right edge) to signal that more letters exist off-screen. Users may assume 'Z' and '#' are unavailable when they are just scrolled out of view.
  evidence: /Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/views/DogsView.jsx:623 — className='md:hidden flex gap-0.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1' — no scroll-shadow or visual cue
  fix: Add CSS box-shadow or background-image scroll-shadow effect (inset-shadow technique) on the right edge of the strip to indicate off-screen content. Alternatively, use a scroll-snap container or add a small icon next to the strip saying 'Scroll for more'.
  impact: Users immediately see that the A–Z rail is scrollable; discovery of 'Z' and '#' improves

[155] [Polish] [Microcopy & empty/loading/error states] InlineError and ErrorBanner don't coordinate on icon/tone hierarchy  (Visual; All; QUICK-WIN)
  desc: InlineError uses a single '⚠' warning icon (line 12) while ErrorBanner uses '⚠️' warning emoji (line 17). The different icon styles and Unicode usage create inconsistent visual weight. InlineError is for form-level errors (smaller context), ErrorBanner for page-level (larger). But they should feel like the same error family.
  evidence: src/components/ui/InlineError.jsx line 12: `<span aria-hidden="true" className="leading-tight">{'⚠'}</span>` vs src/components/ui/ErrorBanner.jsx line 17: `<span className="text-xl" aria-hidden="true">{'⚠️'}</span>` (Unicode escape). Inconsistent character choices.
  fix: Standardise to the emoji variant ('⚠️') in both components, or create an `<ErrorIcon />` component that renders consistently. Update both to use the same character and size/color relationship (e.g., text-sm for InlineError, text-lg for ErrorBanner).
  impact: Error feedback feels cohesive and visually scannable across the app.

[156] [Polish] [New Booking modal] Recurring booking notification message inaccurate for short intervals  (Layout; All)
  desc: When a recurring interval is selected (e.g. 'Every 4 weeks'), the notification message states 'This will generate bookings for the rest of the year.' For a 4-week interval starting in late October, this generates only 2–3 bookings, not a year's worth. The message is misleading about the scale of recurring bookings.
  evidence: src/components/modals/new-booking/BookingFormFields.jsx:88-92. Message reads 'This will generate bookings for the rest of the year. If a day is full, that slot will be skipped.' regardless of start date or interval.
  fix: Compute the number of bookings and include it dynamically: const occurrences = Math.floor(52 / recurringWeeks); <div>This will generate {occurrences} booking{occurrences !== 1 ? 's' : ''} every {recurringWeeks} weeks. If a day is full, that slot will be skipped.</div>
  impact: Staff see an accurate count of bookings to be created, reducing surprise when short intervals generate fewer bookings than expected.

[157] [Polish] [Overview slide-out] No keyboard shortcut documented for closing drawer  (Accessibility; All; QUICK-WIN)
  desc: While the drawer implements focus trapping (lines 29-42 in OverviewDrawer.jsx) and Escape to close (line 28), this shortcut is not documented in the keyboard shortcuts help menu in AppToolbar.jsx. Keyboard users must discover the shortcut by trial or guessing. A documented shortcut would improve navigation speed for keyboard-heavy staff.
  evidence: src/components/dashboard/OverviewDrawer.jsx:27-42 — Escape closes the drawer, but there is no skip link or keyboard label indicating this. The AppToolbar.jsx at line 226-228 shows keyboard shortcuts for other actions (N for New booking, T for jump to today), but there is no entry for the overview drawer.
  fix: Add the Escape shortcut to the keyboard shortcuts help menu in AppToolbar.jsx (line 226-228). Format: 'Esc' → 'Close overview'. This allows keyboard users to discover the shortcut without guessing.
  impact: Keyboard-heavy staff learn that Escape closes the drawer and can navigate more efficiently without tabbing through the entire drawer content.

[158] [Polish] [Settings (9 tabs)] Toggle component missing aria-describedby for enhanced context  (Accessibility; All)
  desc: While Toggle uses aria-labelledby to link to the row label (via SettingRow), it does not link to any sublabel text. On complex toggles like "Auto-confirm bookings," the sublabel "When off, new bookings need manual approval" is not announced together with the toggle state, requiring users to hunt for context.
  evidence: src/components/views/settings/shared.jsx, line 49: `cloneElement(control, { "aria-labelledby": labelId })` only includes the main label, not sublabel.
  fix: Generate a sublabelId and extend cloneElement to pass `aria-describedby={sublabelId}` when a sublabel exists, linking toggle to both label and description.
  impact: AT users hear the full context (label + description) when focusing toggles, reducing cognitive load.


# === REJECTED (25) ===
- [Bookings / daily schedule] Status pill contrast insufficient on 'Booked' state :: The finding claims that the 'Booked' status pill (purple #2D004B text on mustard #FFF6CC background) fails WCAG 2.1 SC 1.4.3 with a ~3.5:1 contrast ratio. Actual calculation using standard WCAG contrast formula yields 15.91:1, which far exceeds the 4.5:1 minimum for small text. The evidence files and color references are correct, but the contrast analysis is fundamentally wrong. The color pair is accessible and meets both AA and AAA standards.
- [Bookings / daily schedule] Alert popover positioning can exceed viewport on right edge :: The finding's core claim - that the AlertsPopover positioning logic "can exceed viewport on right edge" - is refuted by detailed code analysis. 

EVIDENCE REVIEW:
1. The cited code (lines 126-130) implements explicit right-edge clamping that PREVENTS overflow: if (left + POPUP_WIDTH > window.innerWidth - margin) { left = window.innerWidth - margin - POPUP_WIDTH; }

2. The supporting claim about the alert button position is factually incorrect. The code layout (lines 280-328) shows the alert button sits AFTER the dog name in row 1, not "on the far right of a card." The far right contains the breed label and service name.

3. Mathematical verification on 375px phone viewport: After clamping, the popover's right edge (107px + 260px = 367px) stays within the 375px viewport with 8px margin. No overflow occurs.

4. The positioning logic is defensive, not merely aspirational. Both right-edge and left-edge clamping guards ensure the popover always fits within the safe viewport range [8px, viewport.width - 8px - 260px].

CORRECTED UNDERSTANDING:
The code correctly prevents overflow through valid clamping. The only legitimate concern - that the popover may position far from its anchor button when the button is near the right side of the card - is a visual/UX friction point, NOT an overflow bug. But the finding explicitly claims overflow occurs, which is false.

SEVERITY & IMPACT:
The positioning logic works as intended. No real functional issue exists. The finding is based on a misreading of the code and an incorrect assumption about the button's position within the card layout.
- [Appointment detail modal] Save button remains disabled after slot selection in edit mode :: The finding claims a race condition where the Save button remains disabled after slot selection due to render timing issues. However, analysis of the actual code shows: (1) Slot selection synchronously calls setEditData((prev) => ({ ...prev, slot })) in AppointmentDetailsCard.jsx L73; (2) The Save button's disabled state (disabled={!editData.slot || saving}) is evaluated during render in BookingActions.jsx L44; (3) React 18+ automatic batching ensures both child components (slot grid and footer button) receive the updated editData in the same synchronous render cycle; (4) No async operations, promises, or state delays are involved in the slot selection flow; (5) The autosave mechanism explicitly checks if slot exists before proceeding and is delayed by 2000ms, so it cannot race the immediate synchronous update. The button's disabled state should update immediately when a slot is selected. Additionally, the evidence citation (BookingDetailModal.jsx L44-49) points to the function signature, not the save button logic, indicating the reviewer did not verify exact file locations. The described UX issue—"button doesn't immediately enable"—should not occur given React's rendering model and this codebase's structure.
- [Appointment detail modal] No confirmation dialog before rescheduling to a past date or far-future date :: The finding's primary claim is not supported by the actual code. The RescheduleModal (src/components/modals/RescheduleModal.jsx lines 36-39) generates only days 1-7 AFTER the currentDateObj using addDays(currentDateObj, i) for i=1 to 7. The currentDateObj is the date of the booking being rescheduled (obtained from the week view's selected date). Therefore, staff cannot accidentally reschedule to past dates - the modal only offers future dates within +7 days from the booking's current date. The specific scenario in the evidence (rescheduling a June 25 booking to June 1 when today is June 19) is technically impossible. While the finding is correct that there's no intermediate confirmation dialog showing old/new dates side-by-side (BookingDetailOverlays.jsx line 150-169 and RescheduleModal.jsx lines 109/115 call onConfirm directly), this is a much lesser issue than claimed and doesn't warrant Major severity, especially since past-date rescheduling is prevented by design constraints and there's an undo toast available.
- [Overview slide-out] Overlay button captures clicks meant for drawer content :: The finding claims the overlay button "sits BEFORE the drawer div in the DOM" and "captures clicks meant for drawer content" by being a full-viewport button positioned with `absolute inset-0`. While the file:line evidence is accurate (the button IS at lines 70-75), the core claim is **not technically sound**: (1) Within the same z-index stacking context with no explicit z-index override, DOM order determines layering—the drawer (appearing AFTER the button) sits on TOP of the button. (2) Click events propagate DOWN the tree to parents, not sideways to siblings—a click on drawer content cannot reach the overlay button's onClick handler through normal DOM propagation. (3) The focus trap implementation (lines 30-32) correctly constrains focus to the drawer only, preventing keyboard users from reaching the overlay button. The actual minor issue: the overlay button is focusable without being necessary (it should have `tabindex="-1"`), but this is both mitigated by the focus trap AND does not prevent drawer content from being interactive. The severity is overstated; there is no evidence of "accidental drawer closures" occurring in normal usage. The proposed fix (moving overlay after drawer or adding pointer-events-none) is unnecessary for correctness and would actually be incorrect: the overlay button SHOULD fire `onClick` when the user clicks the overlay—that's its purpose.
- [Overview slide-out] Drawer header text contrast is strong but visual hierarchy is weak :: The finding makes claims about the code that do not match the actual source. Specific errors:

1. INCORRECT EVIDENCE: The finding states line 86 subtitle is "same-sized as body copy" - actually it's text-base (16px) which is LARGER than the typical body text (text-body = 13px, or no-class-inherited from text-slate-800/slate-700).

2. INCORRECT EVIDENCE: The finding claims subtitle uses 'same colour' as body text elsewhere. Actually:
   - Subtitle (line 86): text-brand-purple (#2D004B) - deep dark purple
   - Label (line 83): text-slate-400 (#64748B) - muted grey
   - Typical body text: text-ink-muted (#64748B) OR text-slate-800 (#1E293B)
   These are NOT the same colour.

3. FACTUAL ACCURACY: Contrast ratio IS strong (~8.6:1 for #2D004B on white), correctly exceeding WCAG AAA (7:1).

4. VISUAL HIERARCHY: The actual design DOES have clear hierarchy - the subtitle visually stands out through: 60% larger size (16px vs 10px label), much darker color (brand purple vs slate-400), bold weight, and display font (Quicksand).

The UX review finding appears to be based on a misreading of the actual code and misidentification of what 'body text elsewhere' uses. No real usability or accessibility issue exists. The proposed fix itself acknowledges no accessibility concern is needed, which aligns with the code reality."
- [New Booking modal] Modal title aria-labelledby connection not explicitly confirmed :: The finding correctly identifies the expected pattern (titleId passed to AccessibleModal, matching id on the title element) but incorrectly implies this might not be working. The actual implementation is correct: AccessibleModal.tsx line 52-54 passes aria-labelledby to react-aria's useDialog hook, which returns dialogProps at line 85 of react-aria's useDialog.mjs with aria-labelledby correctly set. These dialogProps are spread onto the dialog div at line 91 of AccessibleModal.tsx, which correctly applies the aria-labelledby attribute to the DOM element. The pattern is implemented correctly across NewBookingModal and other modals in the codebase. This is not an accessibility issue—it's already working as intended. The evidence file:line references are accurate, but the conclusion that implementation needs verification is unfounded; the implementation is complete and correct.
- [Dogs directory] Sort and View toggle buttons too small on mobile (px-3 py-2 = 12px height + text) :: The finding's core evidence is mathematically incorrect. It claims max-sm:py-2 = 12px height total, but Tailwind py-2 = 0.5rem = 8px top + 8px bottom. Combined with text-micro (10px) and line-height (14px), the mobile button height is ~40px, which meets WCAG AA 44×44px minimum (especially counting container padding p-0.5 = 2px all sides, reaching exactly 44px). The finding misidentifies the problem: the desktop buttons (py-1 = 8px padding) are only ~32px high and DO violate WCAG, not the mobile ones. The evidence file path and line numbers are correct, but the severity, device target (should be Desktop, not iPhone), and entire calculation are wrong. No independent verification in the codebase (UX-AUDIT-REPORT.md, TECHNICAL-DEBT-REGISTER.md) supports this specific finding."
- [Humans directory] Search input placeholder text contrast insufficient on gradient header :: After verifying the actual code at HumansView.jsx:498, I confirmed the styling exists: `bg-white/25 text-white placeholder:text-white/85` over `from-brand-purple to-brand-purple-light` gradient. However, the contrast calculation in the finding is inaccurate. Using the WCAG 2.0 relative luminance formula: (1) The input background composites white/25 over #2D004B to rgb(~98,64,131) with luminance ~0.077; (2) The placeholder text at white/85 effectively renders as rgb(~231,224,237) with luminance ~0.963; (3) Resulting contrast: 1.0129 / 0.127 ≈ 7.97:1, which exceeds WCAG AA (4.5:1) by 77%. Additionally, the same gradient header uses `text-white/70` for subtext (line 480), which is _less_ opaque than the placeholder, suggesting the design is already tested and working. The finding's claim of ~2.2:1 contrast fails to align with either the code evidence or proper WCAG calculations. The issue is not a real accessibility failure.
- [Reports] Period-over-period delta calculation uses naive BOOKED status as 'no-show' proxy :: The finding makes several technical claims about useReportsData.ts lines 336-348 that do not hold up to scrutiny:

1. The primary claim—that line 342 includes future BOOKED bookings—is factually false. Line 336 (const pastCur = cur.filter((b) => b.booking_date < todayStr)) filters the current period to exclude future bookings BEFORE line 342. Only past bookings are counted.

2. The secondary claim about division-by-zero and 'prevPast = 0' is misleading. The code correctly guards against this with the '> 0' check on line 348, and returning 0% for periods with no historical data is valid behavior, not a bug.

3. The semantic concern about BOOKED being used as a no-show proxy is valid in isolation, but this appears to be the intended system design (no dedicated NO_SHOW status exists in BOOKING_STATUS constants), not a bug.

4. The evidence file:line references are accurate (useReportsData.ts:342-348), but the interpretation of the code's behavior is materially wrong.

5. The metric 'prevNoShowRate' is calculated but not consumed in buildReportInsights() or otherwise exported for UI display (based on code review), suggesting it may be unused dead code or hidden from staff view—undermining the claim of a 'major' usability issue.

The finding conflates a design choice (using BOOKED as a no-show proxy due to lack of a dedicated status) with a bug (incorrectly including future bookings). The actual code correctly excludes future bookings and handles edge cases safely."
- [Reports] DemandPattern slot time labels (w-[50px]) squeeze on iPhone, causing truncation :: The finding claims that DemandPattern slot time labels (w-[50px]) squeeze and truncate on iPhone due to narrow card width. Analysis shows this is not real:

1. **Actual time label widths**: The fmtSlot() function generates labels like "10:30am" (7 chars), "9:00am" (6 chars). At 11px font-bold Montserrat, these render as ~38-42px.

2. **w-[50px] is adequate**: Provides 50px fixed width with no overflow handling needed. 50px > ~42px (max label width).

3. **Container width calculation on iPhone 390px**:
   - AppFrame: 390px - 16px padding (px-4) = 374px
   - ReportsView: no additional padding
   - grid-cols-1 on mobile: full width = 374px
   - Section (p-5): 374px - 40px = 334px available

4. **Row layout math**: Label (50px) + gap (8px) + bar (flex-1) + gap (8px) + count (20px) = 86px fixed + flex bar (248px). No squashing.

5. **The 280px threshold is speculative**: The finding claims problems below 280px, but actual iPhone widths provide ~334px for content. This threshold is never reached in real responsive behavior.

6. **No truncation markup**: The span element has no `truncate`, `overflow-hidden`, or `white-space: nowrap` classes. Even if constrained, text would wrap (not truncate).

The severity is marked Minor and labeled a quick-win, but the underlying issue—text truncation or collision—does not exist in the actual implementation. The width w-[50px] is appropriate for the expected time formats.
- [Reports] Low-N warning banner uses amber-50 background with amber-200 border, insufficient contrast for text :: The finding claims the low-N warning banner in ReportsView.jsx (lines 100-108) has insufficient contrast of approximately 4.5:1. However, verified calculations show: amber-900 (#78350f) on amber-50 (#fffbf3) produces a contrast ratio of approximately 9.61:1, which exceeds WCAG AAA standards (7:1), not just the claimed threshold of WCAG AA (4.5:1). The file:line reference is accurate, but the technical premise is wrong. The colors use Tailwind v4's default amber palette with no custom overrides, and the component correctly implements medium-weight (font-medium) 12px text (text-xs), which are appropriate for warning messages. The banner does not have an accessibility contrast issue.
- [Side utility panels] Colour-only status signalling in reminder row icons :: The finding claims the Circle icon (unsent state) lacks an aria-label at line 81. However, the actual source code at that exact location contains: `<Circle size={16} className="text-amber-400" aria-label="No reminder sent yet" />`. The aria-label IS present and describes the state. All three reminder states (unsent, sending, sent) have proper aria-labels, meeting WCAG 1.4.1 and 4.1.2 requirements. The proposed fix is already implemented in the code. The finding contradicts verifiable source evidence."
- [Side utility panels] UtilityTabs badge positioning overlaps tab labels on smaller screens :: The finding's core evidence claim is factually incorrect. The UtilityTabs component at line 61 has `inline-flex items-center justify-center gap-1.5`, which applies 6px (0.375rem) spacing between ALL direct flex children including the label and badge. The gap property in CSS Flexbox distributes space between adjacent items, so the badge IS separated from the label by this 6px gap. The evidence claim states "Badge renders with `min-w-[18px]` but no margin-left or gap from preceding span" and "Tab itself has `gap-1.5` in flex row (line 61), but if tab squeezes, label + badge can overlap" - both claims are contradicted by the actual CSS flex gap behavior. The `gap-1.5` DOES apply between the label span and badge span as adjacent flex siblings. The proposed fix to "add ml-1 or ml-2" would be redundant and would increase spacing unnecessarily (6px existing + 4px margin = 10px). While there may be a visual balance issue on very small screens due to the fixed 18px badge size relative to truncated labels, that is a different issue about responsive proportions, not about spacing or overlap as claimed. No functional overlap occurs, and the spacing constraint is explicit via the parent flex gap.
- [Side utility panels] Calm-row collapse doesn't account for attention-tone cards :: The finding claims that DeliveryFailuresCard (tone='attention') prevents calm cards from collapsing into RightRailCalmRow. However, the actual code logic at lines 150–151 of RightWorkflowSidebar.jsx uses independent filters: loud = cards.filter((c) => c.tone.tone !== "calm") and calm = cards.filter((c) => c.tone.tone === "calm"). The presence of delivery failures in the loud array does not affect whether other cards filter into the calm array. Each card's tone is evaluated individually: if inbox/reminders/waitlist/todos resolve to "calm", they enter the calm array regardless of whether delivery failures exist. The calm row renders if calmChips.length > 0 (line 188), which depends only on whether any of the four base cards are calm—not on delivery failures. The edge case described is therefore non-existent. The code behavior is correct and needs no fix.
- [Side utility panels] RightRailCard bare mode opacity not distinct enough on mobile :: The finding identifies a real visual concern (bare calm cards lack background tint on white, using `bg-transparent`), but the evidence is inaccurate and the proposed fix is technically broken. Line 33 citation refers to the regular calm frame, not bare mode's muted heading. More critically, the fix `bg-[hue]-50/20` violates Tailwind's static class requirement — dynamic variables in class names don't work. Additionally, no UX evidence (screenshots, user reports, accessibility metrics) confirms this is actually a usability problem on iPhone. Bare mode appears intentional for tab embedding, using text hierarchy rather than background contrast. Without a working fix and real-world evidence of user friction, this fails the 'defensible issue' threshold.
- [Contrast / WCAG AA] Status pill 'Booked' text uses brand-purple on mustard background without label verification :: The finding claims the "Booked" status pill uses brand-purple text on mustard background with insufficient perceptual distinction. However, verification shows: (1) Actual contrast is 15.91:1, well above WCAG AAA (7:1), not AA; (2) The colors are correctly specified in src/constants/salon.ts:125; (3) The rendering in BookingCardNew.jsx:461-482 correctly applies these colors; (4) The proposed fix (using brand-mustard #B8860B text) would FAIL WCAG AA at 2.99:1 contrast; (5) The claim about "peripheral vision" low-contrast is unsupported—purple and cream have sufficient hue difference and luminance difference to be highly distinguishable. The finding conflates "low saturation difference" (aesthetic preference) with "low contrast" (accessibility failure). This is a false positive—the current implementation is sound and accessible.
- [Responsive / breakpoints] Compact top bar and full top nav both visible briefly at xl:1280px boundary on resize :: Evidence verification confirms the CSS structure is correct (/Users/leamonline/Documents/GitHub/Smarter-dog-bookings/src/components/layout/AppToolbar.jsx:123 hidden xl:flex; line 286 xl:hidden). Both div elements use pure CSS media queries (`hidden` + `xl:flex` and `xl:hidden`) with no JavaScript re-render logic at the 1280px boundary. Tailwind v4's media query compilation is atomic and synchronous—CSS rules within a matched media query apply instantly without delay or cascade-completion phases. The only useEffect in AppToolbar (line 107-118) handles click-outside for dropdowns and does not listen to window resize events. DashboardShell.jsx uses ResizeObserver, but only for left-column height measurement, not viewport transitions. No window-resize listeners exist that could trigger re-renders at the xl boundary. Modern browsers apply responsive CSS transitions instantaneously without perceptible flicker. The claimed "sub-50ms flicker" has no code evidence and contradicts the established behavior of CSS media queries in contemporary browsers."
- [Responsive / breakpoints] Horizontal overflow or text truncation possible on right sidebar cards at 1024–1279px due to fixed widths :: The finding describes a potential issue that is NOT currently occurring in the codebase. The evidence cited is accurate:

1. DashboardShell.jsx line 36 DOES use a right-column fixed width of 300px: `xl:grid-cols-[280px_minmax(0,1fr)_300px]`
2. RightWorkflowSidebar.jsx DOES render full-width cards without explicit max-width (but constrained by the grid column)
3. BookingHistoryCard content could theoretically have overflow issues at constrained widths

HOWEVER, the critical flaw in the finding is that it describes a SPECULATIVE issue:
- The right sidebar is currently hidden below xl (1280px): line 66 has `xl:overflow-y-auto` which means it only renders at xl+
- The 300px fixed width only applies when xl is active (1280px+)
- At 1024-1279px (where the proposed lg breakpoint would affect it), the right sidebar currently does NOT render

The finding states: "In the 1024–1279px range, the right sidebar doesn't render (hidden xl:block), so this isn't an active issue today. However, if the breakpoint is changed to lg:" This is self-acknowledging that the issue is conditional/speculative.

The actual testable problem would ONLY manifest IF:
1. The breakpoint is explicitly changed from xl: to lg: (which hasn't happened in the current code)
2. AND the right sidebar content has long unbreakable text at 300px width (possible but would cause text clipping via overflow-hidden, not horizontal overflow)

The proposed fix is reasonable as a preventive measure, but the issue itself is not currently "real" in the codebase—it's a hypothetical that depends on a code change that hasn't been made. The severity should be "Polish" or lower since it's about preventing a future issue, not fixing a current one.

The evidence is accurate but supports the finding as SPECULATIVE, not REAL/CURRENT.
- [Accessibility semantics] GhostSeat buttons lack visible focus indication on mobile :: The evidence (file:line references) is accurate, and :focus-visible does behave differently on iOS Safari. However, the finding conflates a technical observation with a real accessibility problem. In reality: (1) VoiceOver users get VoiceOver's built-in focus ring regardless of CSS :focus-visible—they are NOT left without a focus indicator as the finding implies. (2) The only gap is external keyboard + iOS + VoiceOver OFF, an edge case that's not a realistic use scenario for a staff dashboard. (3) The proposed fix (adding focus:ring-2) would harm the majority of users (those on touch) by showing unwanted focus rings after every tap. The issue is technically real in narrow circumstances but practically not a problem, does not meet the threshold for "Minor" severity, and the proposed fix would make UX worse, not better.
- [Tap targets (touch)] Mobile bottom-tab icons (implicit sizing via flex) may be undersized on landscape :: The finding claims mobile bottom-tab icons are "borderline acceptable" at "~40-48px total" in landscape. However, analysis of src/components/layout/AppToolbar.jsx lines 374-431 reveals: each tab uses `py-2` (16px padding) + icon (20-22px) + `gap-1` (4px) + text (10px) = approximately 50-52px computed height. This already exceeds WCAG AA's 44x44px minimum and is NOT in the "40-48px" range claimed. The code contains no height constraint or compression mechanism that would force the 40-48px sizing in landscape; `pb-[env(safe-area-inset-bottom)]` only adds bottom padding for notched devices (~0-20px), not a maximum-height. The proposed fix (adding min-h-[44px]) would actually work, but the problem statement's sizing claim is unsupported by the code evidence. No tap-target size issue is currently present—the existing design already provides 50px+ targets.
- [Microcopy & empty/loading/error states] SlotGrid has no explicit empty state or 'no availability' message :: The finding claims SlotGrid renders an empty grid when activeSlots is empty with no message. However, examining the actual source code reveals:

1. SALON_SLOTS (src/constants/salon.ts) is a hardcoded array of 10 time slots (08:30–13:00) that never changes.

2. activeSlots is computed at src/components/layout/WeekCalendarView.jsx:107-109 as: `[...SALON_SLOTS, ...(currentSettings.extraSlots || [])]` — meaning activeSlots will ALWAYS contain at least the 10 SALON_SLOTS.

3. There is no code path in the application that would result in activeSlots being an empty array. Even if currentSettings.extraSlots is undefined/empty, SALON_SLOTS ensures a minimum of 10 slots.

4. When a day is closed (isOpen === false), the day does NOT render SlotGrid at all — it renders ClosedDayView (src/components/dashboard/BookingMainPanel.jsx:119) instead. SlotGrid is only rendered when isOpen === true (line 78-116), at which point the salon is open and slots should be configured.

5. The scenario described in the finding (activeSlots === []) is **not achievable in production** due to the hardcoded SALON_SLOTS always being present. Therefore, SlotGrid rendering an empty grid silently is not a real UX issue for this product.

The proposed fix of adding a "No time slots configured for this day" message is addressing a non-existent edge case.
- [Microcopy & empty/loading/error states] Loading placeholder text inconsistency in InboxView detail pane :: The finding claims that "No messages yet." text (line 768) displays when a thread is loading, creating confusion between loading and empty states. However, examining the actual conditional logic in InboxView.jsx (lines 753-770) shows mutually exclusive `if/else if` conditions: (1) if loadingDetail=true, ThreadSkeleton is shown; (2) else if detailError=true, error message shown; (3) else if messages.length===0, "No messages yet." shown. The "No messages yet." text only renders when loading is complete (loadingDetail=false), there's no error (detailError=false), AND the messages array is genuinely empty. Line 609 referenced in evidence is from the list pane (conversation list), not the detail pane. The code correctly distinguishes between loading and empty states—staff will see ThreadSkeleton animation (not "No messages yet.") while loading.
- [Microcopy & empty/loading/error states] Inbox filter chip with zero matches doesn't visually stand out as empty :: The evidence cited (lines 509-597) does show filter chips being rendered, but the actual InboxFilterChip component code (lines 46, 60-62) ALREADY implements visual distinction for empty chips. When count === 0 and the chip is not active, it receives `opacity-60` styling. The finding claims "no disabled state or visual distinction when count=0" which directly contradicts the code at line 62: `${isEmpty && !active ? "opacity-60" : ""}`. Additionally, implementing `cursor-not-allowed` would be incorrect UX here since clicking an empty filter is still valid (it toggles the filter on/off and shows the empty result set, which is communicated in the aria-label). The aria-label at lines 55-56 also correctly announces "No conversations match" for screen readers. The implementation is more nuanced than the finding describes and already addresses the core concern with opacity reduction and accessible labeling.
- [Microcopy & empty/loading/error states] SkeletonCard doesn't have an accompanying aria-label explaining what's loading :: The evidence is accurately cited (Skeleton.jsx lines 23-42 do contain the role="status", aria-label, and aria-hidden attributes as described). However, the finding mischaracterizes this as an accessibility problem when the implementation is actually WCAG 2.1-compliant. The role="status" pattern with a single aria-label and aria-hidden skeleton blocks is the correct and recommended approach — it provides a single, polite announcement that content is loading, preventing screen reader clutter. The proposed fix is merely documentation (a code comment), which contradicts the "Minor" severity rating implying a real usability friction. There is no actual accessibility or usability defect here; only an opportunity to add clarifying comments for maintainers, which would be Polish-level at most.
