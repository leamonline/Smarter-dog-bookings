// Thin action hook so customer components can create and edit their own dogs
// without importing the Supabase client directly (Debt #12). Both writes go
// through the SECURITY DEFINER RPCs via dogsRepo; a missing client surfaces
// as an ordinary error the components already turn into friendly copy.
import { useCallback } from "react";
import { customerSupabase } from "../customerClient";
import {
  createForHuman,
  updateForCustomer,
  type CustomerDog,
  type CustomerDogUpdate,
} from "../repositories/dogsRepo";
import type { DogSize } from "../../constants/salon";

export function useCustomerDogActions() {
  const createDog = useCallback(
    async (input: {
      humanId: string;
      name: string;
      breed?: string | null;
      size?: DogSize | null;
    }): Promise<{ dog: CustomerDog | null; error: Error | null }> => {
      if (!customerSupabase) return { dog: null, error: new Error("Not connected") };
      return createForHuman(customerSupabase, input);
    },
    [],
  );

  const updateDog = useCallback(
    async (input: {
      dogId: string;
      name: string;
      breed: string;
      size: string;
      dob: string | null;
    }): Promise<{ dog: CustomerDogUpdate | null; error: Error | null }> => {
      if (!customerSupabase) return { dog: null, error: new Error("Not connected") };
      return updateForCustomer(customerSupabase, input);
    },
    [],
  );

  return { createDog, updateDog };
}
