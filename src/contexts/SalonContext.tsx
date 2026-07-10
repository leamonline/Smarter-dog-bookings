/**
 * SalonContext — provides shared salon data and callbacks to deeply-nested
 * components, eliminating the 20+ prop pass-through via SlotRow → BookingCard.
 *
 * Data consumers call `useSalon()` instead of accepting props.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Booking, Dog, Human, DaySettings, BookingsByDate } from "../types/index";
import type { PricingConfig } from "../engine/bookingRules";

export interface SalonContextValue {
  dogs: Record<string, Dog>;
  humans: Record<string, Human>;
  bookingsByDate: BookingsByDate;
  daySettings: Record<string, DaySettings>;
  dayOpenState: boolean;
  currentDateStr: string;
  currentDateObj: Date;
  onAdd: (booking: Booking, targetDateStr?: string) => void | Promise<void>;
  onUpdate: (booking: Booking) => void | Promise<void>;
  onRemove: (bookingId: string) => void | Promise<void>;
  onUpdateDog: (dog: Dog) => void | Promise<void>;
  /** Staff update path for a human (key, patch) — used by the booking
   *  detail's delivery-failure "Fix the number" inline save. */
  onUpdateHuman: (humanKey: string, patch: Partial<Human>) => unknown;
  onOpenHuman: (name: string) => void;
  onOpenDog: (name: string) => void;
  /** salon_config.pricing (Settings guide prices, integer pence). Feeds the
   *  price precedence in computeBookingPricing; null until config loads. */
  configPricing?: PricingConfig;
}

const SalonContext = createContext<SalonContextValue | null>(null);

interface SalonProviderProps extends SalonContextValue {
  children: ReactNode;
}

export function SalonProvider({
  children,
  dogs,
  humans,
  bookingsByDate,
  daySettings,
  dayOpenState,
  currentDateStr,
  currentDateObj,
  onAdd,
  onUpdate,
  onRemove,
  onUpdateDog,
  onUpdateHuman,
  onOpenHuman,
  onOpenDog,
  configPricing,
}: SalonProviderProps) {
  const value = useMemo<SalonContextValue>(
    () => ({
      dogs,
      humans,
      bookingsByDate,
      daySettings,
      dayOpenState,
      currentDateStr,
      currentDateObj,
      onAdd,
      onUpdate,
      onRemove,
      onUpdateDog,
      onUpdateHuman,
      onOpenHuman,
      onOpenDog,
      configPricing,
    }),
    [
      dogs,
      humans,
      bookingsByDate,
      daySettings,
      dayOpenState,
      currentDateStr,
      currentDateObj,
      onAdd,
      onUpdate,
      onRemove,
      onUpdateDog,
      onUpdateHuman,
      onOpenHuman,
      onOpenDog,
      configPricing,
    ],
  );

  return (
    <SalonContext.Provider value={value}>{children}</SalonContext.Provider>
  );
}

export function useSalon(): SalonContextValue {
  const ctx = useContext(SalonContext);
  if (!ctx) {
    throw new Error("useSalon must be used within a <SalonProvider>");
  }
  return ctx;
}

/** Settings guide prices, or null when rendered outside the staff app's
 *  SalonProvider (e.g. component tests) — callers fall back to constants. */
export function useSalonPricing(): PricingConfig {
  return useContext(SalonContext)?.configPricing ?? null;
}
