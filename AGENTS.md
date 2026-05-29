# GYM-BIT — Session Context

## Project Overview

Full-stack fitness app: NestJS-like backend (Express + tsx), React Native (Expo) mobile app, web frontend. Features: auth (email+Google OAuth), onboarding, workout plans, nutrition tracking, sleep tracking, weight history, wearables, AI meal photos (Gemini Vision), calorie/macro tracking.

## Backend

- **Location:** `packages/backend/`
- **Runtime:** Node.js + tsx watch (auto-restart on file changes)
- **Framework:** Express
- **Database:** MariaDB (NOT SQLite — critical!)
- **Key issue:** Many queries use SQLite syntax (`datetime('now')`, `strftime`, `julianday`, `datetime('now', '-N days')`) which FAIL in MariaDB. Only `profile.service.ts` has been fixed so far (all lowercase table names + `NOW()`). Other services will crash if their endpoints are hit: `analytics.service.ts`, `nutrition.service.ts`, `sleep.service.ts`, `workout.service.ts`, `sync.service.ts`, `wearable.service.ts`.
- **Migration:** Runs separately via `npm run migrate` (from `packages/backend/`). NOT auto-run on startup.
- **Auth:** Email/password login (bcrypt + JWT RS256) + Google OAuth (Auth0 flow).
- **Rate limiting:** Express-rate-limit with `X-Forwarded-For` header validation warning (safe to ignore in dev).
- **Running at:** PID 307387, logs to `/tmp/backend.log`, stdio through /dev/null.

## Frontend (Mobile)

- **Location:** `packages/mobile/`
- **Runtime:** Expo (React Native)
- **Router:** Expo Router (file-based routing in `app/` directory)
- **Auth:** `expo-secure-store` for session persistence (AES-256 via keychain/keystore).
- **Local DB:** SQLite via `expo-sqlite` (`users_cache` table for offline user data and onboarding progress).
- **API URL:** Set in `packages/mobile/.env` as `EXPO_PUBLIC_API_URL`. Currently using Cloudflare Tunnel.

## Current Session (May 29, 2026)

### Problems Solved

#### 1. Connectivity: LocalTunnel expired
- **Symptom:** "Error de conexión" on login screen.
- **Root cause:** The localtunnel URL `https://slow-carpets-shake.loca.lt` expired.
- **Fix:** Replaced with Cloudflare tunnel (`npx cloudflared tunnel --url http://localhost:3000`). Current URL in `.env`: `https://union-careers-petition-challenged.trycloudflare.com`.
- **Note:** Cloudflare tunnel must be kept running in background (`nohup npx cloudflared tunnel --url http://localhost:3000 > /tmp/cloudflared.log 2>&1 &`). If it dies, restart it. The trycloudflare URL changes each restart.

#### 2. Navigation: App skipped onboarding after login
- **Files changed:** `packages/mobile/app/index.tsx`, `packages/mobile/src/screens/auth/LoginScreen.tsx`
- **Symptom:** After login/register, app went straight to dashboard `(tabs)`.
- **Root cause:** `index.tsx` always redirected to `/(tabs)` if a session existed, without checking if onboarding was completed.
- **Fix:**
  - `index.tsx`: Changed to call `getUserById(session.userId)` and check `user.goal && user.heightCm && user.weightKg`. If any is null → redirect to `/onboarding`. Only redirect to `/(tabs)` if profile exists.
  - `LoginScreen.tsx`: Changed `router.replace('/(tabs)')` to `router.replace('/')` (back to index) so the onboarding check in `index.tsx` runs. Same for Google login handler.

#### 3. Onboarding: Error saving profile
- **Files changed:** `packages/backend/src/services/profile.service.ts`
- **Symptom:** After completing onboarding form → "Error al guardar el perfil" / "Internal server error".
- **Root cause 1:** MySQL/MariaDB table name case sensitivity (`lower_case_table_names=0`). Backend queries used `PROFILES` (uppercase) but table was stored as `profiles` (lowercase). This caused `Table 'gymbit.PROFILES' doesn't exist`.
- **Root cause 2:** Queries used SQLite syntax `datetime('now')` instead of MariaDB's `NOW()`.
- **Fix:** Changed all `PROFILES` → `profiles`, all `datetime('now')` → `NOW()` in profile.service.ts.

#### 4. Onboarding: No welcome screen
- **Files changed:** `packages/mobile/src/screens/onboarding/OnboardingScreen.tsx`, `packages/mobile/src/screens/auth/LoginScreen.tsx`
- **Symptom:** Onboarding started directly with goal selection, no greeting.
- **Fix:**
  - Added `'welcome'` step as first onboarding step.
  - LoginScreen now saves user data (id, email, name) to local SQLite `users_cache` via `upsertUser()` after successful login.
  - Onboarding reads user name from local cache and displays "BIENVENIDO" + name before the form.

### Active Issues

