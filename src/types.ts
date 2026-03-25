// ─── Domain entities (component-side shapes) ───

export interface Human {
  id: string;
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
  trustedIds: string[];
  historyFlag?: string;
}

export interface Dog {
  id: string;
  name: string;
  breed: string;
  age: string;
  humanId: string;
  alerts: string[];
  groomNotes: string;
  customPrice?: string;
}

export type DogSize = "small" | "medium" | "large";

export type ServiceId = "full_groom" | "bath_brush" | "bath_deshed" | "puppy_cut";

export type BookingStatus = "Not Arrived" | "Checked In" | "In the Bath" | "Ready for Pick-up" | "Completed";

export type PaymentStatus = "Due at Pick-up" | "Deposit Paid" | "Paid in Full" | "Card" | "Cash";

export interface Booking {
  id: number | string;
  slot: string;
  dogName: string;
  breed: string;
  size: DogSize;
  service: ServiceId | string;
  owner: string;
  status?: string;
  addons?: string[];
  pickupBy?: string;
  payment?: string;
  age?: string;
  _dogId?: string;
  _pickupById?: string | null;
  _bookingDate?: string;
}

// ─── Capacity engine ───

export interface SlotCapacity {
  used: number;
  max: number;
  available: number;
  bookings: Booking[];
  isConstrained: boolean;
  isLargeDogApproved: boolean;
  hasLargeDog: boolean;
}

export interface LargeDogSlotConfig {
  seats: number;
  canShare: boolean;
  needsApproval: boolean;
  conditional?: boolean;
}

export interface CanBookResult {
  allowed: boolean;
  reason?: string;
  needsApproval?: boolean;
}

// ─── Config ───

export interface Service {
  id: ServiceId;
  name: string;
  icon: string;
}

export interface DayConfig {
  key: string;
  label: string;
  full: string;
  defaultOpen: boolean;
}

export interface SalonConfig {
  defaultPickupOffset: number;
  pricing: Record<string, Record<DogSize, string>>;
  enforceCapacity: boolean;
  largeDogSlots: Record<string, LargeDogSlotConfig>;
}

export interface DaySettings {
  isOpen: boolean;
  overrides: Record<string, Record<string, string>>;
  extraSlots: string[];
}

export interface AlertOption {
  label: string;
  color: string;
}

// ─── DB row shapes (from Supabase) ───

export interface DbHumanRow {
  id: string;
  name: string;
  surname: string;
  phone: string | null;
  sms: boolean | null;
  whatsapp: boolean | null;
  email: string | null;
  fb: string | null;
  insta: string | null;
  tiktok: string | null;
  address: string | null;
  notes: string | null;
  history_flag: string | null;
}

export interface DbDogRow {
  id: string;
  name: string;
  breed: string;
  age: string | null;
  human_id: string;
  alerts: string[] | null;
  groom_notes: string | null;
  custom_price: string | null;
}

export interface DbBookingRow {
  id: string;
  booking_date: string;
  slot: string;
  dog_id: string;
  size: DogSize;
  service: string;
  status: string | null;
  addons: string[] | null;
  pickup_by_id: string | null;
  payment: string | null;
}

// ─── Utility types ───

export type HumansMap = Record<string, Human>;
export type DogsMap = Record<string, Dog>;
export type BookingsByDate = Record<string, Booking[]>;

export interface HumanByIdEntry {
  id: string;
  name: string;
  surname: string;
  fullName: string;
  [key: string]: unknown;
}

export type HumansById = Record<string, HumanByIdEntry>;
export type DogsById = Record<string, DbDogRow>;

// ─── Date info ───

export interface DateInfo {
  full: string;
  dayNum: number;
  monthShort: string;
  year: number;
  dateObj: Date;
  dateStr: string;
}
