/**
 * App.tsx — enrutador principal de la versión web PWA.
 * Code splitting con lazy loading para carga inicial < 3 s.
 *
 * Requirements: 14.1, 14.2, 15.4
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';

import { useAuth } from './hooks/useAuth.js';

// ── Lazy loading (code splitting) — Req 14.1 ─────────────────────────────────

const LoginPage = lazy(() => import('./pages/LoginPage.js'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.js'));

// ── Loading fallback ──────────────────────────────────────────────────────────

function PageLoader(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="Cargando página"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#111827',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          border: '3px solid #374151',
          borderTopColor: '#6366F1',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
        aria-hidden="true"
      />
    </div>
  );
}

// ── Protected route ───────────────────────────────────────────────────────────

function ProtectedRoute({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { session, loading } = useAuth();

  if (loading) return <PageLoader />;
  if (!session) return <Navigate to="/auth/login" replace />;

  return <>{children}</>;
}

// ── App ───────────────────────────────────────────────────────────────────────

const App: React.FC = () => (
  <BrowserRouter>
    {/* Estilos globales */}
    <style>{`
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background-color: #111827; color: #F9FAFB; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      a { color: inherit; }
      button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
        outline: 2px solid #6366F1;
        outline-offset: 2px;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (prefers-color-scheme: light) {
        body { background-color: #F9FAFB; color: #111827; }
      }
    `}</style>

    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Rutas públicas */}
        <Route path="/auth/login" element={<LoginPage />} />

        {/* Rutas protegidas */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  </BrowserRouter>
);

export default App;
