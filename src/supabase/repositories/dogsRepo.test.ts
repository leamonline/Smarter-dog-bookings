import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { listForHuman, updateForCustomer } from "./dogsRepo";

const DOG = "42000000-0000-4000-8000-000000000001";
const HUMAN = "41000000-0000-4000-8000-000000000001";

function fakeRpcClient(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("updateForCustomer", () => {
  const rpcRow = {
    id: DOG,
    name: "Alfred",
    breed: "Boston Terrier",
    size: null,
    reported_size: "small",
    dob: "2022-05",
    human_id: HUMAN,
  };

  it("calls the narrow RPC and maps the row to the app shape", async () => {
    const { client, rpc } = fakeRpcClient({ data: [rpcRow], error: null });

    const { dog, error } = await updateForCustomer(client, {
      dogId: DOG,
      name: "Alfred",
      breed: "Boston Terrier",
      size: "small",
      dob: "2022-05",
    });

    expect(rpc).toHaveBeenCalledWith("update_customer_dog", {
      p_dog_id: DOG,
      p_name: "Alfred",
      p_breed: "Boston Terrier",
      p_size: "small",
      p_dob: "2022-05",
    });
    expect(error).toBeNull();
    // Deliberately a partial: no isPregnant — callers merge over their dog.
    expect(dog).toEqual({
      id: DOG,
      name: "Alfred",
      breed: "Boston Terrier",
      size: null,
      reportedSize: "small",
      dob: "2022-05",
    });
  });

  it("preserves the RPC's stable error message for friendly-copy mapping", async () => {
    const { client } = fakeRpcClient({
      data: null,
      error: { message: "dog_not_found" },
    });

    const { dog, error } = await updateForCustomer(client, {
      dogId: DOG,
      name: "Alfred",
      breed: "",
      size: "",
      dob: null,
    });

    expect(dog).toBeNull();
    expect(error?.message).toBe("dog_not_found");
  });

  it("treats an empty result as an error rather than success", async () => {
    const { client } = fakeRpcClient({ data: [], error: null });

    const { dog, error } = await updateForCustomer(client, {
      dogId: DOG,
      name: "Alfred",
      breed: "",
      size: "",
      dob: null,
    });

    expect(dog).toBeNull();
    expect(error?.message).toMatch(/returned no row/);
  });
});

describe("listForHuman", () => {
  it("maps rows to CustomerDog including dob", async () => {
    const row = {
      id: DOG,
      name: "alfie",
      breed: "boston terrier",
      size: "small",
      reported_size: null,
      is_pregnant: true,
      dob: "2022-05",
    };
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order"]) {
      q[m] = vi.fn(() => q);
    }
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: [row], error: null }).then(resolve, reject);
    const client = { from: vi.fn(() => q) } as unknown as SupabaseClient;

    const { dogs, error } = await listForHuman(client, { humanId: HUMAN });

    expect(error).toBeNull();
    expect(dogs).toEqual([
      {
        id: DOG,
        name: "alfie",
        breed: "boston terrier",
        size: "small",
        reportedSize: null,
        isPregnant: true,
        dob: "2022-05",
      },
    ]);
  });
});
