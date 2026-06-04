/**
 * MediTrace â€” API client utilities
 */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8001";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("mt_token");
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err?.detail ?? err?.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err?.detail ?? err?.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export function apiSSE(path: string): EventSource {
  const token = getToken();
  // For SSE with auth, we pass token as query param
  return new EventSource(`${BASE}${path}${token ? `?token=${token}` : ""}`);
}

export const API_URL = BASE;

