import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createForHuman, getDogPhotoPath, listForHuman, requestSizeCheck, updateForCustomer } from "./dogsRepo";
import type { Database } from "../database.types";

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

describe("getDogPhotoPath", () => {
  function client(result: { data: unknown; error: { message: string } | null }) {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) q[m] = vi.fn(() => q);
    q.maybeSingle = vi.fn(() => Promise.resolve(result));
    return { client: { from: vi.fn(() => q) } as unknown as SupabaseClient, q };
  }

  it("reads back the dog's current photo path", async () => {
    const { client: c, q } = client({ data: { photo_path: `${DOG}/a.jpg` }, error: null });
    expect(await getDogPhotoPath(c, DOG)).toEqual({ photoPath: `${DOG}/a.jpg`, error: null });
    expect(q.select).toHaveBeenCalledWith("photo_path");
    expect(q.eq).toHaveBeenCalledWith("id", DOG);
  });

  it("answers null for a dog with no photo", async () => {
    const { client: c } = client({ data: { photo_path: null }, error: null });
    expect(await getDogPhotoPath(c, DOG)).toEqual({ photoPath: null, error: null });
  });

  it("reports an error, never a guess, when the read fails or finds no dog", async () => {
    const failed = client({ data: null, error: { message: "network" } });
    expect((await getDogPhotoPath(failed.client, DOG)).error?.message).toBe("network");
    const missing = client({ data: null, error: null });
    expect((await getDogPhotoPath(missing.client, DOG)).error?.message).toBe("Dog not found");
  });
});

describe("listForHuman", () => {
  it("maps rows to CustomerDog including dob and the photo path", async () => {
    const row = {
      id: DOG,
      name: "alfie",
      breed: "boston terrier",
      size: "small",
      reported_size: null,
      is_pregnant: true,
      dob: "2022-05",
      photo_path: `${DOG}/photo.jpg`,
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
        photoPath: `${DOG}/photo.jpg`,
      },
    ]);
    expect(q.select).toHaveBeenCalledWith(expect.stringContaining("photo_path"));
  });
});

describe("createForHuman", () => {
  it("keeps the size the server derived from the breed, so a bookable new dog isn't greyed out", async () => {
    const { client } = fakeRpcClient({
      data: [{ id: DOG, name: "Pip", breed: "Pug x Shih Tzu", size: "small", reported_size: "large", human_id: HUMAN }],
      error: null,
    });

    const { dog } = await createForHuman(client, { humanId: HUMAN, name: "Pip", breed: "Pug x Shih Tzu", size: "large" });

    expect(dog).toMatchObject({ size: "small", reportedSize: "large" });
  });

  it("leaves size empty when the server could not derive one", async () => {
    const { client } = fakeRpcClient({
      data: [{ id: DOG, name: "Bramble", breed: "Pug x Labrador", size: null, reported_size: "medium", human_id: HUMAN }],
      error: null,
    });

    const { dog } = await createForHuman(client, { humanId: HUMAN, name: "Bramble", breed: "Pug x Labrador", size: "medium" });

    expect(dog).toMatchObject({ size: null, reportedSize: "medium" });
  });
});

describe("requestSizeCheck", () => {
  it("asks the server for a size check on that dog and reports success", async () => {
    const { client, rpc } = fakeRpcClient({ data: true, error: null });

    await expect(requestSizeCheck(client as SupabaseClient<Database>, DOG)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("request_dog_size_check", { p_dog_id: DOG });
  });

  it("reports nothing recorded when the server raised no to-do (an archived dog)", async () => {
    const { client } = fakeRpcClient({ data: false, error: null });

    await expect(requestSizeCheck(client as SupabaseClient<Database>, DOG)).resolves.toBe(false);
  });

  it("reports failure so the wizard does not claim the team was asked", async () => {
    const { client } = fakeRpcClient({ data: null, error: { message: "That dog is not on your account" } });

    await expect(requestSizeCheck(client as SupabaseClient<Database>, DOG)).resolves.toBe(false);
  });
});
