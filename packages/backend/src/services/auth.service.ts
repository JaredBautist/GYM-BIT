import crypto from 'crypto';
import fs from 'fs';

import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

import { env } from '../config/env.js';
import { query, withTransaction } from '../db/pool.js';

// ── Constants ────────────────────────────────────────────────────────────────

export const BCRYPT_ROUNDS = 12; // Requirement 1.9
const JWT_EXPIRY = '24h'; // Requirement 13.6
const REFRESH_EXPIRY_DAYS = 30; // Requirement 13.6
const REFRESH_EXPIRY_SECONDS = REFRESH_EXPIRY_DAYS * 24 * 60 * 60;
const MAX_FAILED_ATTEMPTS = 5; // Requirement 1.6
const LOCKOUT_SECONDS = 15 * 60; // 15 minutes
const EMAIL_VERIFY_EXPIRY_MINUTES = 60 * 24; // 24 h
const PASSWORD_RESET_EXPIRY_MINUTES = 30; // Requirement 1.5

// ── In-memory rate limiting ──────────────────────────────────────────────────

const failedAttempts = new Map<string, { count: number; lastAttempt: number }>();
const lockouts = new Map<string, number>();

// Periodic cleanup every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of failedAttempts) {
    if (now - value.lastAttempt > LOCKOUT_SECONDS * 1000) {
      failedAttempts.delete(key);
    }
  }
  for (const [key, expiresAt] of lockouts) {
    if (now > expiresAt) {
      lockouts.delete(key);
    }
  }
}, 60_000);

function failedAttemptsKey(email: string): string {
  return email.toLowerCase();
}

function lockoutKey(email: string): string {
  return email.toLowerCase();
}

export async function getLockoutTTL(email: string): Promise<number> {
  const expiresAt = lockouts.get(lockoutKey(email));
  if (!expiresAt) return 0;
  const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

export async function recordFailedAttempt(email: string): Promise<number> {
  const key = failedAttemptsKey(email);
  const now = Date.now();
  const entry = failedAttempts.get(key);

  const count = entry && now - entry.lastAttempt < LOCKOUT_SECONDS * 1000
    ? entry.count + 1
    : 1;

  failedAttempts.set(key, { count, lastAttempt: now });

  if (count >= MAX_FAILED_ATTEMPTS) {
    lockouts.set(key, now + LOCKOUT_SECONDS * 1000);
    failedAttempts.delete(key);
    return 0;
  }

  return MAX_FAILED_ATTEMPTS - count;
}

export async function clearFailedAttempts(email: string): Promise<void> {
  const key = email.toLowerCase();
  failedAttempts.delete(key);
  lockouts.delete(key);
}

// ── JWT key loading ───────────────────────────────────────────────────────────

let _privateKey: string | null = null;
let _publicKey: string | null = null;

export function getPrivateKey(): string {
  if (!_privateKey) {
    _privateKey = fs.readFileSync(env.JWT_PRIVATE_KEY_PATH, 'utf8');
  }
  return _privateKey;
}

export function getPublicKey(): string {
  if (!_publicKey) {
    _publicKey = fs.readFileSync(env.JWT_PUBLIC_KEY_PATH, 'utf8');
  }
  return _publicKey;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  email: string;
  auth0_id: string;
  name: string;
  password_hash: string | null;
  email_verified: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked: number;
  created_at: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ── Token generation ──────────────────────────────────────────────────────────

export function generateAccessToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, getPrivateKey(), {
    algorithm: 'RS256',
    expiresIn: JWT_EXPIRY,
    issuer: `https://${env.AUTH0_DOMAIN}/`,
    audience: env.AUTH0_AUDIENCE,
  });
}

export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

