-- =============================================================================
-- GymBit — Initial Schema Migration
-- Design section 4.1
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- USERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT        NOT NULL UNIQUE,
    auth0_id        TEXT        NOT NULL UNIQUE,
    name            TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    email_verified  BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_auth0_id ON users (auth0_id);

-- =============================================================================
-- PROFILES
-- =============================================================================
CREATE TABLE IF NOT EXISTS profiles (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    birth_date          DATE        NOT NULL,
    gender              TEXT        NOT NULL CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
    height_cm           NUMERIC(5,2) NOT NULL CHECK (height_cm BETWEEN 100 AND 250),
    weight_kg           NUMERIC(5,2) NOT NULL CHECK (weight_kg BETWEEN 30 AND 300),
    goal                TEXT        NOT NULL CHECK (goal IN ('LOSE_WEIGHT','GAIN_MUSCLE','GAIN_WEIGHT','MAINTENANCE','ENDURANCE')),
    experience_level    TEXT        NOT NULL CHECK (experience_level IN ('BEGINNER','INTERMEDIATE','ADVANCED')),
    available_days      SMALLINT    NOT NULL CHECK (available_days BETWEEN 1 AND 7),
    medical_conditions  TEXT,
    bmi                 NUMERIC(5,2),
    bmr                 NUMERIC(7,2),
    tdee                NUMERIC(7,2),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles (user_id);

-- =============================================================================
-- WEIGHT_HISTORY
-- =============================================================================
CREATE TABLE IF NOT EXISTS weight_history (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    weight_kg   NUMERIC(5,2) NOT NULL CHECK (weight_kg BETWEEN 30 AND 300),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weight_history_user_id     ON weight_history (user_id);
CREATE INDEX IF NOT EXISTS idx_weight_history_recorded_at ON weight_history (recorded_at DESC);

-- =============================================================================
-- EXERCISES
-- =============================================================================
CREATE TABLE IF NOT EXISTS exercises (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT    NOT NULL,
    muscle_groups   TEXT[]  NOT NULL DEFAULT '{}',
    equipment_type  TEXT    NOT NULL CHECK (equipment_type IN ('BARBELL','DUMBBELL','MACHINE','CABLE','BODYWEIGHT','OTHER')),
    category        TEXT    NOT NULL,
    gif_url         TEXT,
    video_url       TEXT,
    is_compound     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_exercises_equipment ON exercises (equipment_type);
CREATE INDEX IF NOT EXISTS idx_exercises_category  ON exercises (category);

-- =============================================================================
-- WORKOUT_PLANS
-- =============================================================================
CREATE TABLE IF NOT EXISTS workout_plans (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    plan_type    TEXT        NOT NULL CHECK (plan_type IN ('FULL_BODY','PPL','UPPER_LOWER','CARDIO')),
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    config       JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_workout_plans_user_id   ON workout_plans (user_id);
CREATE INDEX IF NOT EXISTS idx_workout_plans_is_active ON workout_plans (user_id, is_active);

-- =============================================================================
-- WORKOUT_DAYS
-- =============================================================================
CREATE TABLE IF NOT EXISTS workout_days (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id     UUID    NOT NULL REFERENCES workout_plans (id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    focus       TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workout_days_plan_id ON workout_days (plan_id);

-- =============================================================================
-- PLAN_EXERCISES
-- =============================================================================
CREATE TABLE IF NOT EXISTS plan_exercises (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    day_id              UUID        NOT NULL REFERENCES workout_days (id) ON DELETE CASCADE,
    exercise_id         UUID        NOT NULL REFERENCES exercises (id),
    sets                SMALLINT    NOT NULL CHECK (sets > 0),
    reps_target         SMALLINT    NOT NULL CHECK (reps_target > 0),
    rest_seconds        SMALLINT    NOT NULL CHECK (rest_seconds >= 0),
    order_index         SMALLINT    NOT NULL,
    superset_group_id   UUID,
    weight_kg           NUMERIC(6,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_plan_exercises_day_id ON plan_exercises (day_id);

-- =============================================================================
-- SESSIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    plan_id          UUID        REFERENCES workout_plans (id),
    started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ,
    total_volume_kg  INTEGER     NOT NULL DEFAULT 0,
    duration_seconds INTEGER     NOT NULL DEFAULT 0,
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    offline_state    JSONB
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_is_active  ON sessions (user_id, is_active);

-- =============================================================================
-- SERIE_LOGS
-- =============================================================================
CREATE TABLE IF NOT EXISTS serie_logs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID        NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    exercise_id UUID        NOT NULL REFERENCES exercises (id),
    set_number  SMALLINT    NOT NULL CHECK (set_number > 0),
    weight_kg   NUMERIC(6,2) NOT NULL DEFAULT 0,
    reps_done   SMALLINT    NOT NULL CHECK (reps_done >= 0),
    logged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_pr       BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_serie_logs_session_id  ON serie_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_serie_logs_exercise_id ON serie_logs (exercise_id);

-- =============================================================================
-- PERSONAL_RECORDS
-- =============================================================================
CREATE TABLE IF NOT EXISTS personal_records (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    exercise_id UUID        NOT NULL REFERENCES exercises (id),
    weight_kg   NUMERIC(6,2) NOT NULL,
    reps        SMALLINT    NOT NULL,
    achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS idx_personal_records_user_id     ON personal_records (user_id);
CREATE INDEX IF NOT EXISTS idx_personal_records_exercise_id ON personal_records (exercise_id);

-- =============================================================================
-- FOODS
-- =============================================================================
CREATE TABLE IF NOT EXISTS foods (
    id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    usda_id             TEXT    UNIQUE,
    barcode             TEXT,
    name                TEXT    NOT NULL,
    calories_per_100g   NUMERIC(7,2) NOT NULL CHECK (calories_per_100g >= 0),
    protein_per_100g    NUMERIC(6,2) NOT NULL CHECK (protein_per_100g >= 0),
    carbs_per_100g      NUMERIC(6,2) NOT NULL CHECK (carbs_per_100g >= 0),
    fat_per_100g        NUMERIC(6,2) NOT NULL CHECK (fat_per_100g >= 0),
    source              TEXT    NOT NULL DEFAULT 'USDA'
);

CREATE INDEX IF NOT EXISTS idx_foods_usda_id ON foods (usda_id);
CREATE INDEX IF NOT EXISTS idx_foods_barcode ON foods (barcode);
CREATE INDEX IF NOT EXISTS idx_foods_name    ON foods USING gin (to_tsvector('english', name));

-- =============================================================================
-- RECIPES
-- =============================================================================
CREATE TABLE IF NOT EXISTS recipes (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    total_calories  NUMERIC(8,2) NOT NULL DEFAULT 0,
    total_protein   NUMERIC(7,2) NOT NULL DEFAULT 0,
    total_carbs     NUMERIC(7,2) NOT NULL DEFAULT 0,
    total_fat       NUMERIC(7,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON recipes (user_id);

-- =============================================================================
-- RECIPE_INGREDIENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id   UUID        NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
    food_id     UUID        NOT NULL REFERENCES foods (id),
    quantity_g  NUMERIC(7,2) NOT NULL CHECK (quantity_g > 0)
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients (recipe_id);

-- =============================================================================
-- DAILY_RECORDS
-- =============================================================================
CREATE TABLE IF NOT EXISTS daily_records (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    record_date     DATE    NOT NULL,
    total_calories  NUMERIC(8,2) NOT NULL DEFAULT 0,
    total_protein   NUMERIC(7,2) NOT NULL DEFAULT 0,
    total_carbs     NUMERIC(7,2) NOT NULL DEFAULT 0,
    total_fat       NUMERIC(7,2) NOT NULL DEFAULT 0,
    calorie_goal    INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, record_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_records_user_id     ON daily_records (user_id);
CREATE INDEX IF NOT EXISTS idx_daily_records_record_date ON daily_records (record_date DESC);

-- =============================================================================
-- MEALS
-- =============================================================================
CREATE TABLE IF NOT EXISTS meals (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    daily_record_id  UUID        NOT NULL REFERENCES daily_records (id) ON DELETE CASCADE,
    meal_type        TEXT        NOT NULL CHECK (meal_type IN ('BREAKFAST','LUNCH','DINNER','SNACK')),
    logged_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meals_daily_record_id ON meals (daily_record_id);

-- =============================================================================
-- FOOD_LOGS
-- =============================================================================
CREATE TABLE IF NOT EXISTS food_logs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_id     UUID        NOT NULL REFERENCES meals (id) ON DELETE CASCADE,
    food_id     UUID        NOT NULL REFERENCES foods (id),
    quantity_g  NUMERIC(7,2) NOT NULL CHECK (quantity_g > 0),
    calories    NUMERIC(8,2) NOT NULL DEFAULT 0,
    protein     NUMERIC(7,2) NOT NULL DEFAULT 0,
    carbs       NUMERIC(7,2) NOT NULL DEFAULT 0,
    fat         NUMERIC(7,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_food_logs_meal_id ON food_logs (meal_id);

-- =============================================================================
-- NUTRITION_PLANS
-- =============================================================================
CREATE TABLE IF NOT EXISTS nutrition_plans (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    calorie_goal     INTEGER     NOT NULL CHECK (calorie_goal > 0),
    protein_goal_g   NUMERIC(7,2) NOT NULL CHECK (protein_goal_g >= 0),
    carbs_goal_g     NUMERIC(7,2) NOT NULL CHECK (carbs_goal_g >= 0),
    fat_goal_g       NUMERIC(7,2) NOT NULL CHECK (fat_goal_g >= 0),
    is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
    generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_plans_user_id   ON nutrition_plans (user_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_plans_is_active ON nutrition_plans (user_id, is_active);

-- =============================================================================
-- SLEEP_RECORDS
-- =============================================================================
CREATE TABLE IF NOT EXISTS sleep_records (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    sleep_start      TIMESTAMPTZ NOT NULL,
    sleep_end        TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER     NOT NULL CHECK (duration_minutes > 0),
    quality_stars    SMALLINT    NOT NULL CHECK (quality_stars BETWEEN 1 AND 5),
    phases           JSONB,
    source           TEXT        NOT NULL DEFAULT 'MANUAL',
    recorded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (sleep_end > sleep_start)
);

CREATE INDEX IF NOT EXISTS idx_sleep_records_user_id    ON sleep_records (user_id);
CREATE INDEX IF NOT EXISTS idx_sleep_records_sleep_start ON sleep_records (sleep_start DESC);

-- =============================================================================
-- WEARABLE_CONNECTIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS wearable_connections (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider            TEXT        NOT NULL CHECK (provider IN ('APPLE_WATCH','GARMIN','WEAR_OS')),
    access_token_enc    TEXT        NOT NULL,
    refresh_token_enc   TEXT        NOT NULL,
    token_expires_at    TIMESTAMPTZ NOT NULL,
    last_sync_at        TIMESTAMPTZ,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_wearable_connections_user_id ON wearable_connections (user_id);

-- =============================================================================
-- WEARABLE_DATA
-- =============================================================================
CREATE TABLE IF NOT EXISTS wearable_data (
    id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider         TEXT    NOT NULL CHECK (provider IN ('APPLE_WATCH','GARMIN','WEAR_OS')),
    data_date        DATE    NOT NULL,
    steps            INTEGER,
    calories_burned  NUMERIC(7,2),
    avg_heart_rate   SMALLINT,
    vo2max           NUMERIC(5,2),
    stress_level     SMALLINT,
    raw_data         JSONB,
    UNIQUE (user_id, provider, data_date)
);

CREATE INDEX IF NOT EXISTS idx_wearable_data_user_id   ON wearable_data (user_id);
CREATE INDEX IF NOT EXISTS idx_wearable_data_data_date ON wearable_data (data_date DESC);

-- =============================================================================
-- NOTIFICATION_SETTINGS
-- =============================================================================
CREATE TABLE IF NOT EXISTS notification_settings (
    id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    notification_type   TEXT    NOT NULL,
    is_enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    scheduled_time      TIME,
    config              JSONB,
    UNIQUE (user_id, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON notification_settings (user_id);

-- =============================================================================
-- OFFLINE_QUEUE
-- =============================================================================
CREATE TABLE IF NOT EXISTS offline_queue (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    operation        TEXT        NOT NULL CHECK (operation IN ('CREATE','UPDATE','DELETE')),
    entity_type      TEXT        NOT NULL CHECK (entity_type IN ('session','serie_log','food_log','sleep_record','weight')),
    entity_id        UUID        NOT NULL,
    payload          JSONB       NOT NULL,
    client_timestamp BIGINT      NOT NULL,  -- Unix ms
    is_processed     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offline_queue_user_id      ON offline_queue (user_id);
CREATE INDEX IF NOT EXISTS idx_offline_queue_is_processed ON offline_queue (user_id, is_processed);
CREATE INDEX IF NOT EXISTS idx_offline_queue_timestamp    ON offline_queue (client_timestamp);
