export const BASE_TITLE = 'Smarter Dog Grooming Salon';

/** The homepage <title> already published in index.html. */
export const HOME_TITLE =
  'Smarter Dog Grooming Salon | Calm Dog Grooming in Ashton-under-Lyne';

/**
 * The homepage meta description already published in index.html.
 * The en dash matches the character in that file.
 */
export const HOME_DESCRIPTION =
  'Over 40 years of calm, careful dog grooming in Ashton-under-Lyne, Tameside, and Greater Manchester. No fuss, no rushing \u2013 just experienced groomers who treat your dog like their own. Nervous dogs welcome.';

export function formatDocumentTitle(title, absolute = false) {
  if (!title) return BASE_TITLE;
  return absolute ? title : `${title} | ${BASE_TITLE}`;
}
