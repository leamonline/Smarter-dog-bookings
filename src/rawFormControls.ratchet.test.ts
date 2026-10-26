/**
 * Raw form-control ratchet.
 *
 * Text fields, text areas and dropdowns should be `Input`, `Textarea` and
 * `Select` from src/components/ui (wrapped in `Field` for a label, hint and
 * error). Until they existed, every form carried its own class string, so
 * radius, border, focus and text size drifted, and a control's contrast and
 * iOS focus-zoom behaviour depended on which form it happened to be in.
 *
 * This counts the raw elements still left. Ceilings are the counts when the
 * ratchet was added. Lower a ceiling when you migrate a form; never raise one
 * to fit a feature, use the shared control instead.
 *
 * Not counted: the shared controls themselves (src/components/ui), test files,
 * and inputs that are not text-like (checkbox, radio, hidden, file, range,
 * colour, and button types), which have no shared control yet.
 */
import { describe, expect, it } from "vitest";
import { CEILINGS, countRawFormControls as countInSource, measureRawFormControls, topFiles } from "./designSystemHealth/ratchets";

const ceilings = CEILINGS.rawFormControls;
type Kind = keyof typeof ceilings;

describe("raw form controls ratchet", () => {
  const { totals, perFile } = measureRawFormControls();

  for (const kind of Object.keys(ceilings) as Kind[]) {
    it(`raw <${kind}> stays at or below ${ceilings[kind]}`, () => {
      expect(
        totals[kind],
        `${totals[kind]} raw <${kind}> found (ceiling ${ceilings[kind]}). Use the shared ` +
          `Input, Textarea or Select from components/ui, inside a Field. Most: ${topFiles(perFile[kind]!)}`,
      ).toBeLessThanOrEqual(ceilings[kind]!);
    });
  }
});

// A ratchet that miscounts is worse than none, so check the scanner itself.
describe("raw form controls scanner", () => {
  it("counts text inputs, textareas and selects", () => {
    expect(countInSource('<input type="text" /><textarea rows={3} /><select><option /></select>')).toEqual({
      input: 1,
      textarea: 1,
      select: 1,
    });
  });

  it("does not count the shared controls (capitalised) or non-text inputs", () => {
    const source =
      '<Input /><Select /><Textarea /><input type="checkbox" /><input type="radio" /><input type="hidden" /><input type="file" />';
    expect(countInSource(source)).toEqual({ input: 0, textarea: 0, select: 0 });
  });

  it("reads past an arrow function inside the tag to find a later type", () => {
    expect(countInSource('<input onChange={(e) => set(e.target.value)} type="checkbox" />').input).toBe(0);
    expect(countInSource('<input onChange={(e) => set(e.target.value)} type="text" />').input).toBe(1);
  });

  it("is not fooled by > inside a string", () => {
    expect(countInSource('<input value="a>b" type="checkbox" />').input).toBe(0);
  });

  it("counts an input whose type is dynamic", () => {
    expect(countInSource("<input type={kind} />").input).toBe(1);
  });

  it("counts every element, not every line", () => {
    expect(countInSource('<input type="text" /><input type="email" />\n<input />').input).toBe(3);
  });
});
