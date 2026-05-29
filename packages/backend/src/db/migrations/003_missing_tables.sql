-- =============================================================================
-- GymBit — Migration 003: tablas faltantes
-- Agrega:
--   • calendar_connections  — integración Google/Apple Calendar
--   • consecutive_failures  — columna en wearable_connections para reintentos
--   • Ajuste de ENUM en wearable_connections/wearable_data (healthkit/garmin/google_fit)
-- Requirements: 10.5, 11.4
-- =============================================================================

-- =============================================================================
-- CALENDAR_CONNECTIONS
-- Almacena tokens de acceso a Google Calendar y Apple Calendar.
-- =============================================================================
CREATE TABLE IF NOT EXISTS calendar_connections (
    id               CHAR(36)   NOT NULL PRIMARY KEY,
    user_id          CHAR(36)   NOT NULL,
    provider         ENUM('google','apple') NOT NULL,
    access_token_enc TEXT       NOT NULL,
    is_active        TINYINT(1) NOT NULL DEFAULT 1,
    created_at       DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_calendar_connections_user_provider (user_id, provider),
    CONSTRAINT fk_calendar_connections_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_calendar_connections_user_id ON calendar_connections (user_id);

-- =============================================================================
-- Agregar consecutive_failures a wearable_connections
-- Necesario para la lógica de reintentos (notificar tras 3 fallos consecutivos)
-- Requirement: 10.5
-- =============================================================================
ALTER TABLE wearable_connections
    ADD COLUMN IF NOT EXISTS consecutive_failures TINYINT NOT NULL DEFAULT 0;

-- =============================================================================
-- Actualizar ENUM de provider en wearable_connections y wearable_data
-- El servicio usa 'healthkit', 'garmin', 'google_fit' (minúsculas)
-- =============================================================================
ALTER TABLE wearable_connections
    MODIFY COLUMN provider VARCHAR(50) NOT NULL;

ALTER TABLE wearable_data
    MODIFY COLUMN provider VARCHAR(50) NOT NULL;

-- =============================================================================
-- Agregar columna gender a profiles como VARCHAR para mayor flexibilidad
-- (el ENUM original era MALE/FEMALE/OTHER, el servicio usa male/female)
-- =============================================================================
ALTER TABLE profiles
    MODIFY COLUMN gender VARCHAR(20) NOT NULL;

-- =============================================================================
-- Índice adicional en sessions para el sync pull
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_sessions_completed_at ON sessions (completed_at DESC);

-- =============================================================================
-- Índice adicional en sleep_records para la lógica de reducción de intensidad
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_sleep_records_user_start
    ON sleep_records (user_id, sleep_start DESC);
