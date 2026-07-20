import { useState } from "react";
import { PageHeaderSegmented } from "smarter-dog-ui";

export const Default = () => {
  const [value, setValue] = useState("week");
  return (
    <PageHeaderSegmented
      ariaLabel="View"
      value={value}
      onChange={setValue}
      options={[
        { value: "day", label: "Day" },
        { value: "week", label: "Week" },
        { value: "month", label: "Month" },
      ]}
    />
  );
};
