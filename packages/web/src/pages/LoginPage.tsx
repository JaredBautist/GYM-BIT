/**
 * LoginPage — versión web de la pantalla de login.
 * Navegación completa por teclado (Tab, Enter).
 *
 * Requirements: 1.1, 1.2, 1.6, 1.8, 15.4
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth.js';

export default function LoginPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Por favor ingresa tu correo y contraseña.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = (await res.json()) as {
        accessToken?: string; refreshToken?: string;
        user?: { id: string }; code?: string; message?: string; blockedMinutes?: number;
      };

      if (!res.ok) {
        if (data.code === 'ACCOUNT_LOCKED') {
          setIsBlocked(true);
          setError(`Cuenta bloqueada por ${data.blockedMinutes ?? 15} minutos.`);
        } else {
          setError(data.message ?? 'Credenciales incorrectas.');
        }
        return;
      }

      if (data.accessToken && data.refreshToken && data.user?.id) {
        login({ userId: data.user.id, accessToken: data.accessToken, refreshToken: data.refreshToken });
        navigate('/');
      }
    } catch {
      setError('Error de conexión. Verifica tu internet.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>GymBit</h1>
        <p style={styles.subtitle}>Tu compañero fitness inteligente</p>

        {error && (
          <div role="alert" aria-live="polite" style={styles.errorBanner}>
            {error}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div style={styles.field}>
            <label htmlFor="email" style={styles.label}>Correo electrónico</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              autoComplete="email"
              disabled={isBlocked || loading}
              placeholder="tu@correo.com"
              aria-required="true"
              aria-invalid={!!error}
            />
          </div>

          <div style={styles.field}>
            <label htmlFor="password" style={styles.label}>Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              autoComplete="current-password"
              disabled={isBlocked || loading}
              placeholder="••••••••"
              aria-required="true"
            />
          </div>

          <a href="/auth/forgot-password" style={styles.forgotLink} tabIndex={0}>
            ¿Olvidaste tu contraseña?
          </a>

          <button
            type="submit"
            style={{ ...styles.button, ...(loading || isBlocked ? styles.buttonDisabled : {}) }}
            disabled={loading || isBlocked}
            aria-busy={loading}
            aria-label="Iniciar sesión"
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>

        <div style={styles.divider} role="separator" aria-hidden="true">
          <span style={styles.dividerText}>o</span>
        </div>

        <button
          style={styles.googleButton}
          onClick={() => window.location.href = `${import.meta.env.VITE_API_URL}/auth/google`}
          aria-label="Continuar con Google"
        >
          Continuar con Google
        </button>

        <p style={styles.registerText}>
          ¿No tienes cuenta?{' '}
          <a href="/auth/register" style={styles.registerLink} tabIndex={0}>
            Crear cuenta
          </a>
        </p>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', backgroundColor: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 400, backgroundColor: '#1F2937', borderRadius: 16, padding: 32 },
  title: { fontSize: 36, fontWeight: 800, color: '#F9FAFB', textAlign: 'center', margin: '0 0 8px' },
  subtitle: { fontSize: 15, color: '#9CA3AF', textAlign: 'center', margin: '0 0 24px' },
  errorBanner: { backgroundColor: '#FEE2E2', color: '#991B1B', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 13, fontWeight: 500, color: '#D1D5DB', marginBottom: 6 },
  input: { width: '100%', backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8, padding: '10px 14px', fontSize: 15, color: '#F9FAFB', outline: 'none', boxSizing: 'border-box', minHeight: 44 },
  forgotLink: { display: 'block', textAlign: 'right', color: '#6366F1', fontSize: 13, marginBottom: 20, textDecoration: 'none' },
  button: { width: '100%', backgroundColor: '#6366F1', color: '#FFFFFF', border: 'none', borderRadius: 8, padding: '13px 0', fontSize: 16, fontWeight: 600, cursor: 'pointer', minHeight: 48 },
  buttonDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  divider: { display: 'flex', alignItems: 'center', margin: '20px 0', gap: 12 },
  dividerText: { color: '#6B7280', fontSize: 13, flexShrink: 0 },
  googleButton: { width: '100%', backgroundColor: 'transparent', border: '1px solid #374151', borderRadius: 8, padding: '13px 0', fontSize: 15, color: '#F9FAFB', cursor: 'pointer', minHeight: 48 },
  registerText: { textAlign: 'center', color: '#9CA3AF', fontSize: 14, marginTop: 20 },
  registerLink: { color: '#6366F1', fontWeight: 600, textDecoration: 'none' },
};
