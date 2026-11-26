import type {
  AdminData,
  Announcement,
  AnnouncementForm,
  BankDetails,
  CancelInfo,
  Contribution,
  Currency,
  GatheringEvent,
  PublicInfo,
  ReserveResponse,
} from './data/types';

/** Error from the API with a message that is safe to show to the visitor. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: Partial<Record<string, string>> = {},
  ) {
    super(message);
  }
}

const OFFLINE = "We couldn't reach the server. Check your connection and try again.";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, OFFLINE);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  // A full gathering is an answer, not an error.
  if (res.ok || (res.status === 409 && data.status === 'full')) return data as T;
  const message =
    typeof data.error === 'string' ? data.error : 'Something went wrong. Please try again.';
  throw new ApiError(res.status, message, (data.fields as Record<string, string>) ?? {});
}

export const api = {
  publicInfo: () => call<PublicInfo>('GET', 'public'),
  reserve: (form: Record<string, string | boolean>) =>
    call<ReserveResponse>('POST', 'reserve', form),
  startContribution: (form: Record<string, string>) =>
    call<{ reference: string; currency: Currency; amount: number; bank: BankDetails }>(
      'POST',
      'contributions',
      form,
    ),
  markSent: (reference: string) =>
    call<{ reference: string }>('POST', 'contributions/sent', { reference }),
  cancelLookup: (token: string) => call<CancelInfo>('POST', 'cancel/lookup', { token }),
  cancel: (token: string) => call<CancelInfo>('POST', 'cancel', { token }),
  login: (password: string) => call<{ ok: true }>('POST', 'admin/login', { password }),
  logout: () => call<{ ok: true }>('POST', 'admin/logout', {}),
  adminData: () => call<AdminData>('GET', 'admin/data'),
  saveEvent: (event: GatheringEvent) =>
    call<{ event: GatheringEvent }>('PUT', 'admin/event', event),
  announcements: () =>
    call<{ announcements: Announcement[]; audience: number }>('GET', 'admin/announcements'),
  createAnnouncement: (form: AnnouncementForm) =>
    call<{ announcement: Announcement }>('POST', 'admin/announcements', form),
  updateAnnouncement: (id: number, form: AnnouncementForm) =>
    call<{ announcement: Announcement }>('PUT', `admin/announcements/${id}`, form),
  deleteAnnouncement: (id: number) => call<{ ok: true }>('DELETE', `admin/announcements/${id}`),
  publishAnnouncement: (id: number) =>
    call<{ announcement: Announcement }>('POST', `admin/announcements/${id}/publish`, {}),
  setContributionStatus: (id: number, status: Contribution['status']) =>
    call<{ contribution: Contribution }>('POST', `admin/contributions/${id}`, { status }),
};
