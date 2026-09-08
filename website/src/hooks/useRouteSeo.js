import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSalonFacts } from './useSalonFacts';

const SITE_URL = 'https://smarterdog.co.uk';
const OG_IMAGE = `${SITE_URL}/assets/logo-text.png`;

const ROUTE_SEO = {
  '/': {
    canonical: '/',
    description: 'Dog grooming in Ashton-under-Lyne for over 40 years. Nervous dogs welcome. Trusted by owners in Dukinfield, Stalybridge, Hyde, Denton, and Mossley.',
    robots: 'index,follow',
  },
  '/services': {
    canonical: '/services',
    description: 'Explore full groom, maintenance groom, de-shedding, and puppy intro services at Smarter Dog Grooming Salon in Ashton-under-Lyne, Greater Manchester.',
    robots: 'index,follow',
  },
  '/approach': {
    canonical: '/approach',
    description: 'Our welfare-first approach: calm handling, no rushing, and tailored grooming for nervous, reactive, senior, and medical-needs dogs.',
    robots: 'index,follow',
  },
  '/faq': {
    canonical: '/faq',
    description: 'Answers to common questions about appointments, nervous dogs, pricing, and first visits at our Ashton-under-Lyne dog grooming salon.',
    robots: 'index,follow',
  },
  '/privacy': {
    canonical: '/privacy',
    description: 'Read the Smarter Dog Grooming Salon privacy policy, including data collection, retention, sharing, and your UK GDPR rights.',
    robots: 'index,follow',
  },
  '/terms': {
    canonical: '/terms',
    description: 'Review Smarter Dog Grooming Salon terms and conditions covering bookings, cancellations, safety, health, and payments.',
    robots: 'index,follow',
  },
  '/matted-coat-policy': {
    canonical: '/matted-coat-policy',
    description: 'Learn how we handle matted coats safely and comfortably, including welfare-first clipping decisions and aftercare expectations.',
    robots: 'index,follow',
  },
  '/community': {
    canonical: '/community',
    description: 'Local dog walks, pet shops, vets, and pet sitters near Ashton-under-Lyne. Trusted recommendations from Smarter Dog Grooming Salon in Tameside.',
    robots: 'index,follow',
  },
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

// Groups consecutive-in-config days that share the same open/close time into
// one OpeningHoursSpecification entry, matching schema.org's dayOfWeek array.
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

function splitAddress(address) {
  const parts = String(address || '').split(',').map((p) => p.trim()).filter(Boolean);
  return {
    streetAddress: parts[0] || '',
    addressLocality: parts[1] || '',
    postalCode: parts[2] || '',
  };
}

function buildFaqSchema(facts) {
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
        acceptedAnswer: {
          '@type': 'Answer',
          text: hoursSummarySentence(facts.businessHours),
        },
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

function buildLocalBusinessSchema(facts) {
  const { streetAddress, addressLocality, postalCode } = splitAddress(facts.businessAddress);
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${SITE_URL}/#organization`,
    name: facts.businessName,
    image: OG_IMAGE,
    url: SITE_URL,
    telephone: facts.businessPhone,
    priceRange: '££',
    address: {
      '@type': 'PostalAddress',
      streetAddress,
      addressLocality,
      addressRegion: 'Greater Manchester',
      postalCode,
      addressCountry: 'GB',
    },
    openingHoursSpecification: buildOpeningHoursSpecification(facts.businessHours),
  };
}

const upsertMetaByName = (name, content) => {
  let element = document.head.querySelector(`meta[name="${name}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('name', name);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
};

const upsertMetaByProperty = (property, content) => {
  let element = document.head.querySelector(`meta[property="${property}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('property', property);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
};

const upsertCanonical = (href) => {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
};

const upsertJsonLd = (id, data) => {
  let element = document.head.querySelector(`script#${id}[type="application/ld+json"]`);
  if (!element) {
    element = document.createElement('script');
    element.setAttribute('id', id);
    element.setAttribute('type', 'application/ld+json');
    document.head.appendChild(element);
  }
  element.textContent = JSON.stringify(data);
};

const removeJsonLd = (id) => {
  const element = document.head.querySelector(`script#${id}[type="application/ld+json"]`);
  element?.remove();
};

const toAbsoluteUrl = (path) => new URL(path, SITE_URL).toString();

export const useRouteSeo = () => {
  const { pathname } = useLocation();
  const facts = useSalonFacts();

  useEffect(() => {
    const routeSeo = ROUTE_SEO[pathname] || {
      canonical: pathname || '/',
      description: 'Smarter Dog Grooming Salon in Ashton-under-Lyne.',
      robots: 'noindex,nofollow',
    };

    const canonicalUrl = toAbsoluteUrl(routeSeo.canonical);

    upsertMetaByName('description', routeSeo.description);
    upsertMetaByName('robots', routeSeo.robots);
    upsertMetaByProperty('og:type', 'website');
    upsertMetaByProperty('og:url', canonicalUrl);
    upsertMetaByProperty('og:description', routeSeo.description);
    upsertMetaByProperty('og:image', OG_IMAGE);
    upsertMetaByProperty('twitter:card', 'summary_large_image');
    upsertMetaByProperty('twitter:url', canonicalUrl);
    upsertMetaByProperty('twitter:description', routeSeo.description);
    upsertMetaByProperty('twitter:image', OG_IMAGE);
    upsertCanonical(canonicalUrl);

    const titleSyncTimer = window.setTimeout(() => {
      const currentTitle = document.title || 'Smarter Dog Grooming Salon';
      upsertMetaByName('title', currentTitle);
      upsertMetaByProperty('og:title', currentTitle);
      upsertMetaByProperty('twitter:title', currentTitle);
    }, 0);

    upsertJsonLd('smarterdog-localbusiness-schema', buildLocalBusinessSchema(facts));
    if (pathname === '/faq') {
      upsertJsonLd('smarterdog-faq-schema', buildFaqSchema(facts));
    } else {
      removeJsonLd('smarterdog-faq-schema');
    }

    return () => window.clearTimeout(titleSyncTimer);
  }, [pathname, facts]);
};

export default useRouteSeo;
