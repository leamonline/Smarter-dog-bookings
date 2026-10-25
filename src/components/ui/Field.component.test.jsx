import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Field, Input, Textarea, Select } from "./index.js";

const cls = (el) => el.className.split(/\s+/);

describe("Field", () => {
  it("names the control with its label", () => {
    render(
      <Field label="Phone number">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Phone number")).toBeInstanceOf(HTMLInputElement);
  });

  it("works the same around a Textarea and a Select", () => {
    render(
      <>
        <Field label="Notes"><Textarea /></Field>
        <Field label="Service">
          <Select>
            <option>Full Groom</option>
            <option>Bath &amp; Brush</option>
          </Select>
        </Field>
      </>,
    );
    expect(screen.getByLabelText("Notes")).toBeInstanceOf(HTMLTextAreaElement);
    expect(screen.getByLabelText("Service")).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByRole("option", { name: "Bath & Brush" })).toBeInTheDocument();
  });

  it("gives every field its own id", () => {
    render(
      <>
        <Field label="First"><Input /></Field>
        <Field label="Second"><Input /></Field>
      </>,
    );
    expect(screen.getByLabelText("First").id).not.toBe(screen.getByLabelText("Second").id);
  });

  it("describes the control with its hint", () => {
    render(
      <Field label="Phone number" hint="We only text about appointments.">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Phone number")).toHaveAccessibleDescription(
      "We only text about appointments.",
    );
  });

  it("marks the control invalid and reads the error aloud", () => {
    render(
      <Field label="Phone number" error="That number looks too short.">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText("Phone number");
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription("That number looks too short.");
    expect(screen.getByRole("alert")).toHaveTextContent("That number looks too short.");
  });

  it("describes with both hint and error, hint first", () => {
    render(
      <Field label="Phone number" hint="Mobile only." error="Too short.">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Phone number")).toHaveAccessibleDescription("Mobile only. Too short.");
  });

  it("is valid and has no alert when there is no error", () => {
    render(
      <Field label="Phone number">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Phone number")).toBeValid();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("marks a required field to the browser and visually, without reading the star aloud", () => {
    render(
      <Field label="Dog's name" required>
        <Input />
      </Field>,
    );
    // Found by accessible name: the star is aria-hidden, so it is not part of it.
    expect(screen.getByRole("textbox", { name: "Dog's name" })).toBeRequired();
    expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps a description the caller passed and adds the field's own", () => {
    render(
      <>
        <p id="extra">Check the spelling.</p>
        <Field label="Name" hint="As on the vet record.">
          <Input aria-describedby="extra" />
        </Field>
      </>,
    );
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(
      "Check the spelling. As on the vet record.",
    );
  });

  it("keeps the label pointing at the control even if the caller passes an id", () => {
    render(
      <Field label="Name">
        <Input id="something-else" />
      </Field>,
    );
    expect(screen.getByLabelText("Name")).toBeInstanceOf(HTMLInputElement);
  });
});

describe("controls", () => {
  it("work on their own with an aria-label", () => {
    render(<Input aria-label="Search dogs" />);
    const input = screen.getByRole("textbox", { name: "Search dogs" });
    expect(input).toBeValid();
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("can be flagged invalid without a Field", () => {
    render(<Input aria-label="Price" invalid />);
    expect(screen.getByRole("textbox", { name: "Price" })).toBeInvalid();
  });

  it("pass type, value and change handlers straight through", async () => {
    const onChange = vi.fn();
    render(<Input aria-label="Email" type="email" defaultValue="a@b.co" onChange={onChange} />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveValue("a@b.co");
    await userEvent.type(input, "x");
    expect(onChange).toHaveBeenCalled();
  });

  it("forward refs to the native element", () => {
    const input = createRef();
    const area = createRef();
    const select = createRef();
    render(
      <>
        <Input aria-label="a" ref={input} />
        <Textarea aria-label="b" ref={area} />
        <Select aria-label="c" ref={select}><option>x</option></Select>
      </>,
    );
    expect(input.current).toBeInstanceOf(HTMLInputElement);
    expect(area.current).toBeInstanceOf(HTMLTextAreaElement);
    expect(select.current).toBeInstanceOf(HTMLSelectElement);
  });

  it("disable like a native control", () => {
    render(<Input aria-label="Locked" disabled />);
    expect(screen.getByLabelText("Locked")).toBeDisabled();
  });

  it("default a Textarea to three rows", () => {
    render(<Textarea aria-label="Notes" />);
    expect(screen.getByLabelText("Notes")).toHaveAttribute("rows", "3");
  });
});

describe("control styling", () => {
  it("uses a border that reaches 3:1 on white, not the old 1.2:1 slate-200", () => {
    render(<Input aria-label="Name" />);
    const classes = cls(screen.getByLabelText("Name"));
    expect(classes).toContain("border-ink-muted");
    expect(classes).not.toContain("border-slate-200");
  });

  it("never removes the focus outline", () => {
    render(<Input aria-label="Name" />);
    expect(cls(screen.getByLabelText("Name"))).not.toContain("outline-none");
  });

  it("is 16px on touch screens so iOS Safari does not zoom, 13px with a mouse", () => {
    render(<Input aria-label="Name" />);
    const classes = cls(screen.getByLabelText("Name"));
    expect(classes).toContain("text-base");
    expect(classes).toContain("pointer-fine:text-body");
  });

  it("is at least 44px tall on touch screens", () => {
    render(<Input aria-label="Name" />);
    expect(cls(screen.getByLabelText("Name"))).toContain("pointer-coarse:min-h-11");
  });

  it("turns the border coral when invalid, in the darker coral that reads against white", () => {
    render(<Input aria-label="Name" invalid />);
    const classes = cls(screen.getByLabelText("Name"));
    expect(classes).toContain("border-brand-coral-dark");
    expect(classes).not.toContain("border-ink-muted");
  });

  it("greys out like Button when disabled, rather than just fading", () => {
    render(<Input aria-label="Name" />);
    const classes = cls(screen.getByLabelText("Name"));
    expect(classes).toContain("disabled:bg-slate-100");
    expect(classes).toContain("disabled:text-slate-600");
  });

  it("rounds to 10px on the page and 12px on the portal's paper", () => {
    render(
      <>
        <Input aria-label="Staff" />
        <Input aria-label="Portal" surface="paper" />
      </>,
    );
    expect(cls(screen.getByLabelText("Staff"))).toContain("rounded-control");
    expect(cls(screen.getByLabelText("Portal"))).toContain("rounded-sd-input");
  });

  it("merges a caller's className instead of replacing the recipe", () => {
    render(<Input aria-label="Name" className="w-20 text-right" />);
    const classes = cls(screen.getByLabelText("Name"));
    expect(classes).toContain("w-20");
    expect(classes).toContain("text-right");
    expect(classes).toContain("border-ink-muted");
  });
});
