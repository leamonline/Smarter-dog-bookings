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
  vet?: string | null;
  colour?: string | null;
  size: DogSize | null;
  humanId: string;
  _humanId: string | null;
  alerts: string[];
  groomNotes: string;
  customPrice: number | undefined;
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
  customerPortal: CustomerPortalSettings;
  notifications: Record<string, NotificationSetting>;
  services: SalonService[];
}

export interface SalonConfig extends SalonSettings {
  defaultPickupOffset: number;
  pricing: Record<string, Record<string, string>>;
  enforceCapacity: boolean;
  largeDogSlots: Record<string, LargeDogSlotRule>;
}

export interface DaySettings {
  isOpen: boolean;
  overrides: Record<string, SlotOverrides>;
  extraSlots: string[];
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
