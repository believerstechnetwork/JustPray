import { CAPACITY, DEFAULT_EVENT, DEMO_BASELINE, DEMO_MODE } from './config';
import { LocalStore } from './data/local-store';
import type { GatheringEvent, Reservation, Store } from './data/types';

export type Route = 'home' | 'register' | 'confirmed' | 'support' | 'payment' | 'admin';
export const ROUTES: readonly Route[] = [
  'home',
  'register',
  'confirmed',
  'support',
  'payment',
  'admin',
];
export type AdminTab = 'overview' | 'attendees' | 'contributions' | 'events';
export type SupportStep = 'choose' | 'details' | 'checking' | 'pending';
export type Theme = 'light' | 'dark';

export interface UiState {
  page: Route;
  theme: Theme;
  menu: boolean;
  /** Reservation made (or found) during this visit. */
  attendee: Reservation | null;
  registerErrors: Partial<Record<string, string>>;
  registerNotice: string;
  amount: number;
  email: string;
  step: SupportStep;
  supportError: string;
  tab: AdminTab;
  event: GatheringEvent;
  eventSaved: boolean;
}

export const store: Store = new LocalStore({
  capacity: CAPACITY,
  baseline: DEMO_MODE ? DEMO_BASELINE : 0,
  defaultEvent: DEFAULT_EVENT,
});

export const S: UiState = {
  page: 'home',
  theme: 'light',
  menu: false,
  attendee: null,
  registerErrors: {},
  registerNotice: '',
  amount: 5000,
  email: '',
  step: 'choose',
  supportError: '',
  tab: 'overview',
  event: store.getEvent(),
  eventSaved: false,
};

export const reserved = (): number => store.reservedCount();
export const seatsLeft = (): number => CAPACITY - reserved();
