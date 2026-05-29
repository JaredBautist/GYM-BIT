CREATE TABLE IF NOT EXISTS users (
    id             VARCHAR(36) NOT NULL PRIMARY KEY,
    email          VARCHAR(255) NOT NULL UNIQUE,
    auth0_id       VARCHAR(255) NOT NULL UNIQUE,
    name           VARCHAR(255) NOT NULL,
    password_hash  VARCHAR(255),
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active      TINYINT(1) NOT NULL DEFAULT 1,
    email_verified TINYINT(1) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_auth0_id ON users (auth0_id);

CREATE TABLE IF NOT EXISTS profiles (
    id                 VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id            VARCHAR(36) NOT NULL UNIQUE,
    birth_date         DATE NOT NULL,
    gender             VARCHAR(10) NOT NULL CHECK (gender IN ('MALE','FEMALE','OTHER','male','female')),
    height_cm          DECIMAL(5,1) NOT NULL CHECK (height_cm BETWEEN 100 AND 250),
    weight_kg          DECIMAL(5,1) NOT NULL CHECK (weight_kg BETWEEN 30 AND 300),
    goal               VARCHAR(20) NOT NULL CHECK (goal IN ('LOSE_WEIGHT','GAIN_MUSCLE','GAIN_WEIGHT','MAINTENANCE','ENDURANCE')),
    experience_level   VARCHAR(15) NOT NULL CHECK (experience_level IN ('BEGINNER','INTERMEDIATE','ADVANCED')),
    available_days     TINYINT NOT NULL CHECK (available_days BETWEEN 1 AND 7),
    medical_conditions TEXT,
    bmi                DECIMAL(4,1),
    bmr                DECIMAL(6,1),
    tdee               DECIMAL(6,1),
    updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles (user_id);

CREATE TABLE IF NOT EXISTS weight_history (
    id          VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id     VARCHAR(36) NOT NULL,
    weight_kg   DECIMAL(5,1) NOT NULL CHECK (weight_kg BETWEEN 30 AND 300),
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_weight_history_user_id ON weight_history (user_id);
CREATE INDEX IF NOT EXISTS idx_weight_history_recorded_at ON weight_history (recorded_at DESC);

CREATE TABLE IF NOT EXISTS exercises (
    id             VARCHAR(36) NOT NULL PRIMARY KEY,
    name           VARCHAR(255) NOT NULL,
    muscle_groups  JSON NOT NULL,
    equipment_type VARCHAR(15) NOT NULL CHECK (equipment_type IN ('BARBELL','DUMBBELL','MACHINE','CABLE','BODYWEIGHT','OTHER')),
    category       VARCHAR(50) NOT NULL,
    gif_url        VARCHAR(500),
    video_url      VARCHAR(500),
    is_compound    TINYINT(1) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_exercises_equipment ON exercises (equipment_type);
CREATE INDEX IF NOT EXISTS idx_exercises_category ON exercises (category);

CREATE TABLE IF NOT EXISTS workout_plans (
    id           VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id      VARCHAR(36) NOT NULL,
    plan_type    VARCHAR(15) NOT NULL CHECK (plan_type IN ('FULL_BODY','PPL','UPPER_LOWER','CARDIO')),
    is_active    TINYINT(1) NOT NULL DEFAULT 1,
    generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    config       JSON NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workout_plans_user_id ON workout_plans (user_id);
CREATE INDEX IF NOT EXISTS idx_workout_plans_is_active ON workout_plans (user_id, is_active);

CREATE TABLE IF NOT EXISTS workout_days (
    id          VARCHAR(36) NOT NULL PRIMARY KEY,
    plan_id     VARCHAR(36) NOT NULL,
    day_of_week TINYINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    focus       VARCHAR(100) NOT NULL,
    FOREIGN KEY (plan_id) REFERENCES workout_plans (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workout_days_plan_id ON workout_days (plan_id);

CREATE TABLE IF NOT EXISTS plan_exercises (
    id                VARCHAR(36) NOT NULL PRIMARY KEY,
    day_id            VARCHAR(36) NOT NULL,
    exercise_id       VARCHAR(36) NOT NULL,
    sets              TINYINT NOT NULL CHECK (sets > 0),
    reps_target       SMALLINT NOT NULL CHECK (reps_target > 0),
    rest_seconds      SMALLINT NOT NULL CHECK (rest_seconds >= 0),
    order_index       TINYINT NOT NULL,
    superset_group_id VARCHAR(36),
    weight_kg         DECIMAL(5,1) NOT NULL DEFAULT 0,
    FOREIGN KEY (day_id) REFERENCES workout_days (id) ON DELETE CASCADE,
    FOREIGN KEY (exercise_id) REFERENCES exercises (id)
);

CREATE INDEX IF NOT EXISTS idx_plan_exercises_day_id ON plan_exercises (day_id);

CREATE TABLE IF NOT EXISTS sessions (
    id               VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id          VARCHAR(36) NOT NULL,
    plan_id          VARCHAR(36),
    started_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at     TIMESTAMP NULL,
    total_volume_kg  INT NOT NULL DEFAULT 0,
    duration_seconds INT NOT NULL DEFAULT 0,
    is_active        TINYINT(1) NOT NULL DEFAULT 1,
    offline_state    JSON,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES workout_plans (id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_completed_at ON sessions (completed_at DESC);

CREATE TABLE IF NOT EXISTS serie_logs (
    id          VARCHAR(36) NOT NULL PRIMARY KEY,
    session_id  VARCHAR(36) NOT NULL,
    exercise_id VARCHAR(36) NOT NULL,
    set_number  TINYINT NOT NULL CHECK (set_number > 0),
    weight_kg   DECIMAL(5,1) NOT NULL DEFAULT 0,
    reps_done   SMALLINT NOT NULL CHECK (reps_done >= 0),
    logged_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_pr       TINYINT(1) NOT NULL DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE,
    FOREIGN KEY (exercise_id) REFERENCES exercises (id)
);

CREATE INDEX IF NOT EXISTS idx_serie_logs_session_id ON serie_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_serie_logs_exercise_id ON serie_logs (exercise_id);

CREATE TABLE IF NOT EXISTS personal_records (
    id          VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id     VARCHAR(36) NOT NULL,
    exercise_id VARCHAR(36) NOT NULL,
    weight_kg   DECIMAL(5,1) NOT NULL,
    reps        SMALLINT NOT NULL,
    achieved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, exercise_id),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (exercise_id) REFERENCES exercises (id)
);

CREATE INDEX IF NOT EXISTS idx_personal_records_user_id ON personal_records (user_id);
CREATE INDEX IF NOT EXISTS idx_personal_records_exercise_id ON personal_records (exercise_id);

CREATE TABLE IF NOT EXISTS foods (
    id                VARCHAR(36) NOT NULL PRIMARY KEY,
    usda_id           VARCHAR(50) UNIQUE,
    barcode           VARCHAR(50),
    name              VARCHAR(255) NOT NULL,
    calories_per_100g DECIMAL(7,2) NOT NULL CHECK (calories_per_100g >= 0),
    protein_per_100g  DECIMAL(7,2) NOT NULL CHECK (protein_per_100g >= 0),
    carbs_per_100g    DECIMAL(7,2) NOT NULL CHECK (carbs_per_100g >= 0),
    fat_per_100g      DECIMAL(7,2) NOT NULL CHECK (fat_per_100g >= 0),
    source            VARCHAR(10) NOT NULL DEFAULT 'USDA'
);

CREATE INDEX IF NOT EXISTS idx_foods_usda_id ON foods (usda_id);
CREATE INDEX IF NOT EXISTS idx_foods_barcode ON foods (barcode);

CREATE TABLE IF NOT EXISTS recipes (
    id             VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id        VARCHAR(36) NOT NULL,
    name           VARCHAR(255) NOT NULL,
    total_calories DECIMAL(7,2) NOT NULL DEFAULT 0,
    total_protein  DECIMAL(7,2) NOT NULL DEFAULT 0,
    total_carbs    DECIMAL(7,2) NOT NULL DEFAULT 0,
    total_fat      DECIMAL(7,2) NOT NULL DEFAULT 0,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON recipes (user_id);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id         VARCHAR(36) NOT NULL PRIMARY KEY,
    recipe_id  VARCHAR(36) NOT NULL,
    food_id    VARCHAR(36) NOT NULL,
    quantity_g DECIMAL(8,2) NOT NULL CHECK (quantity_g > 0),
    FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE,
    FOREIGN KEY (food_id) REFERENCES foods (id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients (recipe_id);

CREATE TABLE IF NOT EXISTS daily_records (
    id             VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id        VARCHAR(36) NOT NULL,
    record_date    DATE NOT NULL,
    total_calories DECIMAL(7,2) NOT NULL DEFAULT 0,
    total_protein  DECIMAL(7,2) NOT NULL DEFAULT 0,
    total_carbs    DECIMAL(7,2) NOT NULL DEFAULT 0,
    total_fat      DECIMAL(7,2) NOT NULL DEFAULT 0,
    calorie_goal   INT NOT NULL DEFAULT 0,
    UNIQUE (user_id, record_date),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_daily_records_user_id ON daily_records (user_id);
CREATE INDEX IF NOT EXISTS idx_daily_records_record_date ON daily_records (record_date DESC);

CREATE TABLE IF NOT EXISTS meals (
    id              VARCHAR(36) NOT NULL PRIMARY KEY,
    daily_record_id VARCHAR(36) NOT NULL,
    meal_type       VARCHAR(10) NOT NULL CHECK (meal_type IN ('BREAKFAST','LUNCH','DINNER','SNACK')),
    logged_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (daily_record_id) REFERENCES daily_records (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meals_daily_record_id ON meals (daily_record_id);

CREATE TABLE IF NOT EXISTS food_logs (
    id         VARCHAR(36) NOT NULL PRIMARY KEY,
    meal_id    VARCHAR(36) NOT NULL,
    food_id    VARCHAR(36) NOT NULL,
    quantity_g DECIMAL(8,2) NOT NULL CHECK (quantity_g > 0),
    calories   DECIMAL(7,2) NOT NULL DEFAULT 0,
    protein    DECIMAL(7,2) NOT NULL DEFAULT 0,
    carbs      DECIMAL(7,2) NOT NULL DEFAULT 0,
    fat        DECIMAL(7,2) NOT NULL DEFAULT 0,
    FOREIGN KEY (meal_id) REFERENCES meals (id) ON DELETE CASCADE,
    FOREIGN KEY (food_id) REFERENCES foods (id)
);

CREATE INDEX IF NOT EXISTS idx_food_logs_meal_id ON food_logs (meal_id);

CREATE TABLE IF NOT EXISTS nutrition_plans (
    id             VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id        VARCHAR(36) NOT NULL,
    calorie_goal   INT NOT NULL CHECK (calorie_goal > 0),
    protein_goal_g DECIMAL(7,2) NOT NULL CHECK (protein_goal_g >= 0),
    carbs_goal_g   DECIMAL(7,2) NOT NULL CHECK (carbs_goal_g >= 0),
    fat_goal_g     DECIMAL(7,2) NOT NULL CHECK (fat_goal_g >= 0),
    is_active      TINYINT(1) NOT NULL DEFAULT 1,
    generated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_nutrition_plans_user_id ON nutrition_plans (user_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_plans_is_active ON nutrition_plans (user_id, is_active);

CREATE TABLE IF NOT EXISTS sleep_records (
    id               VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id          VARCHAR(36) NOT NULL,
    sleep_start      TIMESTAMP NOT NULL,
    sleep_end        TIMESTAMP NOT NULL,
    duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
    quality_stars    TINYINT NOT NULL CHECK (quality_stars BETWEEN 1 AND 5),
    phases           JSON,
    source           VARCHAR(10) NOT NULL DEFAULT 'MANUAL',
    recorded_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (sleep_end > sleep_start),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sleep_records_user_id ON sleep_records (user_id);
CREATE INDEX IF NOT EXISTS idx_sleep_records_sleep_start ON sleep_records (sleep_start DESC);
CREATE INDEX IF NOT EXISTS idx_sleep_records_user_start ON sleep_records (user_id, sleep_start DESC);

CREATE TABLE IF NOT EXISTS wearable_connections (
    id                  VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id             VARCHAR(36) NOT NULL,
    provider            VARCHAR(20) NOT NULL,
    access_token_enc    TEXT NOT NULL,
    refresh_token_enc   TEXT NOT NULL,
    token_expires_at    TIMESTAMP NOT NULL,
    last_sync_at        TIMESTAMP NULL,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    consecutive_failures TINYINT NOT NULL DEFAULT 0,
    UNIQUE (user_id, provider),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wearable_connections_user_id ON wearable_connections (user_id);

CREATE TABLE IF NOT EXISTS wearable_data (
    id              VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id         VARCHAR(36) NOT NULL,
    provider        VARCHAR(20) NOT NULL,
    data_date       DATE NOT NULL,
    steps           INT,
    calories_burned DECIMAL(7,2),
    avg_heart_rate  SMALLINT,
    vo2max          DECIMAL(4,1),
    stress_level    TINYINT,
    raw_data        JSON,
    UNIQUE (user_id, provider, data_date),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wearable_data_user_id ON wearable_data (user_id);
CREATE INDEX IF NOT EXISTS idx_wearable_data_data_date ON wearable_data (data_date DESC);

CREATE TABLE IF NOT EXISTS notification_settings (
    id                VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id           VARCHAR(36) NOT NULL,
    notification_type VARCHAR(30) NOT NULL,
    is_enabled        TINYINT(1) NOT NULL DEFAULT 1,
    scheduled_time    TIME,
    config            JSON,
    UNIQUE (user_id, notification_type),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON notification_settings (user_id);

CREATE TABLE IF NOT EXISTS offline_queue (
    id               VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id          VARCHAR(36) NOT NULL,
    operation        VARCHAR(10) NOT NULL CHECK (operation IN ('CREATE','UPDATE','DELETE')),
    entity_type      VARCHAR(20) NOT NULL CHECK (entity_type IN ('session','serie_log','food_log','sleep_record','weight')),
    entity_id        VARCHAR(36) NOT NULL,
    payload          JSON NOT NULL,
    client_timestamp BIGINT NOT NULL,
    is_processed     TINYINT(1) NOT NULL DEFAULT 0,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_offline_queue_user_id ON offline_queue (user_id);
CREATE INDEX IF NOT EXISTS idx_offline_queue_is_processed ON offline_queue (user_id, is_processed);
CREATE INDEX IF NOT EXISTS idx_offline_queue_timestamp ON offline_queue (client_timestamp);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id     VARCHAR(36) NOT NULL,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    expires_at  TIMESTAMP NOT NULL,
    revoked     TINYINT(1) NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);

CREATE TABLE IF NOT EXISTS email_verifications (
    id          VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id     VARCHAR(36) NOT NULL,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    expires_at  TIMESTAMP NOT NULL,
    used        TINYINT(1) NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications (user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_token_hash ON email_verifications (token_hash);

CREATE TABLE IF NOT EXISTS password_resets (
    id          VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id     VARCHAR(36) NOT NULL,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    expires_at  TIMESTAMP NOT NULL,
    used        TINYINT(1) NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets (user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash ON password_resets (token_hash);

CREATE TABLE IF NOT EXISTS calendar_connections (
    id               VARCHAR(36) NOT NULL PRIMARY KEY,
    user_id          VARCHAR(36) NOT NULL,
    provider         VARCHAR(10) NOT NULL CHECK (provider IN ('google','apple')),
    access_token_enc TEXT NOT NULL,
    is_active        TINYINT(1) NOT NULL DEFAULT 1,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, provider),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_calendar_connections_user_id ON calendar_connections (user_id);
