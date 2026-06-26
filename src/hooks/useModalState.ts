/**
 * useModalState — manages all modal open/close state for App.jsx.
 * Extracted from App.jsx to reduce its size and improve testability.
 */
import { useState, useCallback } from "react";
import type { Booking } from "../types/index";

// A parked dog entry — a selected dog plus its booking choices — carried out of
// the wizard while staff create a new dog/human, then restored on resume.
interface BookingEntryDraft {
  dog: Record<string, unknown>;
  humanKey: string;
  service: string;
  addons: string[];
}

interface NewBookingData {
  dateStr: string;
  slot: string;
  initialHumanId?: string;
  // "Book again" prefill — seed the wizard with a specific dog + service.
  initialDogId?: string;
  initialService?: string;
  initialAddons?: string[];
  // Resume prefill — dog entries (existing + any newly created) restored when
  // the wizard re-opens after staff stepped out to add a dog/human mid-booking.
  initialEntries?: BookingEntryDraft[];
}

// A booking-in-progress parked while staff create a new dog/human. Pure UI
// state used only to re-open the wizard with the staff member's work intact.
interface PendingBooking {
  dateStr: string;
  slot: string;
  entries: BookingEntryDraft[];
  owner: { id: string; label: string; phone: string } | null;
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
  showNewClient: boolean;
  setShowNewClient: (show: boolean) => void;
  pendingBooking: PendingBooking | null;
  setPendingBooking: (data: PendingBooking | null) => void;
  collectionNotice: Booking | null;
  setCollectionNotice: (booking: Booking | null) => void;
  selectedBooking: Booking | null;
  setSelectedBooking: (booking: Booking | null) => void;
  // Callbacks
  openNewBooking: (dateStr: string, slot: string) => void;
  closeNewBooking: () => void;
}

export function useModalState(): UseModalStateReturn {
  const [selectedHumanId, setSelectedHumanId] = useState<string | null>(null);
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [showNewBooking, setShowNewBooking] = useState<NewBookingData | null>(null);
  const [showAddDogModal, setShowAddDogModal] = useState<boolean>(false);
  const [showAddHumanModal, setShowAddHumanModal] = useState<boolean>(false);
  const [showNewClient, setShowNewClient] = useState<boolean>(false);
  const [pendingBooking, setPendingBooking] = useState<PendingBooking | null>(null);
  const [collectionNotice, setCollectionNotice] = useState<Booking | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const openNewBooking = useCallback((dateStr: string, slot: string) => {
    setShowNewBooking({ dateStr, slot });
  }, []);

  const closeNewBooking = useCallback(() => {
    setShowNewBooking(null);
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
    showNewClient,
    setShowNewClient,
    pendingBooking,
    setPendingBooking,
    collectionNotice,
    setCollectionNotice,
    selectedBooking,
    setSelectedBooking,
    openNewBooking,
    closeNewBooking,
  };
}
