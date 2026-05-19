-- =============================================================================
-- GymBit — Initial Schema Migration (MySQL)
-- Design section 4.1
-- Notes:
--   • UUIDs stored as CHAR(36) — generated in application layer via `uuid` package
--   • JSONB → JSON
--   • TEXT[] (arrays) → JSON (stored as JSON array string)
--   • TIMESTAMPTZ → DATETIME (UTC enforced via pool timezone:'Z')
--   • SERIAL → INT AUTO_INCREMENT
--   • PostgreSQL CHECK constraints on ENUMs replaced with ENUM type or CHECK
--   • Full-text search on foods.name via FULLTEXT index
-- =============================================================================

-- =============================================================================
-- USERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id             CHAR(36)     NOT NULL PRIMARY KEY,
    email          VARCHAR(320) NOT NULL UNIQUE,
    auth0_id       VARCHAR(255) NOT NULL UNIQUE,
    name           VARCHAR(255) NOT NULL,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active      TINYINT(1)   NOT NULL DEFAULT 1,
    email_verified TINYINT(1)   NOT NULL DEFAULT 0
);

CREATE INDEX idx_users_email    ON users (email);
CREATE INDEX idx_users_auth0_id ON users (auth0_id);

-- =============================================================================
-- PROFILES
-- =============================================================================
CREATE TABLE IF NOT EXISTS profiles (
    id                 CHAR(36)       NOT NULL PRIMARY KEY,
    user_id            CHAR(36)       NOT NULL UNIQUE,
    birth_date         DATE           NOT NULL,
    gender             ENUM('MALE','FEMALE','OTHER') NOT NULL,
    height_cm          DECIMAL(5,2)   NOT NULL CHECK (height_cm BETWEEN 100 AND 250),
    weight_kg          DECIMAL(5,2)   NOT NULL CHECK (weight_kg BETWEEN 30 AND 300),
    goal               ENUM('LOSE_WEIGHT','GAIN_MUSCLE','GAIN_WEIGHT','MAINTENANCE','ENDURANCE') NOT NULL,
    experience_level   ENUM('BEGINNER','INTERMEDIATE','ADVANCED') NOT NULL,
    available_days     TINYINT        NOT NULL CHECK (available_days BETWEEN 1 AND 7),
    medical_conditions TEXT,
    bmi                DECIMAL(5,2),
    bmr                DECIMAL(7,2),
    tdee               DECIMAL(7,2),
    updated_at         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_profiles_user_id ON profiles (user_id);

-- =============================================================================
-- WEIGHT_HISTORY
-- =============================================================================
CREATE TABLE IF NOT EXISTS weight_history (
    id          CHAR(36)     NOT NULL PRIMARY KEY,
    user_id     CHAR(36)     NOT NULL,
    weight_kg   DECIMAL(5,2) NOT NULL CHECK (weight_kg BETWEEN 30 AND 300),
    recorded_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_weight_history_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_weight_history_user_id     ON weight_history (user_id);
CREATE INDEX idx_weight_history_recorded_at ON weight_history (recorded_at DESC);

-- =============================================================================
-- EXERCISES
-- =============================================================================
CREATE TABLE IF NOT EXISTS exercises (
    id             CHAR(36)     NOT NULL PRIMARY KEY,
    name           VARCHAR(255) NOT NULL,
    muscle_groups  JSON         NOT NULL,
    equipment_type ENUM('BARBELL','DUMBBELL','MACHINE','CABLE','BODYWEIGHT','OTHER') NOT NULL,
    category       VARCHAR(100) NOT NULL,
    gif_url        TEXT,
    video_url      TEXT,
    is_compound    TINYINT(1)   NOT NULL DEFAULT 0
);

CREATE INDEX idx_exercises_equipment ON exercises (equipment_type);
CREATE INDEX idx_exercises_category  ON exercises (category);

-- =============================================================================
-- WORKOUT_PLANS
-- =============================================================================
CREATE TABLE IF NOT EXISTS workout_plans (
    id           CHAR(36)   NOT NULL PRIMARY KEY,
    user_id      CHAR(36)   NOT NULL,
    plan_type    ENUM('FULL_BODY','PPL','UPPER_LOWER','CARDIO') NOT NULL,
    is_active    TINYINT(1) NOT NULL DEFAULT 1,
    generated_at DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    config       JSON       NOT NULL,
    CONSTRAINT fk_workout_plans_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_workout_plans_user_id   ON workout_plans (user_id);
CREATE INDEX idx_workout_plans_is_active ON workout_plans (user_id, is_active);

-- =============================================================================
-- WORKOUT_DAYS
-- =============================================================================
CREATE TABLE IF NOT EXISTS workout_days (
    id          CHAR(36)     NOT NULL PRIMARY KEY,
    plan_id     CHAR(36)     NOT NULL,
    day_of_week TINYINT      NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    focus       VARCHAR(100) NOT NULL,
    CONSTRAINT fk_workout_days_plan FOREIGN KEY (plan_id) REFERENCES workout_plans (id) ON DELETE CASCADE
);

CREATE INDEX idx_workout_days_plan_id ON workout_days (plan_id);

-- =============================================================================
-- PLAN_EXERCISES
-- =============================================================================
CREATE TABLE IF NOT EXISTS plan_exercises (
    id                CHAR(36)     NOT NULL PRIMARY KEY,
    day_id            CHAR(36)     NOT NULL,
    exercise_id       CHAR(36)     NOT NULL,
    sets              TINYINT      NOT NULL CHECK (sets > 0),
    reps_target       TINYINT      NOT NULL CHECK (reps_target > 0),
    rest_seconds      SMALLINT     NOT NULL CHECK (rest_seconds >= 0),
    order_index       TINYINT      NOT NULL,
    superset_group_id CHAR(36),
    weight_kg         DECIMAL(6,2) NOT NULL DEFAULT 0,
    CONSTRAINT fk_plan_exercises_day      FOREIGN KEY (day_id)      REFERENCES workout_days (id) ON DELETE CASCADE,
    CONSTRAINT fk_plan_exercises_exercise FOREIGN KEY (exercise_id) REFERENCES exercises (id)
);

CREATE INDEX idx_plan_exercises_day_id ON plan_exercises (day_id);

-- =============================================================================
-- SESSIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id               CHAR(36)   NOT NULL PRIMARY KEY,
    user_id          CHAR(36)   NOT NULL,
    plan_id          CHAR(36),
    started_at       DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at     DATETIME,
    total_volume_kg  INT        NOT NULL DEFAULT 0,
    duration_seconds INT        NOT NULL DEFAULT 0,
    is_active        TINYINT(1) NOT NULL DEFAULT 1,
    offline_state    JSON,
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_sessions_plan FOREIGN KEY (plan_id) REFERENCES workout_plans (id)
);

CREATE INDEX idx_sessions_user_id    ON sessions (user_id);
CREATE INDEX idx_sessions_started_at ON sessions (started_at DESC);
CREATE INDEX idx_sessions_is_active  ON sessions (user_id, is_active);

-- =============================================================================
-- SERIE_LOGS
-- =============================================================================
CREATE TABLE IF NOT EXISTS serie_logs (
    id          CHAR(36)     NOT NULL PRIMARY KEY,
    session_id  CHAR(36)     NOT NULL,
    exercise_id CHAR(36)     NOT NULL,
    set_number  TINYINT      NOT NULL CHECK (set_number > 0),
    weight_kg   DECIMAL(6,2) NOT NULL DEFAULT 0,
    reps_done   TINYINT      NOT NULL CHECK (reps_done >= 0),
    logged_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_pr       TINYINT(1)   NOT NULL DEFAULT 0,
    CONSTRAINT fk_serie_logs_session  FOREIGN KEY (session_id)  REFERENCES sessions (id) ON DELETE CASCADE,
    CONSTRAINT fk_serie_logs_exercise FOREIGN KEY (exercise_id) REFERENCES exercises (id)
);

CREATE INDEX idx_serie_logs_session_id  ON serie_logs (session_id);
CREATE INDEX idx_serie_logs_exercise_id ON serie_logs (exercise_id);

-- =============================================================================
-- PERSONAL_RECORDS
-- =============================================================================
CREATE TABLE IF NOT EXISTS personal_records (
    id          CHAR(36)     NOT NULL PRIMARY KEY,
    user_id     CHAR(36)     NOT NULL,
    exercise_id CHAR(36)     NOT NULL,
    weight_kg   DECIMAL(6,2) NOT NULL,
    reps        TINYINT      NOT NULL,
    achieved_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_pr_user_exercise (user_id, exercise_id),
    CONSTRAINT fk_personal_records_user     FOREIGN KEY (user_id)     REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_personal_records_exercise FOREIGN KEY (exercise_id) REFERENCES exercises (id)
);

CREATE INDEX idx_personal_records_user_id     ON personal_records (user_id);
CREATE INDEX idx_personal_records_exercise_id ON personal_records (exercise_id);

-- =============================================================================
-- FOODS
-- =============================================================================
CREATE TABLE IF NOT EXISTS foods (
    id                CHAR(36)     NOT NULL PRIMARY KEY,
    usda_id           VARCHAR(50)  UNIQUE,
    barcode           VARCHAR(50),
    name              VARCHAR(500) NOT NULL,
    calories_per_100g DECIMAL(7,2) NOT NULL CHECK (calories_per_100g >= 0),
    protein_per_100g  DECIMAL(6,2) NOT NULL CHECK (protein_per_100g >= 0),
    carbs_per_100g    DECIMAL(6,2) NOT NULL CHECK (carbs_per_100g >= 0),
    fat_per_100g      DECIMAL(6,2) NOT NULL CHECK (fat_per_100g >= 0),
    source            VARCHAR(50)  NOT NULL DEFAULT 'USDA',
    FULLTEXT KEY ft_foods_name (name)
);

CREATE INDEX idx_foods_usda_id ON foods (usda_id);
CREATE INDEX idx_foods_barcode ON foods (barcode);

-- =============================================================================
-- RECIPES
-- =============================================================================
CREATE TABLE IF NOT EXISTS recipes (
    id             CHAR(36)     NOT NULL PRIMARY KEY,
    user_id        CHAR(36)     NOT NULL,
    name           VARCHAR(255) NOT NULL,
    total_calories DECIMAL(8,2) NOT NULL DEFAULT 0,
    total_protein  DECIMAL(7,2) NOT NULL DEFAULT 0,
    total_carbs    DECIMAL(7,2) NOT NULL DEFAULT 0,
    total_fat      DECIMAL(7,2) NOT NULL DEFAULT 0,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_recipes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_recipes_user_id ON recipes (user_id);

-- =============================================================================
-- RECIPE_INGREDIENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id         CHAR(36)     NOT NULL PRIMARY KEY,
    recipe_id  CHAR(36)     NOT NULL,
    food_id    CHAR(36)     NOT NULL,
    quantity_g DECIMAL(7,2) NOT NULL CHECK (quantity_g > 0),
    CONSTRAINT fk_recipe_ingredients_recipe FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE,
    CONSTRAINT fk_recipe_ingredients_food   FOREIGN KEY (food_id)   REFERENCES foods (id)
);

CREATE INDEX idx_recipe_ingredients_recipe_id ON recipe_ingredients (recipe_id);

-- =============================================================================
-- DAILY_RECORDS
-- =============================================================================
CREATE TABLE IF NOT EXISTS daily_records (
    id             CHAR(36)     NOT NULL PRIMARY KEY,
    user_id        CHAR(36)     NOT NULL,
    record_date    DATE         NOT NULL,
    total_calories DECIMAL(8,2) NOT NULL DEFAULT 0,
    total_protein  DECIMAL(7,2) NOT NULL DEFAULT 0,
    total_carbs    DECIMAL(7,2) NOT NULL DEFAULT 0,
    total_fat      DECIMAL(7,2) NOT NULL DEFAULT 0,
    calorie_goal   INT          NOT NULL DEFAULT 0,
    UNIQUE KEY uq_daily_records_user_date (user_id, record_date),
    CONSTRAINT fk_daily_records_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_daily_records_user_id     ON daily_records (user_id);
CREATE INDEX idx_daily_records_record_date ON daily_records (record_date DESC);

-- =============================================================================
-- MEALS
-- =============================================================================
CREATE TABLE IF NOT EXISTS meals (
    id              CHAR(36)  NOT NULL PRIMARY KEY,
    daily_record_id CHAR(36)  NOT NULL,
    meal_type       ENUM('BREAKFAST','LUNCH','DINNER','SNACK') NOT NULL,
    logged_at       DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_meals_daily_record FOREIGN KEY (daily_record_id) REFERENCES daily_records (id) ON DELETE CASCADE
);

CREATE INDEX idx_meals_daily_record_id ON meals (daily_record_id);

-- =============================================================================
-- FOOD_LOGS
-- =============================================================================
CREATE TABLE IF NOT EXISTS food_logs (
    id         CHAR(36)     NOT NULL PRIMARY KEY,
    meal_id    CHAR(36)     NOT NULL,
    food_id    CHAR(36)     NOT NULL,
    quantity_g DECIMAL(7,2) NOT NULL CHECK (quantity_g > 0),
    calories   DECIMAL(8,2) NOT NULL DEFAULT 0,
    protein    DECIMAL(7,2) NOT NULL DEFAULT 0,
    carbs      DECIMAL(7,2) NOT NULL DEFAULT 0,
    fat        DECIMAL(7,2) NOT NULL DEFAULT 0,
    CONSTRAINT fk_food_logs_meal FOREIGN KEY (meal_id) REFERENCES meals (id) ON DELETE CASCADE,
    CONSTRAINT fk_food_logs_food FOREIGN KEY (food_id) REFERENCES foods (id)
);

CREATE INDEX idx_food_logs_meal_id ON food_logs (meal_id);

-- =============================================================================
-- NUTRITION_PLANS
-- =============================================================================
CREATE TABLE IF NOT EXISTS nutrition_plans (
    id             CHAR(36)     NOT NULL PRIMARY KEY,
    user_id        CHAR(36)     NOT NULL,
    calorie_goal   INT          NOT NULL CHECK (calorie_goal > 0),
    protein_goal_g DECIMAL(7,2) NOT NULL CHECK (protein_goal_g >= 0),
    carbs_goal_g   DECIMAL(7,2) NOT NULL CHECK (carbs_goal_g >= 0),
    fat_goal_g     DECIMAL(7,2) NOT NULL CHECK (fat_goal_g >= 0),
    is_active      TINYINT(1)   NOT NULL DEFAULT 1,
    generated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_nutrition_plans_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_nutrition_plans_user_id   ON nutrition_plans (user_id);
CREATE INDEX idx_nutrition_plans_is_active ON nutrition_plans (user_id, is_active);

-- =============================================================================
-- SLEEP_RECORDS
-- =============================================================================
CREATE TABLE IF NOT EXISTS sleep_records (
    id               CHAR(36)   NOT NULL PRIMARY KEY,
    user_id          CHAR(36)   NOT NULL,
    sleep_start      DATETIME   NOT NULL,
    sleep_end        DATETIME   NOT NULL,
    duration_minutes INT        NOT NULL CHECK (duration_minutes > 0),
    quality_stars    TINYINT    NOT NULL CHECK (quality_stars BETWEEN 1 AND 5),
    phases           JSON,
    source           VARCHAR(50) NOT NULL DEFAULT 'MANUAL',
    recorded_at      DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_sleep_end_after_start CHECK (sleep_end > sleep_start),
    CONSTRAINT fk_sleep_records_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_sleep_records_user_id     ON sleep_records (user_id);
CREATE INDEX idx_sleep_records_sleep_start ON sleep_records (sleep_start DESC);

-- =============================================================================
-- WEARABLE_CONNECTIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS wearable_connections (
    id                CHAR(36)   NOT NULL PRIMARY KEY,
    user_id           CHAR(36)   NOT NULL,
    provider          ENUM('APPLE_WATCH','GARMIN','WEAR_OS') NOT NULL,
    access_token_enc  TEXT       NOT NULL,
    refresh_token_enc TEXT       NOT NULL,
    token_expires_at  DATETIME   NOT NULL,
    last_sync_at      DATETIME,
    is_active         TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY uq_wearable_connections_user_provider (user_id, provider),
    CONSTRAINT fk_wearable_connections_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_wearable_connections_user_id ON wearable_connections (user_id);

-- =============================================================================
-- WEARABLE_DATA
-- =============================================================================
CREATE TABLE IF NOT EXISTS wearable_data (
    id              CHAR(36)     NOT NULL PRIMARY KEY,
    user_id         CHAR(36)     NOT NULL,
    provider        ENUM('APPLE_WATCH','GARMIN','WEAR_OS') NOT NULL,
    data_date       DATE         NOT NULL,
    steps           INT,
    calories_burned DECIMAL(7,2),
    avg_heart_rate  SMALLINT,
    vo2max          DECIMAL(5,2),
    stress_level    TINYINT,
    raw_data        JSON,
    UNIQUE KEY uq_wearable_data_user_provider_date (user_id, provider, data_date),
    CONSTRAINT fk_wearable_data_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_wearable_data_user_id   ON wearable_data (user_id);
CREATE INDEX idx_wearable_data_data_date ON wearable_data (data_date DESC);

-- =============================================================================
-- NOTIFICATION_SETTINGS
-- =============================================================================
CREATE TABLE IF NOT EXISTS notification_settings (
    id                CHAR(36)     NOT NULL PRIMARY KEY,
    user_id           CHAR(36)     NOT NULL,
    notification_type VARCHAR(100) NOT NULL,
    is_enabled        TINYINT(1)   NOT NULL DEFAULT 1,
    scheduled_time    TIME,
    config            JSON,
    UNIQUE KEY uq_notification_settings_user_type (user_id, notification_type),
    CONSTRAINT fk_notification_settings_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_notification_settings_user_id ON notification_settings (user_id);

-- =============================================================================
-- OFFLINE_QUEUE
-- =============================================================================
CREATE TABLE IF NOT EXISTS offline_queue (
    id               CHAR(36)     NOT NULL PRIMARY KEY,
    user_id          CHAR(36)     NOT NULL,
    operation        ENUM('CREATE','UPDATE','DELETE') NOT NULL,
    entity_type      ENUM('session','serie_log','food_log','sleep_record','weight') NOT NULL,
    entity_id        CHAR(36)     NOT NULL,
    payload          JSON         NOT NULL,
    client_timestamp BIGINT       NOT NULL,
    is_processed     TINYINT(1)   NOT NULL DEFAULT 0,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_offline_queue_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_offline_queue_user_id      ON offline_queue (user_id);
CREATE INDEX idx_offline_queue_is_processed ON offline_queue (user_id, is_processed);
CREATE INDEX idx_offline_queue_timestamp    ON offline_queue (client_timestamp);
