// Staff view of the trusted humans a customer added in the portal. Lives in
// supabase/hooks so staff surfaces never import the client (Debt #12).
//
// `status` says whether `contacts` can be believed: a list is only "loaded"
// once its read succeeded. Loading and failed reads leave it empty, and a
// caller must not read that emptiness as "nobody is trusted" — staff use this
// list to decide who may collect a dog. Offline / sample-data mode has no such
// contacts, so it is honestly "loaded" and empty.
//
// Every failure — a returned error or a thrown one — is logged and reported
// through `status`; nothing here may surface as an unhandled rejection in a
// panel that has other work to do.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../client";
import {
  listCustomerAddedContacts,
  removeCustomerAddedContact,
  type CustomerAddedContact,
} from "../repositories/trustedContactsRepo";
import { logger } from "../../lib/logger";

export type CustomerAddedContactsStatus = "loading" | "loaded" | "error";

export function useCustomerAddedContacts(ownerHumanId: string | null | undefined) {
  const [contacts, setContacts] = useState<CustomerAddedContact[]>([]);
  const [status, setStatus] = useState<CustomerAddedContactsStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setContacts([]);
    if (!supabase || !ownerHumanId) {
      setStatus("loaded");
      return undefined;
    }
    const client = supabase;
    let cancelled = false;
    setStatus("loading");
    void (async () => {
      try {
        const { contacts: rows, error } = await listCustomerAddedContacts(client, ownerHumanId);
        if (error) throw error;
        if (cancelled) return;
        setContacts(rows);
        setStatus("loaded");
      } catch (error) {
        logger.error("Customer-added trusted contacts read failed", error, {
          tags: { component: "useCustomerAddedContacts", op: "list" },
        });
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [ownerHumanId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const { removed, error } = await removeCustomerAddedContact(supabase, id);
      if (error) throw error;
      if (!removed) return false;
    } catch (error) {
      logger.error("Removing a customer-added trusted contact failed", error, {
        tags: { component: "useCustomerAddedContacts", op: "remove" },
      });
      return false;
    }
    setContacts((prev) => prev.filter((c) => c.id !== id));
    return true;
  }, []);

  return { contacts, status, retry, remove };
}
