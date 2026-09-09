// Shared types + pure helpers for the dogs sub-hooks (the useDogs split;
// same precedent as humans/helpers.ts for Debt #5). Nothing here touches
// React state — the hooks in this directory import from it.
import type { Dispatch, SetStateAction } from "react";
import { sanitiseFieldValue } from "../../../utils/sanitiseFieldValue";
import type { Database } from "../../database.types";
import type { DbDogRow } from "../../transforms";
import type { HumanCacheEntry } from "../humans/helpers";
import type { Dog, DogSize } from "../../../types/index";

export const PAGE_SIZE = 50;

export type DogRow = Database["public"]["Tables"]["dogs"]["Row"];
export type DogUpdate = Database["public"]["Tables"]["dogs"]["Update"];

/** The owner lookup map useHumans maintains (see humans/helpers for its two shapes). */
export type HumansById = Record<string, HumanCacheEntry>;

/** The raw-row cache that is the single source of truth for dog records. */
export type DogsByIdMap = Record<string, DbDogRow>;
export type SetDogsByIdMap = Dispatch<SetStateAction<DogsByIdMap>>;
export type DogsByHumanIdMap = Record<string, Dog[]>;
export type SetDogsByHumanIdMap = Dispatch<SetStateAction<DogsByHumanIdMap>>;

/** The active directory query (search / filters / sort / letter). */
export type DirFilters = { size: string | null; alert: boolean; incomplete: boolean };
export type DirSort = "name" | "recent";
export interface DirectoryQuery {
  search: string;
  filters: DirFilters;
  sort: DirSort;
  letter: string | null;
}

/** A search_dogs_directory row: a dog row plus the joined owner_* fields. */
export interface DirectoryDogRow extends DbDogRow {
  owner_name?: string | null;
  owner_surname?: string | null;
  owner_phone?: string | null;
  owner_whatsapp?: boolean | null;
}

/** App-shaped patch accepted by updateDog (camelCase, any subset). */
export type DogPatch = Partial<Omit<Dog, "id" | "_humanId">> & {
  /** Soft-archive marker: an ISO timestamp to archive, null to unarchive. */
  archivedAt?: string | null;
};

/** What the Add Dog modal / New client wizard hand to addDog. */
export interface NewDogInput {
  name: string;
  breed: string;
  age?: string | null;
  dob?: string | null;
  /** The modal's field name; stored as `sex`. */
  gender?: string | null;
  microchip?: string | null;
  neutered?: boolean | null;
  vet?: string | null;
  colour?: string | null;
  size?: DogSize | null;
  /** Owner id or display name, resolved via findHumanByIdOrName. */
  humanId?: string | null;
  alerts?: string[];
  groomNotes?: string | null;
  /** The New client wizard's freshly-created owner, before humansById re-renders. */
  _ownerOverride?: { id: string; fullName?: string } | null;
}

// Build a Dogs Directory entry from a search_dogs_directory row. Mirrors
// dbDogsToMap's dog shape but also folds on the joined owner_* fields the RPC
// returns, so the card can render the owner name + tel/WhatsApp links without
// depending on the paginated humansById map. Owner placeholders ("Null" etc.)
// are stripped via sanitiseFieldValue, same as the rest of the directory.
export function buildDirectoryDogEntry(row: DirectoryDogRow, humansById: HumansById) {
  const owner = humansById?.[row.human_id || ""];
  const ownerName = sanitiseFieldValue(row.owner_name);
  const ownerSurname = sanitiseFieldValue(row.owner_surname);
  const ownerFullName =
    [ownerName, ownerSurname].filter(Boolean).join(" ") || owner?.fullName || "";
  return {
    id: row.id,
    name: row.name,
    breed: sanitiseFieldValue(row.breed),
    age: row.age || "",
    size: (row.size as DogSize | null) || null,
    humanId: ownerFullName || row.human_id || "",
    _humanId: row.human_id || null,
    alerts: row.alerts || [],
    groomNotes: row.groom_notes || "",
    customPrice: row.custom_price ?? undefined,
    // Server-resolved owner display fields (from the RPC's join), read by DogsView.
    ownerFullName,
    ownerPhone: row.owner_phone || "",
    ownerWhatsapp: row.owner_whatsapp || false,
  };
}

export type DirectoryDog = ReturnType<typeof buildDirectoryDogEntry>;

/** Drop a human's cached dog list + hydration bookkeeping so it re-fetches. */
export type InvalidateHuman = (humanId: string | null | undefined) => void;
