/**
 * SalonContext — provides shared salon data and callbacks to deeply-nested
 * components, eliminating the 20+ prop pass-through via SlotRow → BookingCard.
 *
 * Data consumers call `useSalon()` instead of accepting props.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Booking, Dog, Human, DaySettings, BookingsByDate } from "../types/index.js";

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
  onOpenHuman: (name: string) => void;
  onOpenDog: (name: string) => void;
  onRebook: (booking: Booking) => void;
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
  onOpenHuman,
  onOpenDog,
  onRebook,
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
      onOpenHuman,
      onOpenDog,
      onRebook,
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
      onOpenHuman,
      onOpenDog,
      onRebook,
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
