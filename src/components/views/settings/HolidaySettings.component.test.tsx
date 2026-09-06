import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { HolidaySettings } from './HolidaySettings';
const mocks = vi.hoisted(() => ({ loadHolidays: vi.fn(), saveHoliday: vi.fn() }));
vi.mock('../../../supabase/holidays', () => mocks);
beforeEach(() => { mocks.loadHolidays.mockResolvedValue([]); mocks.saveHoliday.mockReset(); });
it('submits one atomic command with the preview dates and reports a failed save', async () => {
  mocks.saveHoliday.mockRejectedValue(new Error('Open the reopening date in the diary first.'));
  render(<HolidaySettings />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add holiday' }));
  fireEvent.change(screen.getByLabelText('Show advance notice from'), { target: { value: '2026-09-01' } });
  fireEvent.change(screen.getByLabelText('First closed date'), { target: { value: '2026-09-14' } });
  fireEvent.change(screen.getByLabelText('Reopening date'), { target: { value: '2026-09-22' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save holiday and close dates' }));
  await screen.findByRole('alert');
  expect(mocks.saveHoliday).toHaveBeenCalledWith(expect.objectContaining({ closed_from: '2026-09-14', reopens_on: '2026-09-22', revision: 0, enabled: true }));
  expect(screen.getByRole('alert')).toHaveTextContent('Open the reopening date');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('does not allow a read-only staff screen to add holidays', async () => {
  render(<HolidaySettings canEdit={false} />);
  await waitFor(() => expect(mocks.loadHolidays).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: 'Add holiday' })).toBeDisabled();
});
