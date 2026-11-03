import { Link } from 'react-router-dom';
import { colors } from '../constants/colors';
import { GUIDE_LINKS } from '../content/needPages';

/**
 * Links to the six need pages so none of them is only reachable from the sitemap.
 */
const GuideLinks = ({ heading = 'Guides', tone = 'dark' }) => {
  const color = tone === 'light' ? 'white' : colors.cyanText;
  return (
    <nav aria-label={heading}>
      <h2 className="heading-font font-bold text-2xl mb-4" style={{ color: tone === 'light' ? 'white' : colors.plum }}>
        {heading}
      </h2>
      <ul className="space-y-2 body-font text-lg">
        {GUIDE_LINKS.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className="underline hover:opacity-80" style={{ color }}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default GuideLinks;
