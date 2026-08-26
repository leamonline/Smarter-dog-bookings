// ============================================================
// Core type definitions for Smarter Dog Grooming booking app
// ============================================================

import type { DogSize, BookingStatus } from "../constants/salon";
export type { DogSize };

export type ServiceId = "full-groom" | "bath-and-brush" | "bath-and-deshed" | "puppy-groom";

export interface Service {
  id: ServiceId;
  name: string;
}

// Derived from the BOOKING_STATUS runtime const (constants/salon.ts) so this
// type can never drift from the canonical status list again.
export type BookingStatusId = BookingStatus;

// Lifecycle of the "are you still coming?" reminder for a booking. One
// source of truth that drives the ReminderCard's colour, icon, status
// text and which action is shown:
//   none      → not sent yet (neutral)
//   sent      → delivered, awaiting a read receipt (amber)
//   read      → customer opened it (blue)
//   confirmed → customer confirmed they're coming (green — the goal)
export type ReminderState = "none" | "sent" | "read" | "confirmed";

export interface TrustedContact {
  id: string;
  fullName: string;
  relationship: string;
}

export interface Human {
  id: string;
  fullName: string;
  name: string;
  surname: string;
  phone: string;
  sms: boolean;
  whatsapp: boolean;
  email: string;
  fb: string;
  insta: string;
  tiktok: string;
  address: string;
  notes: string;
  historyFlag: string;
  reminderHours: number;
  reminderChannels: string[];
  /** Booking rules (staff-managed on the human card, migration 20260714120000). */
  preferredSlots?: string[];
  blockedSlots?: string[];
  depositRequired?: boolean;
  /** Staff-managed opt-out for AI-initiated WhatsApp messages. */
  aiWhatsappAllowed?: boolean;
  trustedIds: string[];
  trustedContacts: TrustedContact[];
}

export interface Dog {
  id: string;
  name: string;
  breed: string;
  age: string;
  dob?: string;
  sex?: string | null;
  microchip?: string | null;
  neutered?: boolean | null;
  isPregnant?: boolean | null;
  vet?: string | null;
  colour?: string | null;
  size: DogSize | null;
  humanId: string;
  _humanId: string | null;
  alerts: string[];
  groomNotes: string;
  customPrice: number | undefined;
  // Most recent date a booking for this dog reached Completed (forward-only).
  lastGroomedDate?: string | null;
}

export interface Booking {
  id: string;
  dogName: string;
  breed: string;
  size: DogSize;
  service: ServiceId;
  owner: string;
  status: BookingStatusId;
  slot: string;
  addons: string[];
  pickupBy: string;
  payment: string;
  depositAmount?: number | null;
  /** Deposit-required workflow (owner tagged; DB-stamped, read-only here). */
  depositRequired?: boolean;
  depositReference?: string | null;
  depositDueBy?: string | null;
  depositReceivedAt?: string | null;
  // Minimal payment ledger (improvement #3): how + when settled. Populated by
  // the DB read path; paidAt is trigger-stamped, method/amount are staff-set.
  paymentMethod?: string | null;
  paidAt?: string | null;
  paidAmount?: number | null;
  // This booking's one-off agreed price (pounds) — beats the dog's usual
  // custom_price and the guide price for THIS visit only. Null = no override.
  priceOverride?: number | null;
  confirmed: boolean;
  dogNameSnapshot: string | null;
  breedSnapshot: string | null;
  ownerNameSnapshot: string | null;
  whatsappConversationId: string | null;
  whatsappMessageId: string | null;
  // Staff capacity override audit. True when a staff member explicitly
  // chose to book over a physical-capacity rule. _by and _at are filled
  // by the validate_booking_capacity DB trigger from auth.uid() / now()
  // — clients can't spoof them.
  staffCapacityOverride: boolean;
  staffCapacityOverrideBy: string | null;
  staffCapacityOverrideAt: string | null;
  reminderConfirmedAt: string | null;
  // When the booking was marked Completed (cleared if moved back out). Only the
  // DB read path populates it; optional for the many Booking constructors.
  completedAt?: string | null;
  // Arrival + ready marks powering the Today view queues (waiting/overdue copy).
  // Set once on the transition into Checked-in / Ready by the lifecycle trigger;
  // null on rows created before migration 20260702180000 and offline.
  checkedInAt?: string | null;
  readyAt?: string | null;
  // Free-text booking / handover notes (Today view). Optional: only the DB read
  // path populates it and it may be undefined offline.
  notes?: string | null;
  // Cancellation reason ('No-show', etc.) and origin (portal, whatsapp_flow,
  // staff). Populated by the DB read path; used by the reports.
  cancelReason?: string | null;
  source?: string | null;
  // How confirmation was handled ('auto'|'whatsapp'|'sms'|'email'|'none').
  // 'none' means the booking was never asked to confirm — the Today view must
  // not flag it as awaiting confirmation. Populated by the DB read path.
  confirmationChannel?: string | null;
  // When the "ready for collection" message was last sent (notification_log
  // type 'ready', status 'sent'). Drives the collection queue's sent state;
  // null when unsent or offline.
  collectionSentAt?: string | null;
  // Who created the booking + when (denormalised from resolve_event_actor on
  // insert). Optional: only the DB read path populates them; null for legacy
  // rows created before attribution existed.
  createdAt?: string | null;
  createdById?: string | null;
  createdByRole?: string | null;
  createdByName?: string | null;
  // Reminder lifecycle (see ReminderState). `reminderState` is the single
  // field the ReminderCard reads; the timestamps/`reminderConfirmedBy` are
  // optional metadata the card surfaces when present. Optional so the many
  // Booking constructors don't all have to set them — transforms populates
  // the real read path and the card falls back to "none".
  reminderState?: ReminderState;
  reminderSentAt?: string | null;
  reminderReadAt?: string | null;
  reminderConfirmedBy?: string | null;
  reminderChannel?: string | null;
  _dogId: string;
  _ownerId: string | null;
  _pickupById: string | null;
  _bookingDate: string;
  _groupId: string | null;
  /** Transient UI instruction; never persisted to the bookings table. */
  _skipCollectionPrompt?: boolean;
  /**
   * Transient UI instruction: this update is a staff confirmation, so the
   * write path stamps reminder_confirmed_at/_source = 'staff'. A later real
   * customer confirmation overwrites it (mark_reminder_confirmed).
   */
  _confirmArrival?: boolean;
  /**
   * Transient UI instruction: undo of a staff confirmation. The write path
   * clears the confirmation pair, filtered on source='staff', so a customer's
   * own confirmation that raced in is never wiped.
   */
  _unconfirmArrival?: boolean;
  /**
   * Transient, in-memory only: the derived reminderState before a staff
   * confirmation, so an Undo can revert it truthfully while offline.
   */
  _preConfirmReminderState?: string;
}

