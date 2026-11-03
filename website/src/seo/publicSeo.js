import { NEED_PAGES } from '../content/needPages';
import { SALON_FACTS_FALLBACK } from '../constants/salonFacts';
import { HOME_DESCRIPTION, HOME_TITLE, formatDocumentTitle } from './documentTitle';

export const SITE_URL = 'https://smarterdog.co.uk';
export const OG_IMAGE = `${SITE_URL}/assets/logo-text.png`;

/**
 * LocalBusiness block approved 3 Nov 2026. It is stamped into the built HTML
 * and the client hook writes this same object into the same script id, so
 * hydration does not add a second copy and does not swap in a thinner one.
 * Bank-holiday exceptions are left out; the pages say those in prose.
 */
export const LOCAL_BUSINESS_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': `${SITE_URL}/#organization`,
  name: 'Smarter Dog Grooming Salon',
  description:
    'Calm, careful dog grooming in Ashton-under-Lyne, Tameside, since 1982. Nervous, elderly and reactive dogs welcome.',
  url: `${SITE_URL}/`,
  logo: OG_IMAGE,
  image: OG_IMAGE,
  foundingDate: '1982',
  email: 'bookings@smarterdog.co.uk',
  telephone: '+44 7873 329440',
  priceRange: '££',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '183 Kings Road',
    addressLocality: 'Ashton-under-Lyne',
    addressRegion: 'Greater Manchester',
    postalCode: 'OL6 8HD',
    addressCountry: 'GB',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+44 7873 329440',
    contactType: 'Bookings by WhatsApp message only (there is no phone line)',
    email: 'bookings@smarterdog.co.uk',
    availableLanguage: 'en-GB',
  },
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday'],
      opens: '08:30',
      closes: '15:00',
    },
  ],
  areaServed: [
    'Ashton-under-Lyne',
    'Denton',
    'Stalybridge',
    'Dukinfield',
    'Droylsden',
    'Mossley',
    'Audenshaw',
    'Hyde',
    'Tameside',
    'Greater Manchester',
  ],
  sameAs: [
    'https://facebook.com/smarterdog',
    'https://instagram.com/smarterdog',
    'https://tiktok.com/@smarterdog',
  ],
  makesOffer: [
    {
      '@type': 'Offer',
      name: 'Full Groom',
      description:
        'Double bath and blow dry, full body styling, hygiene clip, paw pad trim, nail trim and ear cleaning.',
      priceSpecification: { '@type': 'PriceSpecification', minPrice: 42, priceCurrency: 'GBP' },
    },
    {
      '@type': 'Offer',
      name: 'Bath & Brush',
      priceSpecification: { '@type': 'PriceSpecification', minPrice: 38, priceCurrency: 'GBP' },
    },
    {
      '@type': 'Offer',
      name: 'Bath & De-shed',
      description: 'For double coats and heavy shedders.',
      priceSpecification: { '@type': 'PriceSpecification', minPrice: 38, priceCurrency: 'GBP' },
    },
    {
      '@type': 'Offer',
      name: 'Puppy Groom',
      description: 'Gentle first experience for puppies under 6 months.',
      price: 38,
      priceCurrency: 'GBP',
    },
    { '@type': 'Offer', name: 'Walk-in nail clipping', price: 10, priceCurrency: 'GBP' },
    { '@type': 'Offer', name: 'Walk-in ear cleaning', price: 10, priceCurrency: 'GBP' },
    { '@type': 'Offer', name: 'Walk-in anal gland expression', price: 10, priceCurrency: 'GBP' },
  ],
};

export const LOCAL_BUSINESS_SCRIPT_ID = 'smarterdog-localbusiness-schema';
export const FAQ_SCRIPT_ID = 'smarterdog-faq-schema';

