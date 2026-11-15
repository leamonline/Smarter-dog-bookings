// Staff view of the trusted humans a customer added in the portal. Lives in
// supabase/hooks so the shared panel never imports the client (Debt #12).
// Offline / sample-data mode has no such contacts, so it answers an empty list.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../client";
import {
  listCustomerAddedContacts,
  removeCustomerAddedContact,
  type CustomerAddedContact,
} from "../repositories/trustedContactsRepo";
import { logger } from "../../lib/logger";

export function useCustomerAddedContacts(ownerHumanId: string | null | undefined) {
  const [contacts, setContacts] = useState<CustomerAddedContact[]>([]);

  useEffect(() => {
    setContacts([]);
    if (!supabase || !ownerHumanId) return undefined;
    let cancelled = false;
    void listCustomerAddedContacts(supabase, ownerHumanId).then(({ contacts: rows, error }) => {
      if (error) {
        logger.error("Customer-added trusted contacts read failed", error, {
          tags: { component: "useCustomerAddedContacts", op: "list" },
        });
        return;
      }
      if (!cancelled) setContacts(rows);
    });
    return () => { cancelled = true; };
  }, [ownerHumanId]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    if (!supabase) return false;
    const { removed, error } = await removeCustomerAddedContact(supabase, id);
    if (error || !removed) {
      if (error) {
        logger.error("Removing a customer-added trusted contact failed", error, {
          tags: { component: "useCustomerAddedContacts", op: "remove" },
        });
      }
      return false;
    }
    setContacts((prev) => prev.filter((c) => c.id !== id));
    return true;
  }, []);

  return { contacts, remove };
}
