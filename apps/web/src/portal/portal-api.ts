import axios from 'axios';

const BASE_URL = '/api';
const TOKEN_KEY = 'hms.portal.token';
const PATIENT_KEY = 'hms.portal.patient';

export interface PortalPatient {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
}

/**
 * A separate HTTP client for the portal.
 *
 * Deliberately not the staff `api` instance. Sharing one would mean a patient's
 * request could pick up a staff token left in the same browser, or the reverse
 * — and both are exactly the kind of thing that works fine until the day a
 * receptionist checks her own results on the front-desk machine.
 *
 * The session lives in `sessionStorage`, so closing the tab ends it. A patient
 * is far more likely than a staff member to be on a shared or public computer.
 */
export const portalApi = axios.create({ baseURL: BASE_URL });

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* a locked-down browser is not a reason to crash the page */
  }
}

export const portalSession = {
  get token(): string | null {
    return read(TOKEN_KEY);
  },
  get patient(): PortalPatient | null {
    const raw = read(PATIENT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PortalPatient;
    } catch {
      return null;
    }
  },
  start(token: string, patient: PortalPatient): void {
    write(TOKEN_KEY, token);
    write(PATIENT_KEY, JSON.stringify(patient));
  },
  end(): void {
    write(TOKEN_KEY, null);
    write(PATIENT_KEY, null);
  },
};

portalApi.interceptors.request.use((config) => {
  const token = portalSession.token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * A portal session is short (30 minutes) and there is no refresh token, so an
 * expired session simply ends. Silently retrying would be worse: a patient
 * would see a half-loaded page instead of being told to sign in again.
 */
portalApi.interceptors.response.use(
  (r) => r,
  (error: unknown) => {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 401) portalSession.end();
    return Promise.reject(error);
  },
);

export function portalErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { message?: string | string[] } } })
    .response?.data;
  const message = data?.message;
  if (Array.isArray(message)) return message.join('; ');
  return message ?? fallback;
}
