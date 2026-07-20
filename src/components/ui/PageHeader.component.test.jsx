import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import {
  PageHeader,
  PageHeaderAction,
  PageHeaderSearch,
} from "./PageHeader.jsx";

describe("PageHeader", () => {
  it("keeps the page heading accessible without repeating it visually", () => {
    render(
      <PageHeader
        title="Dogs"
        subtitle={<span>124 active dogs</span>}
        meta={<span>Directory</span>}
        actions={<button type="button">Import</button>}
      />,
    );

    const header = screen.getByRole("banner");
    const heading = screen.getByRole("heading", { level: 1, name: "Dogs" });

    expect(header).toContainElement(heading);
    expect(heading).toHaveClass("sr-only");
    expect(screen.getByText("124 active dogs")).toBeVisible();
    expect(screen.getByText("Directory")).toBeVisible();
    expect(screen.getByRole("button", { name: "Import" })).toBeVisible();
    expect(header).toHaveClass("min-h-[76px]", "border-b", "bg-white/90");
  });

  it("renders task controls supplied as children", () => {
    render(
      <PageHeader title="Reports">
        <button type="button">Cash-up</button>
        <button type="button">Insights</button>
      </PageHeader>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Reports" })).toHaveClass("sr-only");
    expect(screen.getByRole("button", { name: "Cash-up" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Insights" })).toBeVisible();
  });
});

describe("PageHeaderSearch", () => {
  it("provides an accessible search field and clears its current value", async () => {
    const onClear = vi.fn();

    function SearchHarness() {
      const [value, setValue] = useState("Alfie");

      return (
        <PageHeaderSearch
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search dogs"
          ariaLabel="Search the dog directory"
          onClear={() => {
            setValue("");
            onClear();
          }}
          name="dog-search"
        />
      );
    }

    const user = userEvent.setup();
    render(<SearchHarness />);

    const input = screen.getByRole("searchbox", {
      name: "Search the dog directory",
    });
    expect(input).toHaveValue("Alfie");
    expect(input).toHaveAttribute("name", "dog-search");
    expect(input).toHaveClass("h-11", "w-full");

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(onClear).toHaveBeenCalledOnce();
    expect(input).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: "Clear search" }),
    ).not.toBeInTheDocument();
  });
});

describe("PageHeaderAction", () => {
  it("renders a 44px purple action with its icon and forwards button props", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(
      <PageHeaderAction icon={Plus} onClick={onClick} data-testid="page-action">
        Add dog
      </PageHeaderAction>,
    );

    const action = screen.getByRole("button", { name: "Add dog" });
    expect(action).toHaveAttribute("type", "button");
    expect(action).toHaveClass("h-11", "rounded-control", "bg-brand-purple");
    expect(action.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    await user.click(action);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
