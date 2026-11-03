import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import SmarterDogHomepage from './components/SmarterDogHomepage';
import CookieConsent from './components/CookieConsent';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollRestoration from './components/ScrollRestoration';
import ExternalRedirect from './components/ExternalRedirect';
import ServicesPage from './components/pages/ServicesPage';
import PrivacyPolicyPage from './components/pages/PrivacyPolicyPage';
import OurApproachPage from './components/pages/OurApproachPage';
import FAQPage from './components/pages/FAQPage';
import TermsPage from './components/pages/TermsPage';
import MattedCoatPolicyPage from './components/pages/MattedCoatPolicyPage';
import CommunityPage from './components/pages/CommunityPage';
import NotFoundPage from './components/pages/NotFoundPage';
import NeedGuide from './components/pages/NeedGuide';
import { NEED_PAGES } from './content/needPages';
import { usePageTracking } from './hooks/usePageTracking';
import { useRouteSeo } from './hooks/useRouteSeo';
import { goToBooking } from './utils/booking';
import { BOOKING_URL } from './constants/links';

// Pages are imported eagerly, not lazy. The build prerenders each public route
// to HTML, and a lazy() boundary would render "Loading..." into that HTML
// (renderToString does not wait) and would also mismatch the first client paint.

// Component that uses the page tracking hook
function PageTracker() {
  usePageTracking();
  useRouteSeo();
  return null;
}

export function MarketingApp() {
  return (
    <>
      <PageTracker />
      <ScrollRestoration />
      <Routes>
        <Route path="/" element={<SmarterDogHomepage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/houndsly" element={<ExternalRedirect to="https://houndsly.co.uk/" message="Taking you to the Houndsly shop…" />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/approach" element={<OurApproachPage onBookClick={goToBooking} />} />
        <Route path="/faq" element={<FAQPage onBookClick={goToBooking} />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/matted-coat-policy" element={<MattedCoatPolicyPage />} />
        <Route path="/book" element={<ExternalRedirect to={BOOKING_URL} />} />
        <Route path="/community" element={<CommunityPage />} />
        {NEED_PAGES.map((page) => (
          <Route key={page.path} path={page.path} element={<NeedGuide page={page} />} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <CookieConsent />
      <div className="noise-overlay" />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <MarketingApp />
      </Router>
    </ErrorBoundary>
  );
}

export default App;
