import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSalonFacts } from './useSalonFacts';
import {
  FAQ_SCRIPT_ID,
  LOCAL_BUSINESS_SCHEMA,
  LOCAL_BUSINESS_SCRIPT_ID,
  OG_IMAGE,
  SITE_URL,
  faqSchemaFor,
  routeSeoFor,
} from '../seo/publicSeo';

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
    const routeSeo = routeSeoFor(pathname);
    const canonicalUrl = toAbsoluteUrl(routeSeo.canonical || '/');

    if (routeSeo.title) document.title = routeSeo.title;
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
    if (routeSeo.canonical) upsertCanonical(canonicalUrl);

    const titleSyncTimer = window.setTimeout(() => {
      const currentTitle = document.title || 'Smarter Dog Grooming Salon';
      upsertMetaByName('title', currentTitle);
      upsertMetaByProperty('og:title', currentTitle);
      upsertMetaByProperty('twitter:title', currentTitle);
    }, 0);

    // Same id the build stamps into the HTML, so this updates one script
    // instead of appending a second LocalBusiness block.
    upsertJsonLd(LOCAL_BUSINESS_SCRIPT_ID, LOCAL_BUSINESS_SCHEMA);
    const faq = faqSchemaFor(pathname, facts);
    if (faq) upsertJsonLd(FAQ_SCRIPT_ID, faq);
    else removeJsonLd(FAQ_SCRIPT_ID);

    return () => window.clearTimeout(titleSyncTimer);
  }, [pathname, facts]);
};

export default useRouteSeo;
