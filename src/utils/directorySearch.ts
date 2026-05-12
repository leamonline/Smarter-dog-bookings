import type { Dog, Human } from "../types/index.js";

type DogsByHumanId = Record<string, Dog[]>;

function normalise(value: unknown): string {
  return String(value ?? "").toLowerCase().trim();
}

function includesQuery(value: unknown, query: string): boolean {
  return normalise(value).includes(query);
}

function humanFullName(human: Partial<Human> | null | undefined): string {
  if (!human) return "";
  return (
    human.fullName ||
    `${human.name || ""} ${human.surname || ""}`.trim()
  );
}

function findHumanForDog(
  humans: Record<string, Human>,
  dog: Partial<Dog>,
): Human | null {
  const ownerValue = dog._humanId || dog.humanId;
  if (!ownerValue) return null;

  if (humans[ownerValue]) return humans[ownerValue];

  return (
    Object.values(humans).find((human) => {
      const fullName = humanFullName(human);
      return (
        human.id === ownerValue ||
        fullName === ownerValue ||
        `${human.name || ""} ${human.surname || ""}`.trim() === ownerValue
      );
    }) || null
  );
}

function getDogsForHuman(
  human: Human,
  dogs: Record<string, Dog>,
  dogsByHumanId: DogsByHumanId = {},
): Dog[] {
  const fullName = humanFullName(human);
  return (
    dogsByHumanId[human.id] ||
    Object.values(dogs).filter(
      (dog) => dog._humanId === human.id || dog.humanId === fullName,
    )
  );
}

export function filterDogsForDirectory(
  dogs: Record<string, Dog>,
  humans: Record<string, Human>,
  query: string,
): Dog[] {
  const q = normalise(query);
  const values = Object.values(dogs);
  if (!q) return values;

  return values.filter((dog) => {
    const owner = findHumanForDog(humans, dog);
    return (
      includesQuery(dog.name, q) ||
      includesQuery(dog.breed, q) ||
      includesQuery(humanFullName(owner), q) ||
      includesQuery(owner?.phone, q)
    );
  });
}

export function filterHumansForDirectory(
  humans: Record<string, Human>,
  dogs: Record<string, Dog>,
  dogsByHumanId: DogsByHumanId = {},
  query: string,
): Human[] {
  const q = normalise(query);
  const values = Object.values(humans);
  if (!q) return values;

  return values.filter((human) => {
    const linkedDogs = getDogsForHuman(human, dogs, dogsByHumanId);
    return (
      includesQuery(humanFullName(human), q) ||
      includesQuery(human.phone, q) ||
      includesQuery(human.email, q) ||
      linkedDogs.some(
        (dog) => includesQuery(dog.name, q) || includesQuery(dog.breed, q),
      )
    );
  });
}
