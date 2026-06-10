/**
 * useModalState — manages all modal open/close state for App.jsx.
 * Extracted from App.jsx to reduce its size and improve testability.
 */
import { useState, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Booking } from "../types/index";

/**
 * Rebook prefill: a full Booking spread with the staff-selected target
 * date attached. Built by useRebookFlow's handleOpenRebook and consumed
 * by WeekCalendarView's rebook overlay (which also updates `slot`,
 * `date` and `dateStr` via functional setState — hence the Dispatch
 * type on the setter below).
 */
export interface RebookData extends Booking {
  date: Date;
  dateStr: string;
}

interface NewBookingData {
  dateStr: string;
  slot: string;
  initialHumanId?: string;
  // "Book again" prefill — seed the wizard with a specific dog + service.
  initialDogId?: string;
  initialService?: string;
  initialAddons?: string[];
}

interface UseModalStateReturn {
  // State
  selectedHumanId: string | null;
  setSelectedHumanId: (id: string | null) => void;
  selectedDogId: string | null;
  setSelectedDogId: (id: string | null) => void;
  showDatePicker: boolean;
  setShowDatePicker: (show: boolean) => void;
  showNewBooking: NewBookingData | null;
  setShowNewBooking: (data: NewBookingData | null) => void;
  showAddDogModal: boolean;
  setShowAddDogModal: (show: boolean) => void;
  showAddHumanModal: boolean;
  setShowAddHumanModal: (show: boolean) => void;
  rebookData: RebookData | null;
  setRebookData: Dispatch<SetStateAction<RebookData | null>>;
  showRebookDatePicker: boolean;
  setShowRebookDatePicker: (show: boolean) => void;
  collectionNotice: Booking | null;
  setCollectionNotice: (booking: Booking | null) => void;
  selectedBooking: Booking | null;
  setSelectedBooking: (booking: Booking | null) => void;
  // Callbacks
  openNewBooking: (dateStr: string, slot: string) => void;
  closeNewBooking: () => void;
  closeRebook: () => void;
}

export function useModalState(): UseModalStateReturn {
  const [selectedHumanId, setSelectedHumanId] = useState<string | null>(null);
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [rebookData, setRebookData] = useState<RebookData | null>(null);
  const [showNewBooking, setShowNewBooking] = useState<NewBookingData | null>(null);
  const [showAddDogModal, setShowAddDogModal] = useState<boolean>(false);
  const [showAddHumanModal, setShowAddHumanModal] = useState<boolean>(false);
  const [showRebookDatePicker, setShowRebookDatePicker] = useState<boolean>(false);
  const [collectionNotice, setCollectionNotice] = useState<Booking | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const openNewBooking = useCallback((dateStr: string, slot: string) => {
    setShowNewBooking({ dateStr, slot });
  }, []);

  const closeNewBooking = useCallback(() => {
    setShowNewBooking(null);
  }, []);

  const closeRebook = useCallback(() => {
    setRebookData(null);
    setShowRebookDatePicker(false);
  }, []);

  return {
    selectedHumanId,
    setSelectedHumanId,
    selectedDogId,
    setSelectedDogId,
    showDatePicker,
    setShowDatePicker,
    showNewBooking,
    setShowNewBooking,
    showAddDogModal,
    setShowAddDogModal,
    showAddHumanModal,
    setShowAddHumanModal,
    rebookData,
    setRebookData,
    showRebookDatePicker,
    setShowRebookDatePicker,
    collectionNotice,
    setCollectionNotice,
    selectedBooking,
    setSelectedBooking,
    openNewBooking,
    closeNewBooking,
    closeRebook,
  };
}
