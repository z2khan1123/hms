import axios, { type InternalAxiosRequestConfig } from 'axios';

const ACCESS_KEY = 'hms.accessToken';
const REFRESH_KEY = 'hms.refreshToken';
/** Shared with the auth context so a session is cleared from exactly one place. */
export const SESSION_USER_KEY = 'hms.user';
const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const tokenStore = {
  get access(): string | null {
    return safeGet(ACCESS_KEY);
  },
  get refresh(): string | null {
    return safeGet(REFRESH_KEY);
  },
  set(access: string, refresh: string): void {
    try {
      localStorage.setItem(ACCESS_KEY, access);
      localStorage.setItem(REFRESH_KEY, refresh);
    } catch {
      /* storage unavailable — session lives in memory only */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* ignore */
    }
  },
};

/** Drop every trace of the signed-in session from this browser. */
export function clearSession(): void {
  tokenStore.clear();
  try {
    localStorage.removeItem(SESSION_USER_KEY);
  } catch {
    /* ignore */
  }
}

export const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * A page fires many queries at once, so an expired access token produces many
 * simultaneous 401s. They must share ONE refresh attempt: the promise is reset
 * in a `finally` on the promise itself, so it survives until that attempt has
 * actually settled rather than being cleared by whichever caller resumes first.
 */
let refreshing: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    const refresh = tokenStore.refresh;
    if (!refresh) return null;
    try {
      const { data } = await axios.post<{
        accessToken: string;
        refreshToken: string;
      }>(`${BASE_URL}/auth/refresh`, { refreshToken: refresh });
      tokenStore.set(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      return null;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Guards against every in-flight request racing to redirect. */
let signingOut = false;

function endSession(): void {
  if (signingOut) return;
  signingOut = true;
  clearSession();
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error?.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;
    const status = error?.response?.status;

    // Never try to refresh using the refresh call itself — that recurses.
    const isRefreshCall = original?.url?.includes('/auth/refresh');

    if (status === 401 && original && !original._retry && !isRefreshCall) {
      original._retry = true;
      const token = await refreshAccessToken();
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      endSession();
    }
    return Promise.reject(error);
  },
);

/** Pull a human-readable message out of an axios error. */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(', ');
    if (typeof data?.message === 'string') return data.message;
    return error.message;
  }
  return fallback;
}
