/**
 * Esquema local SQLite para operación offline.
 * Mantiene un subconjunto de las tablas del servidor para acceso sin conexión.
 *
 * Tablas locales (sección 4.3 del diseño):
 *  - users_cache          — datos de sesión y perfil
 *  - workout_plan_cache   — plan activo + ejercicios
 *  - sessions_local       — sesiones en curso o recientes
 *  - serie_logs_local     — series registradas offline
 *  - foods_cache          — base de datos USDA en caché (~50k alimentos frecuentes)
 *  - daily_records_local  — registros nutricionales del día
 *  - food_logs_local      — AlimentoLogs offline
 *  - sleep_records_local  — registros de sueño offline
 *  - offline_queue        — cola de escrituras pendientes
 *
 * Requirements: 1.8, 12.1, 12.5, 13.1
 */

/** SQL para crear todas las tablas locales */
export const CREATE_TABLES_SQL = [
  // ── users_cache ────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS users_cache (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    auth0_id TEXT,
    is_active INTEGER DEFAULT 1,
    email_verified INTEGER DEFAULT 0,
    -- Profile fields
    birth_date TEXT,
    gender TEXT,
    height_cm REAL,
    weight_kg REAL,
    goal TEXT,
    experience_level TEXT,
    available_days INTEGER,
    medical_conditions TEXT,
    bmi REAL,
    bmr REAL,
    tdee REAL,
    -- Session token (AES-256 encrypted)
    access_token_enc TEXT,
    refresh_token_enc TEXT,
    token_expires_at INTEGER,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  )`,

  // ── workout_plan_cache ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS workout_plan_cache (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_type TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    generated_at INTEGER,
    config TEXT,
    synced_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  )`,

  `CREATE TABLE IF NOT EXISTS workout_days_cache (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    focus TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS plan_exercises_cache (
    id TEXT PRIMARY KEY,
    day_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    exercise_name TEXT,
    muscle_groups TEXT,
    equipment_type TEXT,
    gif_url TEXT,
    sets INTEGER NOT NULL,
    reps_target INTEGER NOT NULL,
    rest_seconds INTEGER NOT NULL,
    order_index INTEGER NOT NULL,
    superset_group_id TEXT,
    weight_kg REAL DEFAULT 0,
    is_compound INTEGER DEFAULT 0
  )`,

  // ── sessions_local ─────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS sessions_local (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    total_volume_kg REAL,
    duration_seconds INTEGER,
    is_active INTEGER DEFAULT 1,
    offline_state TEXT,
    is_synced INTEGER DEFAULT 0
  )`,

  // ── serie_logs_local ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS serie_logs_local (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    set_number INTEGER NOT NULL,
    weight_kg REAL NOT NULL,
    reps_done INTEGER NOT NULL,
    logged_at INTEGER NOT NULL,
    is_pr INTEGER DEFAULT 0,
    is_synced INTEGER DEFAULT 0
  )`,

  // ── foods_cache ────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS foods_cache (
    id TEXT PRIMARY KEY,
    usda_id TEXT,
    barcode TEXT,
    name TEXT NOT NULL,
    calories_per_100g REAL NOT NULL,
    protein_per_100g REAL NOT NULL,
    carbs_per_100g REAL NOT NULL,
    fat_per_100g REAL NOT NULL,
    source TEXT NOT NULL DEFAULT 'USDA',
    cached_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_foods_cache_name ON foods_cache(name)`,
  `CREATE INDEX IF NOT EXISTS idx_foods_cache_barcode ON foods_cache(barcode)`,

  // ── daily_records_local ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS daily_records_local (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    record_date TEXT NOT NULL,
    total_calories REAL DEFAULT 0,
    total_protein REAL DEFAULT 0,
    total_carbs REAL DEFAULT 0,
    total_fat REAL DEFAULT 0,
    calorie_goal INTEGER DEFAULT 0,
    is_synced INTEGER DEFAULT 0,
    UNIQUE(user_id, record_date)
  )`,

  // ── food_logs_local ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS food_logs_local (
    id TEXT PRIMARY KEY,
    meal_id TEXT NOT NULL,
    food_id TEXT NOT NULL,
    quantity_g REAL NOT NULL,
    calories REAL NOT NULL,
    protein REAL NOT NULL,
    carbs REAL NOT NULL,
    fat REAL NOT NULL,
    is_synced INTEGER DEFAULT 0
  )`,

  // ── sleep_records_local ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS sleep_records_local (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    sleep_start INTEGER NOT NULL,
    sleep_end INTEGER NOT NULL,
    duration_minutes INTEGER NOT NULL,
    quality_stars INTEGER NOT NULL,
    phases TEXT,
    source TEXT NOT NULL DEFAULT 'MANUAL',
    recorded_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    is_synced INTEGER DEFAULT 0
  )`,

  // ── offline_queue ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS offline_queue (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    client_timestamp INTEGER NOT NULL,
    is_processed INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_offline_queue_user ON offline_queue(user_id, is_processed)`,
  `CREATE INDEX IF NOT EXISTS idx_offline_queue_timestamp ON offline_queue(client_timestamp)`,
] as const;
