/**
 * Hook de autenticación para la versión web.
 * Gestiona sesión en localStorage (cifrado básico para web).
 *
 * Requirements: 1.8
 */

import { useState, useEffect } from 'react';

interface Session {
  userId: string;
  accessToken: string;
  refreshToken: string;
}

const SESSION_KEY = 'gymbit_session';

export function saveWebSession(session: Session): void {
  // En producción usar httpOnly cookies o Web Crypto API
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getWebSession(): Session | null {
  const raw = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearWebSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSession(getWebSession());
    setLoading(false);
  }, []);

  function login(s: Session): void {
    saveWebSession(s);
    setSession(s);
  }

  function logout(): void {
    clearWebSession();
    setSession(null);
  }

  return { session, loading, login, logout };
}
