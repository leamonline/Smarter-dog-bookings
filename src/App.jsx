import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import SmarterDogHomepage from './components/SmarterDogHomepage';
import CookieConsent from './components/CookieConsent';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollRestoration from './components/ScrollRestoration';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { usePageTracking } from './hooks/usePageTracking';
import { useRouteSeo } from './hooks/useRouteSeo';

// Lazy-loaded routes for code splitting (homepage is eagerly loaded)
const ServicesPage = lazy(() => import('./components/pages/ServicesPage'));
const HoundslyPage = lazy(() => import('./components/pages/HoundslyPage'));
const PrivacyPolicyPage = lazy(() => import('./components/pages/PrivacyPolicyPage'));
const OurApproachPage = lazy(() => import('./components/pages/OurApproachPage'));
const FAQPage = lazy(() => import('./components/pages/FAQPage'));
const TermsPage = lazy(() => import('./components/pages/TermsPage'));
const MattedCoatPolicyPage = lazy(() => import('./components/pages/MattedCoatPolicyPage'));
const BookingPage = lazy(() => import('./components/pages/BookingPage'));
const CommunityPage = lazy(() => import('./components/pages/CommunityPage'));
const NotFoundPage = lazy(() => import('./components/pages/NotFoundPage'));
const LoginPage = lazy(() => import('./components/pages/LoginPage'));
const AccountPage = lazy(() => import('./components/pages/AccountPage'));
const AccountProfilePage = lazy(() => import('./components/pages/AccountProfilePage'));
const AccountDogsPage = lazy(() => import('./components/pages/AccountDogsPage'));
const AccountBookingsPage = lazy(() => import('./components/pages/AccountBookingsPage'));

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
        <AuthProvider>
          <PageTracker />
          <ScrollRestoration />
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<SmarterDogHomepage />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/houndsly" element={<HoundslyPage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/approach" element={<OurApproachPage />} />
              <Route path="/faq" element={<FAQPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/matted-coat-policy" element={<MattedCoatPolicyPage />} />
              <Route path="/book" element={<BookingPage />} />
              <Route path="/community" element={<CommunityPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/account"
                element={<ProtectedRoute><AccountPage /></ProtectedRoute>}
              />
              <Route
                path="/account/profile"
                element={<ProtectedRoute><AccountProfilePage /></ProtectedRoute>}
              />
              <Route
                path="/account/dogs"
                element={<ProtectedRoute><AccountDogsPage /></ProtectedRoute>}
              />
              <Route
                path="/account/bookings"
                element={<ProtectedRoute><AccountBookingsPage /></ProtectedRoute>}
              />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
          <CookieConsent />
          <div className="noise-overlay" />
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
