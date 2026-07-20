import { SafetyAlertChip } from "smarter-dog-ui";

export const SingleAlert = () => <SafetyAlertChip items={["Reactive to other dogs"]} />;

export const MultipleAlerts = () => (
  <SafetyAlertChip items={["Reactive to other dogs", "Muzzle required", "Nervous of men"]} />
);
