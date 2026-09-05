import axios, { type InternalAxiosRequestConfig } from 'axios';

const ACCESS_KEY = 'hms.accessToken';
const REFRESH_KEY = 'hms.refreshToken';
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

export const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
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
    tokenStore.clear();
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error?.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    if (error?.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      refreshing ??= refreshAccessToken();
      const token = await refreshing;
      refreshing = null;
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
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
