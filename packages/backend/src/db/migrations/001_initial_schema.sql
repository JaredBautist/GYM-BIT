CREATE TABLE IF NOT EXISTS users (
    id             TEXT NOT NULL PRIMARY KEY,
    email          TEXT NOT NULL UNIQUE,
    auth0_id       TEXT NOT NULL UNIQUE,
    name           TEXT NOT NULL,
    password_hash  TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    is_active      INTEGER NOT NULL DEFAULT 1,
    email_verified INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_auth0_id ON users (auth0_id);

CREATE TABLE IF NOT EXISTS profiles (
    id                 TEXT NOT NULL PRIMARY KEY,
    user_id            TEXT NOT NULL UNIQUE,
    birth_date         TEXT NOT NULL,
    gender             TEXT NOT NULL CHECK (gender IN ('MALE','FEMALE','OTHER','male','female')),
    height_cm          REAL NOT NULL CHECK (height_cm BETWEEN 100 AND 250),
    weight_kg          REAL NOT NULL CHECK (weight_kg BETWEEN 30 AND 300),
    goal               TEXT NOT NULL CHECK (goal IN ('LOSE_WEIGHT','GAIN_MUSCLE','GAIN_WEIGHT','MAINTENANCE','ENDURANCE')),
    experience_level   TEXT NOT NULL CHECK (experience_level IN ('BEGINNER','INTERMEDIATE','ADVANCED')),
    available_days     INTEGER NOT NULL CHECK (available_days BETWEEN 1 AND 7),
    medical_conditions TEXT,
    bmi                REAL,
    bmr                REAL,
    tdee               REAL,
    updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles (user_id);

CREATE TABLE IF NOT EXISTS weight_history (
    id          TEXT NOT NULL PRIMARY KEY,
    user_id     TEXT NOT NULL,
    weight_kg   REAL NOT NULL CHECK (weight_kg BETWEEN 30 AND 300),
    recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_weight_history_user_id ON weight_history (user_id);
CREATE INDEX IF NOT EXISTS idx_weight_history_recorded_at ON weight_history (recorded_at DESC);

CREATE TABLE IF NOT EXISTS exercises (
    id             TEXT NOT NULL PRIMARY KEY,
    name           TEXT NOT NULL,
    muscle_groups  TEXT NOT NULL,
    equipment_type TEXT NOT NULL CHECK (equipment_type IN ('BARBELL','DUMBBELL','MACHINE','CABLE','BODYWEIGHT','OTHER')),
    category       TEXT NOT NULL,
    gif_url        TEXT,
    video_url      TEXT,
    is_compound    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_exercises_equipment ON exercises (equipment_type);
CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises (category);

CREATE TABLE IF NOT EXISTS workout_plans (
    id           TEXT NOT NULL PRIMARY KEY,
    user_id      TEXT NOT NULL,
    plan_type    TEXT NOT NULL CHECK (plan_type IN ('FULL_BODY','PPL','UPPER_LOWER','CARDIO')),
    is_active    INTEGER NOT NULL DEFAULT 1,
    generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    config       TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workout_plans_user_id ON workout_plans (user_id);
CREATE INDEX IF NOT EXISTS idx_workout_plans_is_active ON workout_plans (user_id, is_active);

CREATE TABLE IF NOT EXISTS workout_days (
    id          TEXT NOT NULL PRIMARY KEY,
    plan_id     TEXT NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    focus       TEXT NOT NULL,
    FOREIGN KEY (plan_id) REFERENCES workout_plans (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workout_days_plan_id ON workout_days (plan_id);

CREATE TABLE IF NOT EXISTS plan_exercises (
    id                TEXT NOT NULL PRIMARY KEY,
    day_id            TEXT NOT NULL,
    exercise_id       TEXT NOT NULL,
    sets              INTEGER NOT NULL CHECK (sets > 0),
    reps_target       INTEGER NOT NULL CHECK (reps_target > 0),
    rest_seconds      INTEGER NOT NULL CHECK (rest_seconds >= 0),
    order_index       INTEGER NOT NULL,
    superset_group_id TEXT,
    weight_kg         REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (day_id) REFERENCES workout_days (id) ON DELETE CASCADE,
    FOREIGN KEY (exercise_id) REFERENCES exercises (id)
);

CREATE INDEX IF NOT EXISTS idx_plan_exercises_day_id ON plan_exercises (day_id);

CREATE TABLE IF NOT EXISTS sessions (
    id               TEXT NOT NULL PRIMARY KEY,
    user_id          TEXT NOT NULL,
    plan_id          TEXT,
    started_at       TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at     TEXT,
    total_volume_kg  INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    is_active        INTEGER NOT NULL DEFAULT 1,
    offline_state    TEXT,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES workout_plans (id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_completed_at ON sessions (completed_at DESC);

CREATE TABLE IF NOT EXISTS serie_logs (
    id          TEXT NOT NULL PRIMARY KEY,
    session_id  TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    set_number  INTEGER NOT NULL CHECK (set_number > 0),
    weight_kg   REAL NOT NULL DEFAULT 0,
    reps_done   INTEGER NOT NULL CHECK (reps_done >= 0),
    logged_at   TEXT NOT NULL DEFAULT (datetime('now')),
    is_pr       INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE,
    FOREIGN KEY (exercise_id) REFERENCES exercises (id)
);

CREATE INDEX IF NOT EXISTS idx_serie_logs_session_id ON serie_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_serie_logs_exercise_id ON serie_logs (exercise_id);

CREATE TABLE IF NOT EXISTS personal_records (
    id          TEXT NOT NULL PRIMARY KEY,
    user_id     TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    weight_kg   REAL NOT NULL,
    reps        INTEGER NOT NULL,
    achieved_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, exercise_id),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (exercise_id) REFERENCES exercises (id)
);

CREATE INDEX IF NOT EXISTS idx_personal_records_user_id ON personal_records (user_id);
CREATE INDEX IF NOT EXISTS idx_personal_records_exercise_id ON personal_records (exercise_id);

CREATE TABLE IF NOT EXISTS foods (
    id                TEXT NOT NULL PRIMARY KEY,
    usda_id           TEXT UNIQUE,
    barcode           TEXT,
    name              TEXT NOT NULL,
    calories_per_100g REAL NOT NULL CHECK (calories_per_100g >= 0),
    protein_per_100g  REAL NOT NULL CHECK (protein_per_100g >= 0),
    carbs_per_100g    REAL NOT NULL CHECK (carbs_per_100g >= 0),
    fat_per_100g      REAL NOT NULL CHECK (fat_per_100g >= 0),
    source            TEXT NOT NULL DEFAULT 'USDA'
);

CREATE INDEX IF NOT EXISTS idx_foods_usda_id ON foods (usda_id);
CREATE INDEX IF NOT EXISTS idx_foods_barcode ON foods (barcode);

CREATE TABLE IF NOT EXISTS recipes (
    id             TEXT NOT NULL PRIMARY KEY,
    user_id        TEXT NOT NULL,
    name           TEXT NOT NULL,
    total_calories REAL NOT NULL DEFAULT 0,
    total_protein  REAL NOT NULL DEFAULT 0,
    total_carbs    REAL NOT NULL DEFAULT 0,
    total_fat      REAL NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON recipes (user_id);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id         TEXT NOT NULL PRIMARY KEY,
    recipe_id  TEXT NOT NULL,
    food_id    TEXT NOT NULL,
    quantity_g REAL NOT NULL CHECK (quantity_g > 0),
    FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE,
    FOREIGN KEY (food_id) REFERENCES foods (id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients (recipe_id);

CREATE TABLE IF NOT EXISTS daily_records (
    id             TEXT NOT NULL PRIMARY KEY,
    user_id        TEXT NOT NULL,
    record_date    TEXT NOT NULL,
    total_calories REAL NOT NULL DEFAULT 0,
    total_protein  REAL NOT NULL DEFAULT 0,
    total_carbs    REAL NOT NULL DEFAULT 0,
    total_fat      REAL NOT NULL DEFAULT 0,
    calorie_goal   INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, record_date),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_daily_records_user_id ON daily_records (user_id);
CREATE INDEX IF NOT EXISTS idx_daily_records_record_date ON daily_records (record_date DESC);

CREATE TABLE IF NOT EXISTS meals (
    id              TEXT NOT NULL PRIMARY KEY,
    daily_record_id TEXT NOT NULL,
    meal_type       TEXT NOT NULL CHECK (meal_type IN ('BREAKFAST','LUNCH','DINNER','SNACK')),
    logged_at       TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (daily_record_id) REFERENCES daily_records (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meals_daily_record_id ON meals (daily_record_id);

CREATE TABLE IF NOT EXISTS food_logs (
    id         TEXT NOT NULL PRIMARY KEY,
    meal_id    TEXT NOT NULL,
    food_id    TEXT NOT NULL,
    quantity_g REAL NOT NULL CHECK (quantity_g > 0),
    calories   REAL NOT NULL DEFAULT 0,
    protein    REAL NOT NULL DEFAULT 0,
    carbs      REAL NOT NULL DEFAULT 0,
    fat        REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (meal_id) REFERENCES meals (id) ON DELETE CASCADE,
    FOREIGN KEY (food_id) REFERENCES foods (id)
);

CREATE INDEX IF NOT EXISTS idx_food_logs_meal_id ON food_logs (meal_id);

CREATE TABLE IF NOT EXISTS nutrition_plans (
    id             TEXT NOT NULL PRIMARY KEY,
    user_id        TEXT NOT NULL,
    calorie_goal   INTEGER NOT NULL CHECK (calorie_goal > 0),
    protein_goal_g REAL NOT NULL CHECK (protein_goal_g >= 0),
    carbs_goal_g   REAL NOT NULL CHECK (carbs_goal_g >= 0),
    fat_goal_g     REAL NOT NULL CHECK (fat_goal_g >= 0),
    is_active      INTEGER NOT NULL DEFAULT 1,
    generated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_nutrition_plans_user_id ON nutrition_plans (user_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_plans_is_active ON nutrition_plans (user_id, is_active);

CREATE TABLE IF NOT EXISTS sleep_records (
    id               TEXT NOT NULL PRIMARY KEY,
    user_id          TEXT NOT NULL,
    sleep_start      TEXT NOT NULL,
    sleep_end        TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    quality_stars    INTEGER NOT NULL CHECK (quality_stars BETWEEN 1 AND 5),
    phases           TEXT,
    source           TEXT NOT NULL DEFAULT 'MANUAL',
    recorded_at      TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (sleep_end > sleep_start),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sleep_records_user_id ON sleep_records (user_id);
CREATE INDEX IF NOT EXISTS idx_sleep_records_sleep_start ON sleep_records (sleep_start DESC);
CREATE INDEX IF NOT EXISTS idx_sleep_records_user_start ON sleep_records (user_id, sleep_start DESC);

CREATE TABLE IF NOT EXISTS wearable_connections (
    id                  TEXT NOT NULL PRIMARY KEY,
    user_id             TEXT NOT NULL,
    provider            TEXT NOT NULL,
    access_token_enc    TEXT NOT NULL,
    refresh_token_enc   TEXT NOT NULL,
    token_expires_at    TEXT NOT NULL,
    last_sync_at        TEXT,
    is_active           INTEGER NOT NULL DEFAULT 1,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, provider),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wearable_connections_user_id ON wearable_connections (user_id);

CREATE TABLE IF NOT EXISTS wearable_data (
    id              TEXT NOT NULL PRIMARY KEY,
    user_id         TEXT NOT NULL,
    provider        TEXT NOT NULL,
    data_date       TEXT NOT NULL,
    steps           INTEGER,
    calories_burned REAL,
    avg_heart_rate  INTEGER,
    vo2max          REAL,
    stress_level    INTEGER,
    raw_data        TEXT,
    UNIQUE (user_id, provider, data_date),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wearable_data_user_id ON wearable_data (user_id);
CREATE INDEX IF NOT EXISTS idx_wearable_data_data_date ON wearable_data (data_date DESC);

CREATE TABLE IF NOT EXISTS notification_settings (
    id                TEXT NOT NULL PRIMARY KEY,
    user_id           TEXT NOT NULL,
    notification_type TEXT NOT NULL,
    is_enabled        INTEGER NOT NULL DEFAULT 1,
    scheduled_time    TEXT,
    config            TEXT,
    UNIQUE (user_id, notification_type),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON notification_settings (user_id);

CREATE TABLE IF NOT EXISTS offline_queue (
    id               TEXT NOT NULL PRIMARY KEY,
    user_id          TEXT NOT NULL,
    operation        TEXT NOT NULL CHECK (operation IN ('CREATE','UPDATE','DELETE')),
    entity_type      TEXT NOT NULL CHECK (entity_type IN ('session','serie_log','food_log','sleep_record','weight')),
    entity_id        TEXT NOT NULL,
    payload          TEXT NOT NULL,
    client_timestamp INTEGER NOT NULL,
    is_processed     INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_offline_queue_user_id ON offline_queue (user_id);
CREATE INDEX IF NOT EXISTS idx_offline_queue_is_processed ON offline_queue (user_id, is_processed);
CREATE INDEX IF NOT EXISTS idx_offline_queue_timestamp ON offline_queue (client_timestamp);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          TEXT NOT NULL PRIMARY KEY,
    user_id     TEXT NOT NULL,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TEXT NOT NULL,
    revoked     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);

CREATE TABLE IF NOT EXISTS email_verifications (
    id          TEXT NOT NULL PRIMARY KEY,
    user_id     TEXT NOT NULL,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TEXT NOT NULL,
    used        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications (user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_token_hash ON email_verifications (token_hash);

CREATE TABLE IF NOT EXISTS password_resets (
    id          TEXT NOT NULL PRIMARY KEY,
    user_id     TEXT NOT NULL,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TEXT NOT NULL,
    used        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets (user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash ON password_resets (token_hash);

CREATE TABLE IF NOT EXISTS calendar_connections (
    id               TEXT NOT NULL PRIMARY KEY,
    user_id          TEXT NOT NULL,
    provider         TEXT NOT NULL CHECK (provider IN ('google','apple')),
    access_token_enc TEXT NOT NULL,
    is_active        INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, provider),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_calendar_connections_user_id ON calendar_connections (user_id);