export async function storeRefreshToken(userId: string, tokenHash: string): Promise<string> {
  const id = uuidv4();
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_SECONDS * 1000).toISOString();

  await query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked, created_at)
     VALUES (?, ?, ?, ?, 0, datetime('now'))`,
    [id, userId, tokenHash, expiresAt],
  );

  return id;
}

export async function issueTokens(userId: string, email: string): Promise<AuthTokens> {
  const accessToken = generateAccessToken(userId, email);
  const { token: refreshToken, hash } = generateRefreshToken();
  await storeRefreshToken(userId, hash);

  return {
    accessToken,
    refreshToken,
    expiresIn: 24 * 60 * 60,
  };
}

// ── Registration ──────────────────────────────────────────────────────────────

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface RegisterResult {
  userId: string;
  verificationToken: string;
}

export async function registerLocal(input: RegisterInput): Promise<RegisterResult> {
  const { email, password, name } = input;

  const existing = await query<UserRow>('SELECT id FROM users WHERE email = ?', [
    email.toLowerCase(),
  ]);
  if (existing.length > 0) {
    throw Object.assign(new Error('Email already registered'), { code: 'EMAIL_EXISTS' });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const verificationToken = crypto.randomBytes(32).toString('hex');
  const verificationTokenHash = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  const verificationExpiry = new Date(Date.now() + EMAIL_VERIFY_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const userId = uuidv4();
  const auth0Id = `local|${userId}`;

  await withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO users (id, email, auth0_id, name, password_hash, email_verified, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 1, datetime('now'), datetime('now'))`,
      [userId, email.toLowerCase(), auth0Id, name, passwordHash],
    );

    await conn.execute(
      `INSERT INTO email_verifications (id, user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [uuidv4(), userId, verificationTokenHash, verificationExpiry],
    );
  });

  return { userId, verificationToken };
}

// ── Login ─────────────────────────────────────────────────────────────────────

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  tokens: AuthTokens;
  user: { id: string; email: string; name: string; emailVerified: boolean };
}

export async function loginLocal(input: LoginInput): Promise<LoginResult> {
  const { email, password } = input;

  const lockoutTTL = await getLockoutTTL(email);
  if (lockoutTTL > 0) {
    throw Object.assign(new Error(`Account locked. Try again in ${Math.ceil(lockoutTTL / 60)} minutes.`), {
      code: 'ACCOUNT_LOCKED',
      retryAfter: lockoutTTL,
    });
  }

  const users = await query<UserRow>(
    'SELECT id, email, name, password_hash, email_verified, is_active FROM users WHERE email = ?',
    [email.toLowerCase()],
  );

  const user = users[0];
  const dummyHash = '$2b$12$invalidhashfortimingnormalization000000000000000000000';
  const hashToCompare = user?.password_hash ?? dummyHash;
  const passwordMatch = await bcrypt.compare(password, hashToCompare);

  if (!user || !passwordMatch || !user.is_active) {
    await recordFailedAttempt(email);
    throw Object.assign(new Error('Invalid credentials'), { code: 'INVALID_CREDENTIALS' });
  }

  await clearFailedAttempts(email);

  const tokens = await issueTokens(user.id, user.email);

  return {
    tokens,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: Boolean(user.email_verified),
    },
  };
}

// ── OAuth callback (Auth0 / Google) ───────────────────────────────────────────

export interface OAuthCallbackInput {
  code: string;
  redirectUri: string;
}

export interface Auth0TokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
}

export interface Auth0UserInfo {
  sub: string;
  email: string;
  name: string;
  email_verified: boolean;
  picture?: string;
}

export async function handleOAuthCallback(input: OAuthCallbackInput): Promise<LoginResult> {
  const { code, redirectUri } = input;

  const tokenRes = await fetch(`https://${env.AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: env.AUTH0_CLIENT_ID,
      client_secret: env.AUTH0_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw Object.assign(new Error(`Auth0 token exchange failed: ${body}`), {
      code: 'OAUTH_EXCHANGE_FAILED',
    });
  }

  const auth0Tokens = (await tokenRes.json()) as Auth0TokenResponse;

  const userInfoRes = await fetch(`https://${env.AUTH0_DOMAIN}/userinfo`, {
    headers: { Authorization: `Bearer ${auth0Tokens.access_token}` },
  });

  if (!userInfoRes.ok) {
    throw Object.assign(new Error('Failed to fetch user info from Auth0'), {
      code: 'OAUTH_USERINFO_FAILED',
    });
  }

  const userInfo = (await userInfoRes.json()) as Auth0UserInfo;

  const existingUsers = await query<UserRow>(
    'SELECT id, email, name, email_verified FROM users WHERE auth0_id = ?',
    [userInfo.sub],
  );

  let userId: string;
  let userEmail: string;
  let userName: string;

  if (existingUsers.length > 0) {
    const existing = existingUsers[0]!;
    userId = existing.id;
    userEmail = existing.email;
    userName = existing.name;

    if (userInfo.email_verified && !existing.email_verified) {
      await query("UPDATE users SET email_verified = 1, updated_at = datetime('now') WHERE id = ?", [userId]);
    }
  } else {
    userId = uuidv4();
    userEmail = userInfo.email.toLowerCase();
    userName = userInfo.name;

    await query(
      `INSERT INTO users (id, email, auth0_id, name, password_hash, email_verified, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, 1, datetime('now'), datetime('now'))`,
      [userId, userEmail, userInfo.sub, userName, userInfo.email_verified ? 1 : 0],
    );
  }

  const tokens = await issueTokens(userId, userEmail);

  return {
    tokens,
    user: {
      id: userId,
      email: userEmail,
      name: userName,
      emailVerified: userInfo.email_verified,
    },
  };
}

