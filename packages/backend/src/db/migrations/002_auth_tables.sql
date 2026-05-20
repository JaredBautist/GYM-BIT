-- =============================================================================
-- GymBit — Auth tables migration
-- Adds:
--   • password_hash column to users (for local accounts)
--   • refresh_tokens table (rotating refresh tokens, stored hashed)
--   • email_verifications table
--   • password_resets table
-- Requirements: 1.2, 1.3, 1.5, 1.9, 13.6
-- =============================================================================

-- Add password_hash to users (nullable — OAuth-only users have no local password)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL AFTER name;

-- =============================================================================
-- REFRESH_TOKENS
-- Stores SHA-256 hashes of rotating refresh tokens (30-day expiry).
-- =============================================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          CHAR(36)   NOT NULL PRIMARY KEY,
    user_id     CHAR(36)   NOT NULL,
    token_hash  CHAR(64)   NOT NULL UNIQUE,   -- SHA-256 hex
    expires_at  DATETIME   NOT NULL,
    revoked     TINYINT(1) NOT NULL DEFAULT 0,
    created_at  DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_refresh_tokens_user_id    ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);

-- =============================================================================
-- EMAIL_VERIFICATIONS
-- One-time tokens for verifying email addresses.
-- =============================================================================
CREATE TABLE IF NOT EXISTS email_verifications (
    id          CHAR(36)   NOT NULL PRIMARY KEY,
    user_id     CHAR(36)   NOT NULL,
    token_hash  CHAR(64)   NOT NULL UNIQUE,   -- SHA-256 hex
    expires_at  DATETIME   NOT NULL,
    used        TINYINT(1) NOT NULL DEFAULT 0,
    created_at  DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_email_verifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_email_verifications_user_id    ON email_verifications (user_id);
CREATE INDEX idx_email_verifications_token_hash ON email_verifications (token_hash);

-- =============================================================================
-- PASSWORD_RESETS
-- One-time tokens for resetting passwords (valid 30 minutes).
-- =============================================================================
CREATE TABLE IF NOT EXISTS password_resets (
    id          CHAR(36)   NOT NULL PRIMARY KEY,
    user_id     CHAR(36)   NOT NULL,
    token_hash  CHAR(64)   NOT NULL UNIQUE,   -- SHA-256 hex
    expires_at  DATETIME   NOT NULL,
    used        TINYINT(1) NOT NULL DEFAULT 0,
    created_at  DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_password_resets_user_id    ON password_resets (user_id);
CREATE INDEX idx_password_resets_token_hash ON password_resets (token_hash);
