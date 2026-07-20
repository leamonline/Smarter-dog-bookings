import { Plus } from "lucide-react";
import { PageHeaderAction } from "smarter-dog-ui";

export const Default = () => <PageHeaderAction>Add booking</PageHeaderAction>;

export const WithIcon = () => (
  <PageHeaderAction icon={Plus}>New booking</PageHeaderAction>
);

export const Disabled = () => (
  <PageHeaderAction disabled>Add booking</PageHeaderAction>
);