// ── Google Sign-In (direct) ───────────────────────────────────────────────────

export interface GoogleAuthInput {
  code: string;
  clientId: string;
  redirectUri: string;
}

let _googleClient: OAuth2Client | null = null;

function getGoogleClient(): OAuth2Client {
  if (!_googleClient) {
    _googleClient = new OAuth2Client(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
    );
  }
  return _googleClient;
}

export async function handleGoogleAuth(input: GoogleAuthInput): Promise<LoginResult> {
  const { code, redirectUri } = input;

  const client = getGoogleClient();
  let payload: { sub: string; email: string; name: string; email_verified: boolean };

  try {
    const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
    if (!tokens.id_token) {
      throw new Error('No id_token in Google response');
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const ticketPayload = ticket.getPayload();
    if (!ticketPayload) {
      throw new Error('Invalid id_token payload');
    }
    payload = {
      sub: ticketPayload.sub ?? '',
      email: ticketPayload.email ?? '',
      name: ticketPayload.name ?? '',
      email_verified: ticketPayload.email_verified ?? false,
    };
  } catch (err) {
    throw Object.assign(new Error('Google token exchange failed'), { code: 'OAUTH_EXCHANGE_FAILED' });
  }

  const existingUsers = await query<UserRow>(
    'SELECT id, email, name, email_verified FROM users WHERE auth0_id = ?',
    [payload.sub],
  );

  let userId: string;
  let userEmail: string;
  let userName: string;

  if (existingUsers.length > 0) {
    const existing = existingUsers[0]!;
    userId = existing.id;
    userEmail = existing.email;
    userName = existing.name;

    if (payload.email_verified && !existing.email_verified) {
      await query("UPDATE users SET email_verified = 1, updated_at = datetime('now') WHERE id = ?", [userId]);
    }
  } else {
    userId = uuidv4();
    userEmail = payload.email.toLowerCase();
    userName = payload.name;

    await query(
      `INSERT INTO users (id, email, auth0_id, name, password_hash, email_verified, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, 1, datetime('now'), datetime('now'))`,
      [userId, userEmail, payload.sub, userName, payload.email_verified ? 1 : 0],
    );
  }

  const tokens = await issueTokens(userId, userEmail);

  return {
    tokens,
    user: {
      id: userId,
      email: userEmail,
      name: userName,
      emailVerified: payload.email_verified,
    },
  };
}

// ── Refresh token ─────────────────────────────────────────────────────────────

export async function refreshAccessToken(rawRefreshToken: string): Promise<AuthTokens> {
  const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

  const rows = await query<RefreshTokenRow>(
    `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked, u.email
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = ?`,
    [tokenHash],
  );

  if (rows.length === 0) {
    throw Object.assign(new Error('Invalid refresh token'), { code: 'INVALID_REFRESH_TOKEN' });
  }

  const row = rows[0]! as RefreshTokenRow & { email: string };

  if (row.revoked) {
    throw Object.assign(new Error('Refresh token has been revoked'), {
      code: 'REFRESH_TOKEN_REVOKED',
    });
  }

  if (new Date(row.expires_at) < new Date()) {
    throw Object.assign(new Error('Refresh token has expired'), {
      code: 'REFRESH_TOKEN_EXPIRED',
    });
  }

  await query('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?', [row.id]);

  const newAccessToken = generateAccessToken(row.user_id, row.email);
  const { token: newRefreshToken, hash: newHash } = generateRefreshToken();
  await storeRefreshToken(row.user_id, newHash);

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: 24 * 60 * 60,
  };
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function logout(rawRefreshToken: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
  await query('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?', [tokenHash]);
}

// ── Forgot password ───────────────────────────────────────────────────────────

export interface ForgotPasswordResult {
  resetToken: string;
}

export async function forgotPassword(email: string): Promise<ForgotPasswordResult | null> {
  const users = await query<UserRow>('SELECT id FROM users WHERE email = ? AND is_active = 1', [
    email.toLowerCase(),
  ]);

  if (users.length === 0) return null;

  const userId = users[0]!.id;
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000).toISOString();

  await query('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0', [userId]);

  await query(
    `INSERT INTO password_resets (id, user_id, token_hash, expires_at, used, created_at)
     VALUES (?, ?, ?, ?, 0, datetime('now'))`,
    [uuidv4(), userId, resetTokenHash, expiresAt],
  );

  return { resetToken };
}

