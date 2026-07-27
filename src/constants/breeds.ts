/**
 * Breed-to-size mapping for automatic size assignment.
 *
 * Size is determined by breed, not manually selected.
 * Staff can override for individual dogs that don't fit neatly.
 * Unknown breeds require staff approval before customers can book.
 *
 * Keys are lowercase for case-insensitive lookup.
 */

const SMALL_BREEDS = [
  "King Charles Cavalier",
  "Cavalier King Charles Spaniel",
  "Maltese",
  "Bichon Frise",
  "Shih Tzu",
  "Yorkshire Terrier",
  "Yorkie",
  "Pomeranian",
  "Chihuahua",
  "Mini Dachshund",
  "Miniature Dachshund",
  "Toy Poodle",
  "Lhasa Apso",
  "French Bulldog",
  "Frenchie",
  "Pug",
  "Boston Terrier",
  "Havanese",
  "Papillon",
  "Italian Greyhound",
  "Japanese Chin",
  "Brussels Griffon",
  "Affenpinscher",
  "Miniature Pinscher",
  "Min Pin",
  "Chinese Crested",
  "Pekingese",
  "Scottish Terrier",
  "Scottie",
  "West Highland Terrier",
  "West Highland White Terrier",
  "Westie",
  "Jack Russell",
  "Jack Russell Terrier",
  "Cairn Terrier",
  "Norfolk Terrier",
  "Norwich Terrier",
  "Toy Fox Terrier",
  "Silky Terrier",
  "Dandie Dinmont Terrier",
  "English Toy Terrier",
  "Löwchen",
  "Lowchen",
  "Bolognese",
];

const MEDIUM_BREEDS = [
  "Cockapoo",
  "Cavapoo",
  "Poodle (Miniature)",
  "Miniature Poodle",
  "Cocker Spaniel",
  "Springer Spaniel",
  "English Springer Spaniel",
  "Welsh Springer Spaniel",
  "Beagle",
  "Border Terrier",
  "Yorkipoo",
  "Staffordshire Bull Terrier",
  "Staffie",
  "Staffy",
  "Whippet",
  "Bedlington Terrier",
  "Kerry Blue Terrier",
  "Soft Coated Wheaten Terrier",
  "Australian Terrier",
  "Lakeland Terrier",
  "Welsh Terrier",
  "Tibetan Terrier",
  "Schnauzer (Miniature)",
  "Miniature Schnauzer",
  "Schnauzer (Standard)",
  "Standard Schnauzer",
  "Schnauzer",
  "Bulldog",
  "English Bulldog",
  "Keeshond",
  "Shiba Inu",
  "Basenji",
  "Basset Hound",
  "Portuguese Water Dog",
  "Spanish Water Dog",
  "Lagotto Romagnolo",
  "Australian Shepherd",
  "Aussie",
  "Border Collie",
  "Collie (Rough)",
  "Rough Collie",
  "Collie (Smooth)",
  "Smooth Collie",
  "Collie",
  "Shetland Sheepdog",
  "Sheltie",
  "Finnish Spitz",
  "Norwegian Elkhound",
  "Eurasier",
  "Bull Terrier",
  "Standard Dachshund",
  "Dachshund",
  "Field Spaniel",
  "Sussex Spaniel",
  "Sprocker",
  "Spoodle",
  "Maltipoo",
  "Cavachon",
  "Poochon",
  "Jackapoo",
  "Poodle",
];

