import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { MarketingApp } from './App';

/**
 * Build-time render of one marketing route. Effects do not run, so the head
 * (title, description, JSON-LD) is stamped separately from publicSeo.js.
 * Pages are imported eagerly in App.jsx so this string matches the client's
 * first render. /book is not passed here: production rewrites it to the
 * booking app, and a static file at that path would hide the rewrite.
 */
export function render(url) {
  return renderToString(
    <MemoryRouter initialEntries={[url]}>
      <MarketingApp />
    </MemoryRouter>,
  );
}
