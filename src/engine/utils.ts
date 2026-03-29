import { ALL_DAYS } from "../constants/index.js";
import type { DayConfig } from "../types/index.js";

export const formatFullDate = (d: Date): string => {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

/**
 * Returns whether a given date falls on a default-open day.
 * Uses ALL_DAYS from constants so the logic stays in sync everywhere.
 */
export const getDefaultOpenForDate = (date: Date): boolean => {
  const dayOfWeek = date.getDay();              // 0 = Sun ... 6 = Sat
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // convert to Mon-first index
  return (ALL_DAYS as DayConfig[])[dayIndex]?.defaultOpen ?? false;
};

export const getDefaultPickupTime = (startStr: string): string => {
  if (!startStr) return "\u2014";
  let [h, m] = startStr.split(":").map(Number);
  m += 120; // Default 120 mins
  h += Math.floor(m / 60);
  m = m % 60;
  if (h >= 24) h -= 24; // handle midnight overflow
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
};

export const generateTimeOptions = (startStr: string): string[] => {
  const options: string[] = [];
  if (!startStr) return options;
  const [h, m] = startStr.split(":").map(Number);
  const startTotalMins = h * 60 + m;
  const maxTotalMins = 17 * 60; // 17:00 (5:00 pm)

  for (let currentMins = startTotalMins + 30; currentMins <= maxTotalMins; currentMins += 10) {
    const currentH = Math.floor(currentMins / 60);
    const currentM = currentMins % 60;
    const ampm = currentH >= 12 ? 'pm' : 'am';
    const h12 = currentH > 12 ? currentH - 12 : (currentH === 0 ? 12 : currentH);
    options.push(`${h12}:${currentM.toString().padStart(2, '0')}${ampm}`);
  }
  return options;
};
