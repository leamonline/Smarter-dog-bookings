import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NEED_PAGES } from '../content/needPages';
import {
  LOCAL_BUSINESS_SCHEMA,
  LOCAL_BUSINESS_SCRIPT_ID,
  PRERENDER_PATHS,
  faqSchemaFor,
  routeSeoFor,
  stampHtml,
} from './publicSeo';

const template = readFileSync('index.html', 'utf8');
const appSource = readFileSync('src/App.jsx', 'utf8');

describe('public route SEO', () => {
  it('prerenders every public route except the booking redirect', () => {
    expect(PRERENDER_PATHS).not.toContain('/book');
    expect(PRERENDER_PATHS).toContain('/');
    expect(PRERENDER_PATHS).toContain('/services');
    expect(PRERENDER_PATHS).toContain('/community');
    expect(PRERENDER_PATHS).toContain('/houndsly');
    for (const page of NEED_PAGES) {
      expect(PRERENDER_PATHS).toContain(page.path);
    }
    expect(appSource).toContain('NEED_PAGES.map');
    expect(appSource).toContain('path="/book"');
    for (const path of PRERENDER_PATHS) {
      if (NEED_PAGES.some((page) => page.path === path)) continue;
      expect(appSource).toContain(`path="${path}"`);
    }
  });

  it('uses the approved LocalBusiness block and not the old phone number', () => {
    expect(LOCAL_BUSINESS_SCHEMA.telephone).toBe('+44 7873 329440');
    expect(LOCAL_BUSINESS_SCHEMA['@type']).toBe('LocalBusiness');
    expect(LOCAL_BUSINESS_SCHEMA.openingHoursSpecification[0].dayOfWeek).toEqual([
      'Monday', 'Tuesday', 'Wednesday',
    ]);
    expect(JSON.stringify(LOCAL_BUSINESS_SCHEMA)).not.toContain('07507');
    expect(JSON.stringify(LOCAL_BUSINESS_SCHEMA)).not.toContain('PetGroomer');
  });

  it('stamps one LocalBusiness script, the route head, and the page body', () => {
    const seo = routeSeoFor('/services');
    const html = stampHtml(template, {
      path: '/services',
      body: '<main>Bath &amp; De-shed</main>',
      seo,
      faq: null,
    });

    expect(html.match(new RegExp(LOCAL_BUSINESS_SCRIPT_ID, 'g'))).toHaveLength(1);
    expect(html).toContain('<title>Services | Smarter Dog Grooming Salon</title>');
    expect(html).toContain('Bath &amp; Brush');
    expect(html).toContain('rel="canonical" href="https://smarterdog.co.uk/services"');
    expect(html).toContain('<main>Bath &amp; De-shed</main>');
    expect(html).not.toContain('client-dog-1-640.avif');
    expect(html).not.toContain(LOCAL_BUSINESS_SCRIPT_ID + '"></script><script');
  });

  it('gives each new page a FAQPage block and keeps the salon FAQ', () => {
    for (const page of NEED_PAGES) {
      const faq = faqSchemaFor(page.path);
      expect(faq['@type']).toBe('FAQPage');
      expect(faq.mainEntity.length).toBe(page.faqs.length);
      expect(faq.mainEntity[0].name).toBe(page.faqs[0].name);
      const html = stampHtml(template, {
        path: page.path,
        body: '<p>page</p>',
        seo: routeSeoFor(page.path),
        faq,
      });
      expect(html).toContain(page.title.replaceAll('&', '&amp;'));
      expect(html).toContain('"@type": "FAQPage"');
      expect(html.match(/smarterdog-localbusiness-schema/g)).toHaveLength(1);
      expect(html.match(/smarterdog-faq-schema/g)).toHaveLength(1);
    }
    expect(faqSchemaFor('/faq').mainEntity.length).toBeGreaterThan(0);
    expect(faqSchemaFor('/services')).toBeNull();
  });
});
