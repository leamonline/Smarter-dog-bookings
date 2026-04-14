// ============================================================
// Core type definitions for Smarter Dog Grooming booking app
// ============================================================

export type DogSize = "small" | "medium" | "large";

export type ServiceId = "full-groom" | "bath-and-brush" | "bath-and-deshed" | "puppy-groom";

export interface Service {
  id: ServiceId;
  name: string;
}

export type BookingStatusId =
  | "No-show"
  | "Checked in"
  | "Ready for pick-up";

export interface BookingStatus {
  id: BookingStatusId;
  label: string;
  color: string;
  bg: string;
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
}

export interface Dog {
  id: string;
  name: string;
  breed: string;
  age: string;
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

export interface SalonConfig {
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

export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  selectedDogs: WizardDog[];
  services: Record<string, ServiceId>;
  selectedDate: string | null;
  selectedSlot: string | null;
  slotAllocation: SlotAllocation | null;
}

export interface PaginatedResult<T> {
  items: T[];
  hasMore: boolean;
  totalCount: number;
}

export interface SearchState {
  query: string;
  isSearching: boolean;
}

export interface BookingHistoryEntry {
  id: string;
  date: string;
  slot: string;
  service: string;
  status: string;
  size: string;
  addons: string[];
  payment: string;
}

export interface NotificationLog {
  id: string;
  bookingId: string;
  groupId: string | null;
  humanId: string;
  channel: "whatsapp" | "sms" | "email";
  triggerType: "confirmed" | "reminder" | "cancelled";
  status: "sent" | "failed" | "pending";
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface CalendarFeedToken {
  id: string;
  humanId: string | null;
  staffUserId: string | null;
  token: string;
  feedType: "customer" | "staff";
  isActive: boolean;
  createdAt: string;
  expiresAt: string | null;
  lastAccessed: string | null;
}
