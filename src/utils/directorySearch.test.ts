import { describe, expect, it } from "vitest";
import { SAMPLE_DOGS, SAMPLE_HUMANS } from "../data/sample.js";
import {
  filterDogsForDirectory,
  filterHumansForDirectory,
} from "./directorySearch";

describe("directory search helpers", () => {
  it("finds a dog by name", () => {
    const results = filterDogsForDirectory(
      SAMPLE_DOGS as any,
      SAMPLE_HUMANS as any,
      "rex",
    );

    expect(results.map((dog) => dog.name)).toEqual(["Rex"]);
  });

  it("finds a dog by breed", () => {
    const results = filterDogsForDirectory(
      SAMPLE_DOGS as any,
      SAMPLE_HUMANS as any,
      "labrador",
    );

    expect(results.map((dog) => dog.name)).toEqual(["Rex"]);
  });

  it("finds a dog by owner name", () => {
    const results = filterDogsForDirectory(
      SAMPLE_DOGS as any,
      SAMPLE_HUMANS as any,
      "mark",
    );

    expect(results.map((dog) => dog.name)).toEqual(["Rex"]);
  });

  it("finds a human by name", () => {
    const results = filterHumansForDirectory(
      SAMPLE_HUMANS as any,
      SAMPLE_DOGS as any,
      {},
      "sarah",
    );

    expect(results.map((human) => human.name)).toEqual(["Sarah"]);
  });

  it("finds a human by phone fragment", () => {
    const results = filterHumansForDirectory(
      SAMPLE_HUMANS as any,
      SAMPLE_DOGS as any,
      {},
      "900111",
    );

    expect(results.map((human) => human.name)).toEqual(["Sarah"]);
  });

  it("finds a human by linked dog", () => {
    const results = filterHumansForDirectory(
      SAMPLE_HUMANS as any,
      SAMPLE_DOGS as any,
      {},
      "bella",
    );

    expect(results.map((human) => human.name)).toEqual(["Sarah"]);
  });
});
