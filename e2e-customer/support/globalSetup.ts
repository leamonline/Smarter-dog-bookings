import { readLocalStack } from "../../scripts/customer-e2e/localStack.mjs";
import { seed } from "../../scripts/customer-e2e/seed.mjs";

// Fails before any browser opens if the stack is not local or not running.
export default async function globalSetup() {
  await seed(readLocalStack());
}
