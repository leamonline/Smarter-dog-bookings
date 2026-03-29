/**
 * SalonContext — provides shared salon data and callbacks to deeply-nested
 * components, eliminating the 20+ prop pass-through via SlotRow → BookingCard.
 *
 * Data consumers call `useSalon()` instead of accepting props.
 */
import { createContext, useContext, useMemo } from "react";

const SalonContext = createContext(null);

export function SalonProvider({
  children,
  dogs,
  humans,
  bookingsByDate,
  daySettings,
  dayOpenState,
  currentDateStr,
  currentDateObj,
  onUpdate,
  onRemove,
  onUpdateDog,
  onOpenHuman,
  onOpenDog,
  onRebook,
}) {
  const value = useMemo(
    () => ({
      dogs,
      humans,
      bookingsByDate,
      daySettings,
      dayOpenState,
      currentDateStr,
      currentDateObj,
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

export function useSalon() {
  const ctx = useContext(SalonContext);
  if (!ctx) {
    throw new Error("useSalon must be used within a <SalonProvider>");
  }
  return ctx;
}
