// Humans repository for the customer surface.
//
// At the moment all customer-side reads/writes for humans go through
// the typed RPC wrappers in supabase/rpc.ts:
//   • linkCustomerToHuman      — first-login auth.uid() ↔ human binding
//   • addCustomerTrustedHuman  — append a trusted pickup contact
//
// This file exists to keep the layout consistent with bookingsRepo /
// dogsRepo and to make future query-based reads (e.g. "my profile")
// have an obvious home. Don't add an empty re-export just for the
// sake of it — the next thing that needs direct table access lands
// here.
export {};
