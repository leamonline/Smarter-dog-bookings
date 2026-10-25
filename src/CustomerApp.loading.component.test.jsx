import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  loaded: [],
  auth: { user: null, humanRecord: null, loading: false },
  signup: { loading: false, status: 'approved' },
  gate: { loading: false, complete: true },
}));
vi.mock('./supabase/hooks/useCustomerAuth', () => ({ useCustomerAuth: () => state.auth }));
vi.mock('./supabase/hooks/useCustomerSignupGate', () => ({ useCustomerSignupGate: () => state.signup }));
vi.mock('./supabase/hooks/useCustomerProfileGate', () => ({ useCustomerProfileGate: () => state.gate }));
vi.mock('./components/auth/CustomerLoginPage.jsx', () => ({ CustomerLoginPage: () => <p>Sign in screen</p> }));
vi.mock('./components/customer/CustomerDashboard.jsx', () => {
  state.loaded.push('dashboard');
  return { CustomerDashboard: () => <p>Dashboard screen</p> };
});
vi.mock('./components/customer/booking/BookingWizard', () => {
  state.loaded.push('booking');
  return { BookingWizard: () => <p>Booking screen</p> };
});
vi.mock('./components/customer/onboarding/JoinThePackOnboarding.jsx', () => {
  state.loaded.push('onboarding');
  return { JoinThePackOnboarding: () => <p>Onboarding screen</p> };
});
import CustomerApp from './CustomerApp.jsx';

afterEach(cleanup);
function show(path = '/') {
  render(<MemoryRouter initialEntries={[path]}><CustomerApp /></MemoryRouter>);
}

it('does not load authenticated screens for sign-in, then loads only the selected gate or route', async () => {
  show('/login');
  expect(await screen.findByText('Sign in screen')).toBeTruthy();
  expect(state.loaded).toEqual([]);
  cleanup();

  state.auth = { user: { id: 'synthetic-user' }, humanRecord: { id: 'synthetic-human' }, loading: false, hasPassword: true };
  state.signup.status = 'onboarding';
  show('/new');
  expect(await screen.findByText('Onboarding screen')).toBeTruthy();
  expect(state.loaded).toEqual(['onboarding']);
  cleanup();

  state.signup.status = 'approved';
  show();
  expect(await screen.findByText('Dashboard screen')).toBeTruthy();
  expect(state.loaded).toEqual(['onboarding', 'dashboard']);
  cleanup();

  show('/new');
  expect(await screen.findByText('Booking screen')).toBeTruthy();
  expect(state.loaded).toEqual(['onboarding', 'dashboard', 'booking']);
});
