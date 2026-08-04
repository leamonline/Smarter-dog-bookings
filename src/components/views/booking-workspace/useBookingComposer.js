// ============================================================
// src/components/views/booking-workspace/useBookingComposer.js
//
// Per-conversation state for the Booking pane's two staff actions.
//
// Deliberately the ONLY stateful piece: it lives above the responsive layout
// switch so rotating an iPad, resizing a window or moving between the
// three-column and drawer layouts never clears a half-made selection. State
// resets on exactly three events — the conversation changes, staff cancel, or
// a booking completes.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  MAX_OFFER_SLOTS,
  buildOfferText,
  defaultServiceFor,
  isDogSelectable,
  toggleOfferSlot,
} from "./bookingComposerModel.js";

/** Stages for the narrow-viewport staged flow. Wide layouts show all at once. */
export const STAGES = ["dogs", "slots", "review"];

const EMPTY = {
  mode: null,
  stage: "dogs",
  selectedDogIds: [],
  servicesByDogId: {},
  slotChoices: [],
};

export function useBookingComposer({ conversationId, dogs, lastServiceByDogId }) {
  const [state, setState] = useState(EMPTY);

  // Reset only on a genuine conversation change. A re-render caused by
  // re-layout must never clear staff's work, so this keys off the id alone.
  const previousConversation = useRef(conversationId);
  useEffect(() => {
    if (previousConversation.current === conversationId) return;
    previousConversation.current = conversationId;
    setState(EMPTY);
  }, [conversationId]);

  const dogsById = useMemo(
    () => Object.fromEntries((dogs || []).map((dog) => [dog.id, dog])),
    [dogs],
  );

  const setMode = useCallback((mode) => {
    setState((prev) => ({ ...prev, mode, stage: "dogs" }));
  }, []);

  const goToStage = useCallback((stage) => {
    setState((prev) => (STAGES.includes(stage) ? { ...prev, stage } : prev));
  }, []);

  const toggleDog = useCallback((dogId) => {
    setState((prev) => {
      const dog = dogsById[dogId];
      // Guarded here as well as in the picker: a dog with no authoritative
      // size can never enter an availability calculation.
      if (!isDogSelectable(dog)) return prev;

      const selected = prev.selectedDogIds.includes(dogId);
      const selectedDogIds = selected
        ? prev.selectedDogIds.filter((id) => id !== dogId)
        : [...prev.selectedDogIds, dogId];

      const servicesByDogId = { ...prev.servicesByDogId };
      if (selected) {
        delete servicesByDogId[dogId];
      } else {
        servicesByDogId[dogId] = defaultServiceFor(dog, lastServiceByDogId);
      }

      // Changing the dog set changes what fits, so previously chosen times
      // can no longer be trusted.
      return { ...prev, selectedDogIds, servicesByDogId, slotChoices: [] };
    });
  }, [dogsById, lastServiceByDogId]);

  const setService = useCallback((dogId, serviceId) => {
    setState((prev) => ({
      ...prev,
      servicesByDogId: { ...prev.servicesByDogId, [dogId]: serviceId },
    }));
  }, []);

  const toggleSlot = useCallback((choice) => {
    setState((prev) => {
      const slotChoices = toggleOfferSlot(prev.slotChoices, choice);
      return slotChoices === prev.slotChoices ? prev : { ...prev, slotChoices };
    });
  }, []);

  const clearSlots = useCallback(() => {
    setState((prev) => ({ ...prev, slotChoices: [] }));
  }, []);

  const cancel = useCallback(() => setState(EMPTY), []);

  const selectedDogs = useMemo(
    () => state.selectedDogIds.map((id) => dogsById[id]).filter(Boolean),
    [dogsById, state.selectedDogIds],
  );

  const offerText = useCallback(
    (customerName) =>
      buildOfferText({
        customerName,
        dogs: selectedDogs,
        choices: state.slotChoices,
      }),
    [selectedDogs, state.slotChoices],
  );

  return {
    mode: state.mode,
    stage: state.stage,
    selectedDogIds: state.selectedDogIds,
    selectedDogs,
    servicesByDogId: state.servicesByDogId,
    slotChoices: state.slotChoices,
    atSlotLimit: state.slotChoices.length >= MAX_OFFER_SLOTS,
    canSubmitOffer: selectedDogs.length > 0 && state.slotChoices.length > 0,
    offerText,
    actions: {
      setMode,
      goToStage,
      toggleDog,
      setService,
      toggleSlot,
      clearSlots,
      cancel,
    },
  };
}
