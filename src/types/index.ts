// ============================================================
// Core type definitions for Smarter Dog Grooming booking app
// ============================================================

export type DogSize = "small" | "medium" | "large";

export type ServiceId = "full-groom" | "bath-and-brush" | "bath-and-deshed" | "puppy-groom";

export interface Service {
  id: ServiceId;
  name: string;
  icon: string;
}

export type BookingStatusId =
  | "Not Arrived"
  | "Checked In"
  | "In the Bath"
  | "Ready for Pick-up"
  | "Completed";

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
  confirmed: boolean;
  _dogId: string;
  _ownerId: string | null;
  _pickupById: string | null;
  _bookingDate: string;
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
