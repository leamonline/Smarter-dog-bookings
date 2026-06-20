import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

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

const FAQ_SCHEMA = {
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
        text: 'We are open Monday, Tuesday, and Wednesday from 8:30am to 3:00pm.',
      },
    },
    {
      '@type': 'Question',
      name: 'Where is Smarter Dog Grooming Salon located?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'We are located at 183 Kings Road, Ashton-under-Lyne, OL6 8HD, Greater Manchester, UK.',
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

const LOCAL_BUSINESS_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': `${SITE_URL}/#organization`,
  name: 'Smarter Dog Grooming Salon',
  image: OG_IMAGE,
  url: SITE_URL,
  telephone: '+447873329440',
  priceRange: '££',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '183 Kings Road',
    addressLocality: 'Ashton-under-Lyne',
    addressRegion: 'Greater Manchester',
    postalCode: 'OL6 8HD',
    addressCountry: 'GB',
  },
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday'],
      opens: '08:30',
      closes: '15:00',
    },
  ],
};

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

    upsertJsonLd('smarterdog-localbusiness-schema', LOCAL_BUSINESS_SCHEMA);
    if (pathname === '/faq') {
      upsertJsonLd('smarterdog-faq-schema', FAQ_SCHEMA);
    } else {
      removeJsonLd('smarterdog-faq-schema');
    }

    return () => window.clearTimeout(titleSyncTimer);
  }, [pathname]);
};

export default useRouteSeo;