const STATIC_ROUTES = {
  '/': {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    canonical: '/',
    robots: 'index,follow',
  },
  '/services': {
    title: formatDocumentTitle('Services'),
    description:
      'Explore our Full Groom, Bath & Brush, Bath & De-shed and Puppy Groom services at Smarter Dog Grooming Salon in Ashton-under-Lyne, Greater Manchester.',
    canonical: '/services',
    robots: 'index,follow',
  },
  '/approach': {
    title: formatDocumentTitle('Our Approach'),
    description:
      'Our welfare-first approach: calm handling, no rushing, and tailored grooming for nervous, reactive, senior, and medical-needs dogs.',
    canonical: '/approach',
    robots: 'index,follow',
  },
  '/faq': {
    title: formatDocumentTitle('FAQ'),
    description:
      'Answers to common questions about appointments, nervous dogs, pricing, and first visits at our Ashton-under-Lyne dog grooming salon.',
    canonical: '/faq',
    robots: 'index,follow',
  },
  '/privacy': {
    title: formatDocumentTitle('Privacy Policy'),
    description:
      'Read the Smarter Dog Grooming Salon privacy policy, including data collection, retention, sharing, and your UK GDPR rights.',
    canonical: '/privacy',
    robots: 'index,follow',
  },
  '/terms': {
    title: formatDocumentTitle('Terms & Conditions'),
    description:
      'Review Smarter Dog Grooming Salon terms and conditions covering bookings, cancellations, safety, health, and payments.',
    canonical: '/terms',
    robots: 'index,follow',
  },
  '/matted-coat-policy': {
    title: formatDocumentTitle('Matted Coat Policy'),
    description:
      'Learn how we handle matted coats safely and comfortably, including welfare-first clipping decisions and aftercare expectations.',
    canonical: '/matted-coat-policy',
    robots: 'index,follow',
  },
  '/community': {
    title: formatDocumentTitle('Community'),
    description:
      'Local dog walks, pet shops, vets, and pet sitters near Ashton-under-Lyne. Trusted recommendations from Smarter Dog Grooming Salon in Tameside.',
    canonical: '/community',
    robots: 'index,follow',
  },
  '/houndsly': {
    title: formatDocumentTitle('Houndsly'),
    description:
      "Houndsly is Smarter Dog's own natural, vegan, cruelty-free shampoo, handmade in small batches for sensitive skin.",
    canonical: '/houndsly',
    robots: 'index,follow',
  },
};

export const ROUTE_SEO = { ...STATIC_ROUTES };

for (const page of NEED_PAGES) {
  ROUTE_SEO[page.path] = {
    title: page.title,
    description: page.description,
    canonical: page.path,
    robots: 'index,follow',
  };
}

/**
 * Paths written to real HTML at build time.
 * /book is a marketing route that only exists when this site is served on its
 * own. In production Vercel rewrites /book to the booking app, and a static
 * book/index.html would win over that rewrite, so it is not prerendered.
 */
export const PRERENDER_PATHS = Object.keys(ROUTE_SEO);

export const NOT_FOUND_RENDER_PATH = '/no-such-page-for-prerender';

export const NOT_FOUND_SEO = {
  title: formatDocumentTitle('Page Not Found'),
  description: 'That page has wandered off. Smarter Dog Grooming Salon in Ashton-under-Lyne.',
  canonical: null,
  robots: 'noindex,nofollow',
};

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function formatTime12h(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const period = h < 12 ? 'am' : 'pm';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m || 0).padStart(2, '0')}${period}`;
}

function joinDaysProse(days) {
  if (days.length === 0) return '';
  if (days.length === 1) return days[0];
  if (days.length === 2) return `${days[0]} and ${days[1]}`;
  return `${days.slice(0, -1).join(', ')}, and ${days[days.length - 1]}`;
}

function buildOpeningHoursSpecification(businessHours) {
  const groups = new Map();
  for (const day of DAY_ORDER) {
    const h = businessHours?.[day];
    if (!h || h.closed || !h.open || !h.close) continue;
    const key = `${h.open}|${h.close}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(day);
  }
  return Array.from(groups.entries()).map(([key, days]) => {
    const [opens, closes] = key.split('|');
    return { '@type': 'OpeningHoursSpecification', dayOfWeek: days, opens, closes };
  });
}

function hoursSummarySentence(businessHours) {
  const groups = buildOpeningHoursSpecification(businessHours);
  if (groups.length === 0) return 'Please contact us for our current opening hours.';
  return groups
    .map((g) => `We are open ${joinDaysProse(g.dayOfWeek)} from ${formatTime12h(g.opens)} to ${formatTime12h(g.closes)}.`)
    .join(' ');
}

function buildFaqPageSchema(facts) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'My dog is nervous or reactive - can you still groom them?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: "Absolutely. We've worked with anxious, reactive, and fearful dogs for over 40 years. We take our time, read their body language, and never force anything.",
        },
      },
      {
        '@type': 'Question',
        name: 'What are your opening hours?',
        acceptedAnswer: { '@type': 'Answer', text: hoursSummarySentence(facts.businessHours) },
      },
      {
        '@type': 'Question',
        name: 'Where is Smarter Dog Grooming Salon located?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `We are located at ${facts.businessAddress}, Greater Manchester, UK.`,
        },
      },
      {
        '@type': 'Question',
        name: 'How do I book an appointment?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'You can request an appointment through our website or message us on WhatsApp, and we respond as quickly as possible during opening hours.',
        },
      },
    ],
  };
}

