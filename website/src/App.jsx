import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import SmarterDogHomepage from './components/SmarterDogHomepage';
import CookieConsent from './components/CookieConsent';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollRestoration from './components/ScrollRestoration';
import ExternalRedirect from './components/ExternalRedirect';
import { usePageTracking } from './hooks/usePageTracking';
import { useRouteSeo } from './hooks/useRouteSeo';
import { goToBooking } from './utils/booking';
import { BOOKING_URL } from './constants/links';

// Lazy-loaded routes for code splitting (homepage is eagerly loaded)
const ServicesPage = lazy(() => import('./components/pages/ServicesPage'));
const PrivacyPolicyPage = lazy(() => import('./components/pages/PrivacyPolicyPage'));
const OurApproachPage = lazy(() => import('./components/pages/OurApproachPage'));
const FAQPage = lazy(() => import('./components/pages/FAQPage'));
const TermsPage = lazy(() => import('./components/pages/TermsPage'));
const MattedCoatPolicyPage = lazy(() => import('./components/pages/MattedCoatPolicyPage'));
const CommunityPage = lazy(() => import('./components/pages/CommunityPage'));
const NotFoundPage = lazy(() => import('./components/pages/NotFoundPage'));

// Lightweight loading fallback
const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-center">
      <div className="text-4xl mb-4 animate-bounce">🐾</div>
      <p className="text-gray-500 text-sm">Loading...</p>
    </div>
  </div>
);

// Component that uses the page tracking hook
function PageTracker() {
  usePageTracking();
  useRouteSeo();
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <PageTracker />
        <ScrollRestoration />
        <Suspense fallback={<PageFallback />}>
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
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
        <CookieConsent />
        <div className="noise-overlay" />
      </Router>
    </ErrorBoundary>
  );
}

export default App;
