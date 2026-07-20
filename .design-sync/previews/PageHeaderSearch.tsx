import { useState } from "react";
import { PageHeaderSearch } from "smarter-dog-ui";

export const Empty = () => <PageHeaderSearch value="" onChange={() => {}} placeholder="Search dogs…" />;

export const WithClear = () => {
  const [value, setValue] = useState("Bella");
  return (
    <PageHeaderSearch
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClear={() => setValue("")}
      placeholder="Search dogs…"
    />
  );
};
