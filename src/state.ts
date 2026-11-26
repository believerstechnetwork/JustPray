import type {
  AdminData,
  Announcement,
  AnnouncementForm,
  BankDetails,
  Banks,
  CancelInfo,
  Currency,
  UpcomingEvent,
  GatheringEvent,
  Reservation,
} from './data/types';

export type Route = 'home' | 'register' | 'confirmed' | 'support' | 'admin' | 'cancel';
export const ROUTES: readonly Route[] = [
  'home',
  'register',
  'confirmed',
  'support',
  'admin',
  'cancel',
];
export type AdminTab = 'overview' | 'attendees' | 'contributions' | 'events' | 'announcements';
/** Support flow: choose an amount, see the bank details, then the thank-you note. */
export type SupportStep = 'choose' | 'details' | 'sent';
export type Theme = 'light' | 'dark';

export interface UiState {
  page: Route;
  theme: Theme;
  menu: boolean;
  /** 'loading' until the first /api/public answer arrives. */
  load: 'loading' | 'ready' | 'error';
  event: GatheringEvent | null;
  reserved: number;
  banks: Banks;
  /** Account shown for the contribution in progress. */
  bank: BankDetails | null;
  /** A request (form submit) is in flight. */
  busy: boolean;
  /** Name and email typed on the home page, carried to the Reserve form. */
  draft: { name: string; email: string } | null;
  /** Reservation made during this visit. */
  attendee: Reservation | null;
  attendeeEmailed: boolean;
  registerErrors: Partial<Record<string, string>>;
  registerNotice: string;
  currency: Currency;
  amount: number;
  giverName: string;
  email: string;
  reference: string;
  step: SupportStep;
  supportError: string;
  tab: AdminTab;
  /** null: not checked yet; false: needs to sign in. */
  adminAuthed: boolean | null;
  admin: AdminData | null;
  adminError: string;
  adminNotice: string;
  /** Other BTN events listed on the site. */
  upcoming: UpcomingEvent[];
  /** Organiser announcements: the list, who they go to, and the one being edited. */
  ann: {
    list: Announcement[] | null;
    audience: number;
    /** 'new', an announcement id, or null for the list. */
    editing: 'new' | number | null;
    form: AnnouncementForm;
    view: 'email' | 'site';
    device: 'laptop' | 'phone';
    confirming: boolean;
    notice: string;
    error: string;
  };
  /** The "Cancel my seat" page, opened from the private link in an email. */
  cancel: {
    token: string;
    load: 'loading' | 'ready' | 'error';
    info: CancelInfo | null;
    error: string;
    /** Cancelled during this visit, so the page can thank them. */
    justCancelled: boolean;
  };
}

export const S: UiState = {
  page: 'home',
  theme: 'light',
  menu: false,
  load: 'loading',
  event: null,
  reserved: 0,
  banks: { NGN: null, USD: null },
  bank: null,
  busy: false,
  draft: null,
  attendee: null,
  attendeeEmailed: false,
  registerErrors: {},
  registerNotice: '',
  currency: 'NGN',
  amount: 5000,
  giverName: '',
  email: '',
  reference: '',
  step: 'choose',
  supportError: '',
  tab: 'overview',
  adminAuthed: null,
  admin: null,
  adminError: '',
  adminNotice: '',
  cancel: { token: '', load: 'loading', info: null, error: '', justCancelled: false },
  upcoming: [],
  ann: {
    list: null,
    audience: 0,
    editing: null,
    form: blankAnnouncement(),
    view: 'email',
    device: 'laptop',
    confirming: false,
    notice: '',
    error: '',
  },
};

export function blankAnnouncement(): AnnouncementForm {
  return {
    title: '',
    date: '',
    endDate: null,
    time: null,
    venue: '',
    summary: '',
    imageUrl: null,
    linkUrl: null,
    linkLabel: 'Register',
    subject: '',
    message: 'Hi {first name},\n\n',
  };
}

/** Preset contribution amounts per currency; the middle one is the default. */
export const PRESETS: Record<Currency, number[]> = {
  NGN: [2000, 5000, 10000],
  USD: [10, 25, 50],
};

export const capacity = (): number => S.event?.capacity ?? 0;
export const reserved = (): number => Math.min(S.reserved, capacity());
export const seatsLeft = (): number => Math.max(0, capacity() - S.reserved);
/** Seat counts are only meaningful once the gathering has loaded. */
export const ready = (): boolean => S.load === 'ready' && S.event !== null;
