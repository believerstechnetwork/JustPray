import type { GatheringEvent } from './data/types';

/** Seats available at each gathering. */
export const CAPACITY = 120;

/**
 * Demo mode shows the sample-data banner, seeds sample reservations and keeps
 * the payment flow simulated. Set VITE_DEMO_MODE=false once a real backend and
 * Paystack integration are connected.
 */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE !== 'false';

/** Reservations shown as already taken in demo mode. */
export const DEMO_BASELINE = 86;

/** Public address used in share links. */
export const SITE_URL: string = import.meta.env.VITE_SITE_URL || 'https://believerstechnetwork.org';

export const DEFAULT_EVENT: GatheringEvent = {
  title: 'Just Pray · A Gathering of Hearts',
  date: '2027-01-30',
  time: '4:00 PM WAT',
  venue: 'Sample venue, Lagos',
};
