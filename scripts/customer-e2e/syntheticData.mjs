// Every person, dog and number the customer journey tests use. All of it is
// invented. The phone numbers are from Ofcom's range reserved for drama
// (07700 900000 to 900999), which is never allocated to a real subscriber.
export const SYNTHETIC_PASSWORD = "Synthetic-Customer-1!";

export const SYNTHETIC_CUSTOMERS = [
  {
    key: "sam",
    authUserId: "e2e00000-0000-4000-8000-00000000a001",
    humanId: "e2e00000-0000-4000-8000-000000000001",
    name: "Sam",
    surname: "Synthetic",
    phoneE164: "+447700900101",
    phoneNational: "07700900101",
    phoneTyped: "7700 900101",
    otp: "123456",
    dogs: [
      { id: "e2e00000-0000-4000-8000-000000000101", name: "Biscuit", breed: "Poodle", size: "small" },
      { id: "e2e00000-0000-4000-8000-000000000102", name: "Crumpet", breed: "Poodle", size: "small" },
    ],
  },
  {
    key: "alex",
    authUserId: "e2e00000-0000-4000-8000-00000000a002",
    humanId: "e2e00000-0000-4000-8000-000000000002",
    name: "Alex",
    surname: "Synthetic",
    phoneE164: "+447700900102",
    phoneNational: "07700900102",
    phoneTyped: "7700 900102",
    otp: "123456",
    dogs: [
      { id: "e2e00000-0000-4000-8000-000000000201", name: "Pickle", breed: "Poodle", size: "small" },
    ],
  },
];

export function customer(key) {
  const found = SYNTHETIC_CUSTOMERS.find((entry) => entry.key === key);
  if (!found) throw new Error(`No synthetic customer called ${key}`);
  return found;
}