#### Backend: SQLite syntax in MariaDB environment
- **Scope:** Multiple service files use SQLite-specific functions incompatible with MariaDB.
- **Affected files (UNFIXED):**
  - `packages/backend/src/services/analytics.service.ts` — uses `strftime()`, `datetime('now', '-N days')`.
  - `packages/backend/src/services/workout.service.ts` — uses `datetime('now')`, `julianday()`.
  - `packages/backend/src/services/sleep.service.ts` — uses `datetime('now', '-24 hours')`.
  - `packages/backend/src/services/nutrition.service.ts` — uses `datetime('now')`.
  - `packages/backend/src/services/sync.service.ts` — uses `datetime('now')`.
  - `packages/backend/src/services/wearable.service.ts` — uses `datetime('now')`.
- **Impact:** These endpoints will return 500 if called. Only profile.service.ts has been fixed.
- **Potential solution:** Either fix all files (replace SQLite functions with MariaDB equivalents), or switch to a SQLite database (change DATABASE_URL, use `better-sqlite3` driver), or find a compatibility layer.

#### Backend: Uppercase table names in migration
- The migration SQL (`packages/backend/src/db/migrations/001_initial_schema.sql`) creates tables with uppercase names (`PROFILES`, `USERS`, etc.), but MariaDB with `lower_case_table_names=0` on Linux stores/cases them correctly. Since most queries use lowercase names, they work. But some queries (now fixed in profile.service) used uppercase and failed.
- The auth service uses lowercase `users` → works fine.
- Other service files should be checked for uppercase table references.

### Infrastructure

#### Running processes
- **Backend:** Node.js (PID 307387), running via `tsx watch` from `packages/backend/`. Auto-restarts on file changes. Environment from `.env` file in `packages/backend/`.
- **Cloudflare Tunnel:** Running in background (PID 323337+). Logs to `/tmp/cloudflared.log`.
- **Expo Dev Server:** Started manually by user with `npx expo start --clear --tunnel`.

#### Database
- **Type:** MariaDB (MySQL-compatible)
- **URL:** `mysql://gymbit:gymbit_pass@localhost:3306/gymbit`
- **Migration status:** All migrations applied.
- **Table name case:** Stored as lowercase (`profiles`, `users`, etc.) despite migration SQL using uppercase. `lower_case_table_names=0` (case-sensitive).

#### API URL
- Current: `https://union-careers-petition-challenged.trycloudflare.com`
- Mechanism: Cloudflare quick tunnel (trycloudflare.com)
- Auto-changes on restart. Update `packages/mobile/.env` with new URL after each restart.

### App Flow (After Fixes)

1. App opens → `index.tsx`
2. No session → `/auth/login`
3. Has session + no profile → `/onboarding` (welcome → goal → physical → experience → days → equipment)
4. Onboarding complete → saves profile to API (PUT /profile) → saves to local SQLite → generates workout plan + nutrition plan → redirects to `/(tabs)`
5. Has session + profile → `/(tabs)` (dashboard)

### Key Files

#### Frontend
| File | Purpose |
|---|---|
| `app/index.tsx` | Entry point, session + onboarding check |
| `app/_layout.tsx` | Root layout, SQLite init |
| `app/auth/login.tsx` | Login route |
| `app/auth/register.tsx` | Register route |
| `app/onboarding/index.tsx` | Onboarding route |
| `app/(tabs)/_layout.tsx` | Tab navigation layout |
| `src/screens/auth/LoginScreen.tsx` | Login UI + Google OAuth |
| `src/screens/onboarding/OnboardingScreen.tsx` | Full onboarding flow (6 steps) |
| `src/db/repositories/user.repository.ts` | Local user cache + session persistence |
| `.env` | API URL + Auth0 config |

#### Backend
| File | Purpose |
|---|---|
| `src/index.ts` | Entry point |
| `src/app.ts` | Express app setup, CORS, routes |
| `src/config/env.ts` | Env validation (Zod) |
| `src/db/pool.ts` | MySQL connection pool |
| `src/db/migrate.ts` | Migration runner |
| `src/db/migrations/001_initial_schema.sql` | Full schema |
| `src/services/profile.service.ts` | Profile CRUD, BMI/BMR/TDEE (FIXED) |
| `src/services/auth.service.ts` | Auth logic (register, login, Google, tokens) |
| `src/routes/profile/index.ts` | Profile routes + Zod validation |
| `src/routes/auth/index.ts` | Auth routes + rate limiting |
| `src/services/analytics.service.ts` | Charts/analytics (BROKEN - SQLite syntax) |
| `src/services/workout.service.ts` | Workout plans/sessions (BROKEN - SQLite syntax) |
| `src/services/nutrition.service.ts` | Nutrition plans/meals (BROKEN - SQLite syntax) |
| `src/services/sleep.service.ts` | Sleep records (BROKEN - SQLite syntax) |
| `src/services/sync.service.ts` | Offline sync (BROKEN - SQLite syntax) |
| `src/services/wearable.service.ts` | Wearable devices (BROKEN - SQLite syntax) |