const LARGE_BREEDS = [
  "Labrador",
  "Labrador Retriever",
  "Lab",
  "Poodle (Standard)",
  "Standard Poodle",
  "Golden Retriever",
  "German Shepherd",
  "GSD",
  "Husky",
  "Siberian Husky",
  "Bernese Mountain Dog",
  "Rottweiler",
  "Doberman",
  "Dobermann",
  "Labradoodle",
  "Goldendoodle",
  "Chow Chow",
  "Alaskan Malamute",
  "Akita",
  "Great Dane",
  "Saint Bernard",
  "St Bernard",
  "Newfoundland",
  "Newfie",
  "Mastiff",
  "English Mastiff",
  "Cane Corso",
  "Great Pyrenees",
  "Leonberger",
  "Irish Wolfhound",
  "Greyhound",
  "Afghan Hound",
  "Saluki",
  "Weimaraner",
  "Vizsla",
  "German Shorthaired Pointer",
  "German Wirehaired Pointer",
  "Rhodesian Ridgeback",
  "Belgian Malinois",
  "Belgian Shepherd (Tervuren)",
  "Belgian Shepherd (Groenendael)",
  "Belgian Shepherd",
  "Boxer",
  "Old English Sheepdog",
  "Briard",
  "Komondor",
  "Kuvasz",
  "Anatolian Shepherd",
  "Tibetan Mastiff",
  "Dogue de Bordeaux",
  "Black Russian Terrier",
  "Airedale Terrier",
  "Airedale",
  "Giant Schnauzer",
  "Flat-Coated Retriever",
  "Curly-Coated Retriever",
  "Chesapeake Bay Retriever",
  "English Setter",
  "Irish Setter",
  "Gordon Setter",
  "Bloodhound",
  "Borzoi",
  "Bernedoodle",
  "Sheepadoodle",
  "Irish Doodle",
];

// Build the lookup map: lowercase breed name → size
const BREED_SIZE_MAP: Record<string, string> = {};

for (const breed of SMALL_BREEDS) {
  BREED_SIZE_MAP[breed.toLowerCase()] = "small";
}
for (const breed of MEDIUM_BREEDS) {
  BREED_SIZE_MAP[breed.toLowerCase()] = "medium";
}
for (const breed of LARGE_BREEDS) {
  BREED_SIZE_MAP[breed.toLowerCase()] = "large";
}

export { BREED_SIZE_MAP };

/**
 * Look up the size for a breed. Returns "small", "medium", "large", or null
 * if the breed isn't recognised (needs staff approval).
 */
export function getSizeForBreed(breed: string | null | undefined): string | null {
  if (!breed || !breed.trim()) return null;
  const normalisedBreed = breed.trim().toLowerCase();
  const directSize = BREED_SIZE_MAP[normalisedBreed];
  if (directSize) return directSize;

  // A cross is authoritative only when the customer gives exactly two
  // independently recognised small/medium parents using "A x B" syntax.
  // Unknown parents, three-way crosses and any large parent stay unconfirmed.
  const parents = normalisedBreed.split(/\s+[x×]\s+/i);
  if (parents.length !== 2) return null;

  const parentSizes = parents.map((parent) => BREED_SIZE_MAP[parent.trim()]);
  if (parentSizes.some((size) => size !== "small" && size !== "medium")) {
    return null;
  }

  return parentSizes.includes("medium") ? "medium" : "small";
}

/**
 * Common mixed / cross breed autocomplete values. Only an exact two-parent
 * small/medium value is auto-sized; all other crosses still need staff review.
 */
const CROSS_BREEDS = [
  "Chorkie",
  "Corgi Cross",
  "Terrier X",
  "Yorkshire Terrier X Pomeranian",
];

/**
 * All known breed names grouped by size, for autocomplete or display.
 */
export const BREED_LIST = {
  small: SMALL_BREEDS,
  medium: MEDIUM_BREEDS,
  large: LARGE_BREEDS,
  cross: CROSS_BREEDS,
};

/**
 * Flat, sorted, de-duplicated list of all known breed names.
 * Use this as the option list for breed combobox/autocomplete UIs.
 * Extend by adding entries to SMALL_BREEDS, MEDIUM_BREEDS, LARGE_BREEDS,
 * or CROSS_BREEDS above.
 */
export const DOG_BREEDS: string[] = Array.from(
  new Set([...SMALL_BREEDS, ...MEDIUM_BREEDS, ...LARGE_BREEDS, ...CROSS_BREEDS]),
).sort((a, b) => a.localeCompare(b));