export type BookingsByDate = Record<string, Booking[]>;

export interface SlotCapacity {
  used: number;
  max: number;
  baseMax: number;
  available: number;
  bookings: Booking[];
  isConstrained: boolean;
  isLargeDogApproved: boolean;
  hasLargeDog: boolean;
  isEarlyClosed: boolean;
}

export type SlotCapacities = Record<string, SlotCapacity>;

export type SeatType = "booking" | "reserved" | "available" | "blocked";

export interface SeatState {
  type: SeatType;
  seatIndex: number;
  booking?: Booking;
  staffBlocked?: boolean;
  staffOpened?: boolean;
  isEarlyClosed?: boolean;
}

export interface BookingResult {
  allowed: boolean;
  reason?: string;
  needsApproval?: boolean;
}

export type SlotOverrides = Record<number, "blocked" | "open">;

export interface SalonService {
  id: string;
  name: string;
  icon?: string;
}

export interface BusinessDayHours {
  open: string;
  close: string;
  closed: boolean;
}

export interface SalonClosure {
  date: string;
  label: string;
}

export interface CustomerPortalSettings {
  showUpcoming: boolean;
  showHistory: boolean;
  allowRebooking: boolean;
  allowCancellations: boolean;
}

export interface BookingPolicyCustomerPortalSettings {
  allowCancellations: boolean;
  allowRescheduling: boolean;
  allowRepeatBooking: boolean;
  showHistory: boolean;
}

export interface BookingPolicyRules {
  bookingHorizonDays: number;
  autoConfirm: boolean;
  depositHoldHours: 6 | 12 | 24 | 36 | 48;
  depositBank: {
    accountName: string;
    sortCode: string;
    accountNumber: string;
  };
  termsUrl: string;
  depositTermsVersion: string | null;
  depositTermsContentHash: string | null;
  customerPortal: BookingPolicyCustomerPortalSettings;
}

export interface NotificationSetting {
  enabled: boolean;
  channels: string[];
}

export interface SalonSettings {
  businessName: string;
  businessPhone: string;
  businessEmail: string;
  businessAddress: string;
  businessHours: Record<string, BusinessDayHours>;
  closures: SalonClosure[];
  advanceBookingWeeks: number;
  minCancellationHours: number;
  autoConfirm: boolean;
  /** Bank details customers are GIVEN to pay deposits into (not secrets).
   *  Read by the deposit panels (staff + portal) via getDepositSettings. */
  depositBank: { accountName: string; sortCode: string; accountNumber: string };
  /** Hours an unpaid deposit booking holds its slot (default 12). The SQL
   *  helper deposit_due_by_for reads this exact camelCase key from
   *  salon_config.settings. */
  depositReleaseHours: number;
  customerPortal: CustomerPortalSettings;
  notifications: Record<string, NotificationSetting>;
  services: SalonService[];
}

export interface SalonConfig extends SalonSettings {
  defaultPickupOffset: number;
  /** Guide prices in integer pence (null = size not offered). Legacy "£42"
   *  strings tolerated until the pence migration has run everywhere. */
  pricing: Record<string, Record<string, string | number | null>>;
  enforceCapacity: boolean;
  /** Maximum total dogs that can be booked in a single day (across all slots). */
  dailyDogCap: number;
  largeDogSlots: Record<string, LargeDogSlotRule>;
}

export interface DaySettings {
  isOpen: boolean;
  overrides: Record<string, SlotOverrides>;
  extraSlots: string[];
  /** Slots staff opened for same-day ("last minute") customer booking. */
  immediateSlots: string[];
}

export interface LargeDogSlotRule {
  seats: number;
  canShare: boolean;
  needsApproval?: boolean;
  conditional?: boolean;
}

export interface DayConfig {
  key: string;
  label: string;
  full: string;
  defaultOpen: boolean;
}

export interface WizardDog {
  dogId: string;
  name: string;
  size: DogSize;
}

export interface SlotAllocation {
  dropOffTime: string;
  assignments: Array<{ dogId: string; slot: string }>;
  groupId: string;
}

// Visit-level booking policy model (previous_day_1500_v1). PostgreSQL stays
// authoritative for every deadline and permission decision.
export type {
  BookingPolicyRuntimeState,
  BookingPolicyRuntimeStatus,
  BookingVisit,
  DepositSatisfactionSource,
  DepositState,
  IncidentKind,
  StaffBookingChangeRequest,
  StaffBookingPolicyIncident,
  VisitActionability,
  VisitApprovalState,
  VisitCapabilities,
  VisitConfirmationState,
  VisitDeposit,
  VisitLifecycleState,
  VisitPolicyCode,
} from "./bookingPolicy";
