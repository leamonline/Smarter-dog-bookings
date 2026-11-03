import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { colors } from '../../constants/colors';
import { SALON_FACTS_NOTE } from '../../content/needPages';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import Navigation from '../sections/Navigation';
import FooterSection from '../sections/FooterSection';
import { whatsAppUrl } from '../../constants/salonFacts';
import { BOOKING_URL } from '../../constants/links';
import { goToBooking } from '../../utils/booking';

const linkStyle = { color: colors.cyanText };

function TextLink({ href, children, external = false }) {
  const className = 'font-semibold underline hover:opacity-80';
  if (external || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('https://wa.me')) {
    return (
      <a href={href} className={className} style={linkStyle} {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href} className={className} style={linkStyle}>
      {children}
    </Link>
  );
}

function Parts({ parts }) {
  return parts.map((part, index) => {
    if (typeof part === 'string') return <span key={index}>{part}</span>;
    if (part.strong) return <strong key={index}>{part.strong}</strong>;
    if (part.em) return <em key={index}>{part.em}</em>;
    if (part.link) return <TextLink key={index} href={part.link}>{part.text}</TextLink>;
    if (part.href) return <TextLink key={index} href={part.href}>{part.text}</TextLink>;
    if (part.wa) return <TextLink key={index} href={whatsAppUrl(part.wa)}>{part.text}</TextLink>;
    if (part.book) return <TextLink key={index} href={BOOKING_URL}>{part.text}</TextLink>;
    return null;
  });
}

function Item({ item }) {
  if (typeof item === 'string') return item;
  if (item.parts) return <Parts parts={item.parts} />;
  if (item.text && item.note) {
    return (
      <>
        {item.text} <em>{item.note}</em>
      </>
    );
  }
  if (item.strong) {
    return (
      <>
        <strong>{item.strong}</strong>
        {item.rest || ''}
      </>
    );
  }
  return item.text || null;
}

function Block({ block }) {
  if (block.type === 'p') {
    return (
      <p className="body-font text-lg leading-relaxed" style={{ color: colors.teal }}>
        {block.text}
      </p>
    );
  }
  if (block.type === 'lead') {
    return (
      <p className="body-font text-lg leading-relaxed" style={{ color: colors.teal }}>
        <strong>{block.strong}</strong> {block.rest}
      </p>
    );
  }
  if (block.type === 'rich') {
    return (
      <p className="body-font text-lg leading-relaxed" style={{ color: colors.teal }}>
        <Parts parts={block.parts} />
      </p>
    );
  }
  if (block.type === 'ul' || block.type === 'ol') {
    const Tag = block.type === 'ol' ? 'ol' : 'ul';
    const marker = block.type === 'ol' ? 'list-decimal' : 'list-disc';
    return (
      <Tag className={`${marker} pl-6 space-y-3 body-font text-lg leading-relaxed`} style={{ color: colors.teal }}>
        {block.items.map((item, index) => (
          <li key={index}>
            <Item item={item} />
          </li>
        ))}
      </Tag>
    );
  }
  if (block.type === 'quote') {
    return (
      <blockquote
        className="bg-white rounded-2xl p-6 shadow-sm border-l-4"
        style={{ borderLeftColor: colors.cyan }}
      >
        <p className="body-font text-lg leading-relaxed italic" style={{ color: colors.teal }}>
          &quot;{block.text}&quot; ({block.cite})
        </p>
      </blockquote>
    );
  }
  return null;
}

function groupSections(blocks) {
  const intro = [];
  const sections = [];
  let current = null;
  for (const block of blocks) {
    if (block.type === 'h2') {
      current = { heading: block.text, blocks: [] };
      sections.push(current);
    } else if (current) {
      current.blocks.push(block);
    } else if (block.type !== 'h1') {
      intro.push(block);
    }
  }
  const h1 = blocks.find((block) => block.type === 'h1');
  return { h1: h1 ? h1.text : '', intro, sections };
}

export function SalonFactsNote() {
  const phoneAt = SALON_FACTS_NOTE.indexOf('07873 329440');
  const emailAt = SALON_FACTS_NOTE.indexOf('bookings@smarterdog.co.uk');
  const bookAt = SALON_FACTS_NOTE.lastIndexOf('book online');
  const beforePhone = SALON_FACTS_NOTE.slice(0, phoneAt);
  const betweenPhoneAndEmail = SALON_FACTS_NOTE.slice(phoneAt + '07873 329440'.length, emailAt);
  const betweenEmailAndBook = SALON_FACTS_NOTE.slice(emailAt + 'bookings@smarterdog.co.uk'.length, bookAt);
  const afterBook = SALON_FACTS_NOTE.slice(bookAt + 'book online'.length);

  return (
    <aside className="mt-12 bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
      <p className="body-font text-lg leading-relaxed" style={{ color: colors.teal }}>
        <strong style={{ color: colors.plum }}>Smarter Dog Grooming Salon</strong>
        {beforePhone.slice('Smarter Dog Grooming Salon'.length)}
        <TextLink href={whatsAppUrl('07873 329440')}>07873 329440</TextLink>
        {betweenPhoneAndEmail}
        <TextLink href="mailto:bookings@smarterdog.co.uk">bookings@smarterdog.co.uk</TextLink>
        {betweenEmailAndBook}
        <TextLink href={BOOKING_URL}>book online</TextLink>
        {afterBook}
      </p>
    </aside>
  );
}

const NeedGuide = ({ page }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const { h1, intro, sections } = groupSections(page.blocks);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useDocumentTitle(page.title, true);

  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.offWhite }}>
      <Navigation isLoaded={isLoaded} onBookClick={() => goToBooking(page.linkLabel)} />

      <main id="main-content" className="pt-24 pb-16 px-6">
        <article className="max-w-3xl mx-auto">
          <header className="mb-10">
            <h1
              className="heading-font font-bold text-4xl md:text-5xl mb-6"
              style={{ color: colors.plum }}
            >
              {h1}
            </h1>
            <div className="space-y-4">
              {intro.map((block, index) => (
                <Block key={index} block={block} />
              ))}
            </div>
          </header>

          <div className="space-y-6">
            {sections.map((section) => (
              <section
                key={section.heading}
                className="bg-white rounded-2xl p-8 shadow-sm border-l-4"
                style={{ borderLeftColor: colors.cyan }}
              >
                <h2 className="heading-font font-bold text-2xl mb-4" style={{ color: colors.plum }}>
                  {section.heading}
                </h2>
                <div className="space-y-4">
                  {section.blocks.map((block, index) => (
                    <Block key={index} block={block} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <SalonFactsNote />
        </article>
      </main>

      <FooterSection />
    </div>
  );
};

export default NeedGuide;