function faqPageFromQuestions(questions) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map((question) => ({
      '@type': 'Question',
      name: question.name,
      acceptedAnswer: { '@type': 'Answer', text: question.text },
    })),
  };
}

/** `/services/` and `/services` are the same page. The canonical form has no trailing slash. */
export function canonicalPath(pathname) {
  if (!pathname) return '/';
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

export function faqSchemaFor(pathname, facts = SALON_FACTS_FALLBACK) {
  const path = canonicalPath(pathname);
  if (path === '/faq') return buildFaqPageSchema(facts);
  const page = NEED_PAGES.find((candidate) => candidate.path === path);
  if (!page) return null;
  return faqPageFromQuestions(page.faqs);
}

export function routeSeoFor(pathname) {
  const path = canonicalPath(pathname);
  return ROUTE_SEO[path] || {
    title: NOT_FOUND_SEO.title,
    canonical: path || '/',
    description: 'Smarter Dog Grooming Salon in Ashton-under-Lyne.',
    robots: 'noindex,nofollow',
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function replaceMeta(html, attr, key, content) {
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
  const re = new RegExp(`<meta\\s+${attr}="${key}"[^>]*>`, 'i');
  if (re.test(html)) return html.replace(re, tag);
  return html.replace('</head>', `  ${tag}\n</head>`);
}

function jsonLdScript(id, data) {
  const json = JSON.stringify(data, null, 2).replaceAll('<', '\\u003c');
  return `<script type="application/ld+json" id="${id}">\n${json}\n</script>`;
}

/**
 * Puts this route's title, description, canonical and JSON-LD into a built
 * index.html shell, and drops the rendered page into #root.
 * The hero preload belongs to the homepage only.
 */
export function stampHtml(template, { path, body, seo, faq }) {
  let html = template;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(seo.title)}</title>`);
  html = replaceMeta(html, 'name', 'title', seo.title);
  html = replaceMeta(html, 'name', 'description', seo.description);
  html = replaceMeta(html, 'name', 'robots', seo.robots);
  html = replaceMeta(html, 'property', 'og:title', seo.title);
  html = replaceMeta(html, 'property', 'og:description', seo.description);
  html = replaceMeta(html, 'property', 'og:url', seo.canonical ? new URL(seo.canonical, SITE_URL).toString() : `${SITE_URL}/`);
  html = replaceMeta(html, 'property', 'twitter:title', seo.title);
  html = replaceMeta(html, 'property', 'twitter:description', seo.description);
  html = replaceMeta(html, 'property', 'twitter:url', seo.canonical ? new URL(seo.canonical, SITE_URL).toString() : `${SITE_URL}/`);

  const canonicalHref = seo.canonical ? new URL(seo.canonical, SITE_URL).toString() : '';
  if (canonicalHref) {
    html = html.replace(
      /<link rel="canonical" href="[^"]*"\s*\/?>/,
      `<link rel="canonical" href="${canonicalHref}" />`,
    );
  } else {
    html = html.replace(/\s*<link rel="canonical" href="[^"]*"\s*\/?>/, '');
  }

  if (path !== '/') {
    html = html.replace(/\s*<link rel="preload" as="image" href="\/assets\/client-dog-1-640\.avif"[\s\S]*?>/, '');
  }

  html = html.replace(/\s*<!-- Route-specific JSON-LD is injected by the SPA SEO hook -->/, '');
  html = html.replace(new RegExp(`\\s*<script type="application/ld\\+json" id="${LOCAL_BUSINESS_SCRIPT_ID}">[\\s\\S]*?</script>`), '');
  html = html.replace(new RegExp(`\\s*<script type="application/ld\\+json" id="${FAQ_SCRIPT_ID}">[\\s\\S]*?</script>`), '');

  const scripts = [
    jsonLdScript(LOCAL_BUSINESS_SCRIPT_ID, LOCAL_BUSINESS_SCHEMA),
    faq ? jsonLdScript(FAQ_SCRIPT_ID, faq) : '',
  ].filter(Boolean).join('\n');
  html = html.replace('</head>', `  ${scripts}\n</head>`);

  const root = '<div id="root"></div>';
  if (!html.includes(root)) {
    throw new Error('prerender template is missing <div id="root"></div>');
  }
  html = html.replace(root, `<div id="root">${body}</div>`);
  return html;
}
