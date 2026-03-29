/**
 * useModalState — manages all modal open/close state for App.jsx.
 * Extracted from App.jsx to reduce its size and improve testability.
 */
import { useState, useCallback } from "react";

interface NewBookingData {
  dateStr: string;
  slot: string;
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
  rebookData: any | null;
  setRebookData: (data: any | null) => void;
  showRebookDatePicker: boolean;
  setShowRebookDatePicker: (show: boolean) => void;
  // Callbacks
  openNewBooking: (dateStr: string, slot: string) => void;
  closeNewBooking: () => void;
  closeRebook: () => void;
}

export function useModalState(): UseModalStateReturn {
  const [selectedHumanId, setSelectedHumanId] = useState<string | null>(null);
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [rebookData, setRebookData] = useState<any | null>(null);
  const [showNewBooking, setShowNewBooking] = useState<NewBookingData | null>(null);
  const [showAddDogModal, setShowAddDogModal] = useState<boolean>(false);
  const [showAddHumanModal, setShowAddHumanModal] = useState<boolean>(false);
  const [showRebookDatePicker, setShowRebookDatePicker] = useState<boolean>(false);

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
    openNewBooking,
    closeNewBooking,
    closeRebook,
  };
}