// ── Reset password ────────────────────────────────────────────────────────────

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const rows = await query<{ id: string; user_id: string; expires_at: string; used: number }>(
    'SELECT id, user_id, expires_at, used FROM password_resets WHERE token_hash = ?',
    [tokenHash],
  );

  if (rows.length === 0) {
    throw Object.assign(new Error('Invalid or expired reset token'), {
      code: 'INVALID_RESET_TOKEN',
    });
  }

  const row = rows[0]!;

  if (row.used) {
    throw Object.assign(new Error('Reset token already used'), { code: 'RESET_TOKEN_USED' });
  }

  if (new Date(row.expires_at) < new Date()) {
    throw Object.assign(new Error('Reset token has expired'), { code: 'RESET_TOKEN_EXPIRED' });
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await withTransaction(async (conn) => {
    await conn.execute(
      "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
      [passwordHash, row.user_id],
    );
    await conn.execute('UPDATE password_resets SET used = 1 WHERE id = ?', [row.id]);
    await conn.execute('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', [row.user_id]);
  });
}

// ── Email verification ────────────────────────────────────────────────────────

export async function verifyEmail(token: string): Promise<{ userId: string }> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const rows = await query<{ id: string; user_id: string; expires_at: string; used: number }>(
    'SELECT id, user_id, expires_at, used FROM email_verifications WHERE token_hash = ?',
    [tokenHash],
  );

  if (rows.length === 0) {
    throw Object.assign(new Error('Invalid verification token'), {
      code: 'INVALID_VERIFY_TOKEN',
    });
  }

  const row = rows[0]!;

  if (row.used) {
    throw Object.assign(new Error('Verification token already used'), {
      code: 'VERIFY_TOKEN_USED',
    });
  }

  if (new Date(row.expires_at) < new Date()) {
    throw Object.assign(new Error('Verification token has expired'), {
      code: 'VERIFY_TOKEN_EXPIRED',
    });
  }

  await withTransaction(async (conn) => {
    await conn.execute(
      "UPDATE users SET email_verified = 1, updated_at = datetime('now') WHERE id = ?",
      [row.user_id],
    );
    await conn.execute('UPDATE email_verifications SET used = 1 WHERE id = ?', [row.id]);
  });

  return { userId: row.user_id };
}
