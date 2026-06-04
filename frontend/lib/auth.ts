/**
 * MediTrace — Auth helpers (localStorage-based JWT)
 */
export interface AuthUser {
  user_id: string;
  role: "admin" | "doctor" | "patient";
  full_name: string | null;
  access_token: string;
}

const TOKEN_KEY = "mt_token";
const USER_KEY = "mt_user";

export function saveAuth(data: AuthUser) {
  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(USER_KEY, JSON.stringify(data));
}

export function getAuth(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isLoggedIn(): boolean {
  return !!getAuth();
}

export function requireRole(role: string): boolean {
  return getAuth()?.role === role;
}
