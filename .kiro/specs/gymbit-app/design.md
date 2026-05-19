# Documento de DiseÃ±o TÃ©cnico â€” GymBit

## Tabla de Contenidos

1. [VisiÃ³n General](#1-visiÃ³n-general)
2. [Arquitectura del Sistema](#2-arquitectura-del-sistema)
3. [Componentes e Interfaces](#3-componentes-e-interfaces)
4. [Modelos de Datos](#4-modelos-de-datos)
5. [Propiedades de CorrecciÃ³n](#5-propiedades-de-correcciÃ³n)
6. [Manejo de Errores](#6-manejo-de-errores)
7. [Estrategia de Testing](#7-estrategia-de-testing)

---

## 1. VisiÃ³n General

GymBit es una plataforma fitness multiplataforma (iOS, Android, Web PWA) que integra gestiÃ³n de rutinas, nutriciÃ³n, sueÃ±o, wearables y analÃ­ticas en una sola experiencia. El sistema opera en modo online y offline completo, priorizando la privacidad del usuario (GDPR / Ley 1581 de Colombia) y el rendimiento (carga inicial < 3 s en 4G).

### Decisiones tÃ©cnicas clave

| DecisiÃ³n | ElecciÃ³n | JustificaciÃ³n |
|---|---|---|
| Frontend mÃ³vil | React Native + Expo | CÃ³digo compartido iOS/Android, acceso a APIs nativas (HealthKit, SQLite, notificaciones), ecosistema maduro |
| Frontend web | React + PWA | ReutilizaciÃ³n de lÃ³gica de negocio con el mÃ³vil, soporte offline via Service Worker + IndexedDB |
| Backend | Node.js + Express | Ecosistema JavaScript unificado con el frontend, alto rendimiento I/O para sincronizaciÃ³n en tiempo real |
| Base de datos principal | MySQL | ACID, soporte JSON nativo para datos semiestructurados (logs de wearables), soporte de índices espaciales y funciones geoespaciales para futuras necesidades de geolocalización |
| AutenticaciÃ³n | Auth0 | GestiÃ³n de OAuth 2.0 / OIDC delegada, soporte MFA, cumplimiento GDPR out-of-the-box, reduce superficie de ataque |
| IA NutriciÃ³n | Google Gemini Vision | PrecisiÃ³n â‰¥ 85% en reconocimiento de alimentos, API REST simple, sin necesidad de modelo propio |
| Offline storage | SQLite (mobile) / IndexedDB (web) | EstÃ¡ndar de la industria para cada plataforma, soporte nativo en Expo (expo-sqlite) |
| GrÃ¡ficos | Victory Native / Recharts | Victory Native optimizado para React Native, Recharts para web; API similar reduce curva de aprendizaje |
| Notificaciones | Expo Notifications + Firebase FCM | Expo abstrae las diferencias iOS/Android; FCM para entrega confiable en background |

---

## 2. Arquitectura del Sistema

### 2.1 Diagrama de capas

```mermaid
graph TB
    subgraph "Clientes"
        RN["React Native + Expo\n(iOS / Android)"]
        WEB["React PWA\n(Web)"]
    end

    subgraph "API Gateway / BFF"
        GW["Express API Gateway\n(Rate limiting, Auth middleware,\nRequest routing)"]
    end

    subgraph "Servicios de Dominio"
        AUTH["Auth_Service\n(Auth0 + JWT)"]
        PROFILE["Profile_Service"]
        WORKOUT["Workout_Engine"]
        NUTRITION["Nutrition_Service"]
        SLEEP["Sleep_Service"]
        ANALYTICS["Analytics_Service"]
        WEARABLE["Wearable_Service"]
        NOTIF["Notification_Service"]
        SYNC["Sync_Service"]
        AI["AI_Vision_Service\n(Gemini Vision)"]
    end

    subgraph "Almacenamiento"
        PG[("MySQL\\n(datos principales)")]
        REDIS[("Redis\n(cachÃ© + sesiones)")]
        S3["Object Storage\n(fotos, PDFs, GIFs)"]
    end

    subgraph "Servicios Externos"
        AUTH0["Auth0"]
        USDA["USDA FoodData API"]
        GEMINI["Google Gemini Vision"]
        HEALTHKIT["Apple HealthKit"]
        GARMIN["Garmin Connect API"]
        GOOGLEFIT["Google Fit API"]
        FCM["Firebase FCM"]
        GCAL["Google Calendar API"]
        ACAL["Apple Calendar"]
    end

    subgraph "Almacenamiento Local (Cliente)"
        SQLITE["SQLite\n(mobile)"]
        IDB["IndexedDB\n(web)"]
    end

    RN <-->|HTTPS/TLS 1.2+| GW
    WEB <-->|HTTPS/TLS 1.2+| GW
    GW --> AUTH
    GW --> PROFILE
    GW --> WORKOUT
    GW --> NUTRITION
    GW --> SLEEP
    GW --> ANALYTICS
    GW --> WEARABLE
    GW --> NOTIF
    GW --> SYNC
    GW --> AI

    AUTH --> AUTH0
    NUTRITION --> USDA
    AI --> GEMINI
    WEARABLE --> HEALTHKIT
    WEARABLE --> GARMIN
    WEARABLE --> GOOGLEFIT
    NOTIF --> FCM
    NOTIF --> GCAL
    NOTIF --> ACAL

    AUTH --> PG
    PROFILE --> PG
    WORKOUT --> PG
    NUTRITION --> PG
    SLEEP --> PG
    ANALYTICS --> PG
    WEARABLE --> PG
    SYNC --> PG

    ANALYTICS --> REDIS
    AUTH --> REDIS

    AI --> S3
    ANALYTICS --> S3

    RN <--> SQLITE
    WEB <--> IDB
```

### 2.2 Diagrama de flujo offline/sync

```mermaid
sequenceDiagram
    participant App as App (cliente)
    participant Local as SQLite / IndexedDB
    participant Queue as Cola_Offline
    participant Sync as Sync_Service
    participant DB as MySQL

    App->>Local: Escritura local (timestamp)
    Local->>Queue: Encola operaciÃ³n pendiente
    Note over App: Sin conexiÃ³n

    App-->>Sync: ConexiÃ³n recuperada
    Sync->>Queue: Lee operaciones pendientes
    loop Por cada operaciÃ³n en cola
        Sync->>DB: Aplica escritura
        DB-->>Sync: Confirma
        alt Conflicto detectado
            Sync->>Sync: Ãšltima escritura gana (timestamp)
        end
        Sync->>Queue: Elimina operaciÃ³n procesada
    end
    Sync-->>App: Notifica sincronizaciÃ³n completa
```

### 2.3 Flujo de autenticaciÃ³n

```mermaid
sequenceDiagram
    participant U as Usuario
    participant App as App
    participant GW as API Gateway
    participant Auth as Auth_Service
    participant Auth0 as Auth0

    U->>App: "Continuar con Google"
    App->>Auth0: Redirect OAuth 2.0
    Auth0-->>U: Pantalla de consentimiento Google
    U->>Auth0: Autoriza
    Auth0-->>App: Authorization code
    App->>Auth: POST /auth/callback {code}
    Auth->>Auth0: Exchange code â†’ tokens
    Auth0-->>Auth: access_token + id_token
    Auth->>Auth: Crea/actualiza usuario en DB
    Auth->>Auth: Genera JWT (24h) + refresh token (30d)
    Auth-->>App: {accessToken, refreshToken, user}
    App->>Local: Persiste sesiÃ³n cifrada (AES-256)
```

---

## 3. Componentes e Interfaces

### 3.1 Auth_Service

**Responsabilidad:** AutenticaciÃ³n, autorizaciÃ³n y gestiÃ³n de sesiones.

```
POST /auth/register          â†’ Registro con correo/contraseÃ±a
POST /auth/login             â†’ Login con correo/contraseÃ±a
POST /auth/callback          â†’ Callback OAuth 2.0 (Google)
POST /auth/refresh           â†’ Renovar access token
POST /auth/logout            â†’ Invalidar sesiÃ³n
POST /auth/forgot-password   â†’ Solicitar reset de contraseÃ±a
POST /auth/reset-password    â†’ Aplicar nueva contraseÃ±a
GET  /auth/verify-email/:token â†’ Verificar correo
```

**Contratos clave:**
- ContraseÃ±as hasheadas con bcrypt (cost factor â‰¥ 12)
- JWT firmado con RS256, expiraciÃ³n 24 h
- Refresh token rotativo, expiraciÃ³n 30 dÃ­as, almacenado en DB con hash
- Rate limiting: 5 intentos fallidos â†’ bloqueo 15 min (Redis)
- SesiÃ³n offline: JWT + datos de usuario cifrados con AES-256 en almacenamiento local

### 3.2 Profile_Service

**Responsabilidad:** GestiÃ³n del perfil fÃ­sico y cÃ¡lculo de mÃ©tricas.

```
GET    /profile              â†’ Obtener perfil completo
PUT    /profile              â†’ Actualizar perfil
POST   /profile/weight       â†’ Registrar nuevo peso
GET    /profile/weight/history â†’ Historial de peso
GET    /profile/metrics      â†’ IMC, TMB, TDEE actuales
```

**FÃ³rmulas implementadas:**

```
IMC = peso_kg / (altura_m)Â²

TMB (hombre) = 10 Ã— peso_kg + 6.25 Ã— altura_cm âˆ’ 5 Ã— edad + 5
TMB (mujer)  = 10 Ã— peso_kg + 6.25 Ã— altura_cm âˆ’ 5 Ã— edad âˆ’ 161

TDEE = TMB Ã— factor_actividad
  Sedentario:       1.2
  Ligero (1-3d/sem): 1.375
  Moderado (3-5d):  1.55
  Activo (6-7d):    1.725
  Muy activo:       1.9
```

### 3.3 Workout_Engine

**Responsabilidad:** GeneraciÃ³n de rutinas, modo entrenamiento en vivo, PRs y sobrecarga progresiva.

```
POST /workouts/generate      â†’ Generar plan de entrenamiento
GET  /workouts/plan          â†’ Plan activo del usuario
GET  /workouts/sessions      â†’ Historial de sesiones
POST /workouts/sessions      â†’ Iniciar sesiÃ³n
PUT  /workouts/sessions/:id  â†’ Actualizar sesiÃ³n activa
POST /workouts/sessions/:id/complete â†’ Completar sesiÃ³n
POST /workouts/series        â†’ Registrar serie
GET  /workouts/prs           â†’ PRs por ejercicio
GET  /exercises              â†’ CatÃ¡logo de ejercicios
```

**LÃ³gica de selecciÃ³n de rutina:**

```
dÃ­as_disponibles = 1-2 â†’ Full Body
dÃ­as_disponibles = 3   â†’ Full Body o Upper/Lower
dÃ­as_disponibles = 4-5 â†’ PPL o Upper/Lower
dÃ­as_disponibles = 6+  â†’ PPL
objetivo = ENDURANCE   â†’ Cardio puro (independiente de dÃ­as)
nivel = BEGINNER       â†’ Full Body (independiente de dÃ­as)
```

**Sobrecarga progresiva:**
- Si el usuario completÃ³ 100% de series y reps objetivo en la sesiÃ³n anterior â†’ incremento de 2.5 kg (ejercicios de aislamiento) o 5 kg (ejercicios compuestos)
- El incremento se aplica al inicio de la siguiente sesiÃ³n

### 3.4 Nutrition_Service

**Responsabilidad:** Registro nutricional, plan nutricional y bÃºsqueda de alimentos.

```
GET  /nutrition/search?q=    â†’ BÃºsqueda USDA
POST /nutrition/barcode      â†’ BÃºsqueda por cÃ³digo de barras
POST /nutrition/photo        â†’ Reconocimiento por foto (â†’ AI_Vision_Service)
GET  /nutrition/daily/:date  â†’ RegistroDiario
POST /nutrition/daily/meals  â†’ Agregar comida al dÃ­a
POST /nutrition/daily/meals/:id/foods â†’ Agregar alimento a comida
DELETE /nutrition/daily/meals/:id/foods/:foodId â†’ Eliminar alimento
GET  /nutrition/recipes      â†’ Recetas guardadas
POST /nutrition/recipes      â†’ Crear receta
GET  /nutrition/plan         â†’ Plan nutricional activo
POST /nutrition/plan/generate â†’ Generar plan nutricional
```

**CÃ¡lculo de objetivos calÃ³ricos:**

```
LOSE_WEIGHT:  objetivo_kcal = TDEE âˆ’ 400 (punto medio 300-500)
GAIN_MUSCLE:  objetivo_kcal = TDEE + 300 (punto medio 200-400)
GAIN_WEIGHT:  objetivo_kcal = TDEE + 300
MAINTENANCE:  objetivo_kcal = TDEE
ENDURANCE:    objetivo_kcal = TDEE
```

**DistribuciÃ³n de macros:**

```
GAIN_MUSCLE:
  proteÃ­nas = 1.9 g/kg Ã— peso_kg  (punto medio 1.6-2.2)
  grasas     = 0.25 Ã— objetivo_kcal / 9
  carbos     = (objetivo_kcal âˆ’ proteÃ­nasÃ—4 âˆ’ grasasÃ—9) / 4

LOSE_WEIGHT:
  proteÃ­nas = 1.4 g/kg Ã— peso_kg  (punto medio 1.2-1.6)
  grasas     = 0.25 Ã— objetivo_kcal / 9
  carbos     = (objetivo_kcal âˆ’ proteÃ­nasÃ—4 âˆ’ grasasÃ—9) / 4
```

### 3.5 Sleep_Service

```
POST /sleep              â†’ Registrar sueÃ±o manual
GET  /sleep/history      â†’ Historial de sueÃ±o
GET  /sleep/latest       â†’ Ãšltimo registro de sueÃ±o
POST /sleep/wearable     â†’ Importar datos de wearable
```

### 3.6 Analytics_Service

```
GET /analytics/dashboard     â†’ Resumen diario completo
GET /analytics/charts/:type  â†’ Datos para grÃ¡fico especÃ­fico
POST /analytics/export/pdf   â†’ Generar reporte PDF mensual
```

### 3.7 Wearable_Service

```
POST /wearables/connect/:provider    â†’ Conectar wearable
DELETE /wearables/disconnect/:provider â†’ Desconectar
GET  /wearables/status               â†’ Estado de conexiones
POST /wearables/sync                 â†’ SincronizaciÃ³n manual
GET  /wearables/data                 â†’ Datos importados
```

### 3.8 Notification_Service

```
GET  /notifications/settings         â†’ ConfiguraciÃ³n actual
PUT  /notifications/settings         â†’ Actualizar configuraciÃ³n
POST /notifications/calendar/connect â†’ Conectar calendario
GET  /notifications/history          â†’ Historial de notificaciones
```

### 3.9 Sync_Service

```
POST /sync/push          â†’ Enviar Cola_Offline al servidor
GET  /sync/pull          â†’ Obtener cambios del servidor
GET  /sync/status        â†’ Estado de sincronizaciÃ³n
```

---

## 4. Modelos de Datos

### 4.1 Diagrama entidad-relaciÃ³n principal

```mermaid
erDiagram
    USERS {
        uuid id PK
        string email UK
        string auth0_id UK
        string name
        timestamp created_at
        timestamp updated_at
        boolean is_active
        boolean email_verified
    }

    PROFILES {
        uuid id PK
        uuid user_id FK
        date birth_date
        string gender
        decimal height_cm
        decimal weight_kg
        string goal
        string experience_level
        int available_days
        text medical_conditions
        decimal bmi
        decimal bmr
        decimal tdee
        timestamp updated_at
    }

    WEIGHT_HISTORY {
        uuid id PK
        uuid user_id FK
        decimal weight_kg
        timestamp recorded_at
    }

    EXERCISES {
        uuid id PK
        string name
        json muscle_groups
        string equipment_type
        string category
        string gif_url
        string video_url
        boolean is_compound
    }

    WORKOUT_PLANS {
        uuid id PK
        uuid user_id FK
        string plan_type
        boolean is_active
        timestamp generated_at
        json config
    }

    WORKOUT_DAYS {
        uuid id PK
        uuid plan_id FK
        int day_of_week
        string focus
    }

    PLAN_EXERCISES {
        uuid id PK
        uuid day_id FK
        uuid exercise_id FK
        int sets
        int reps_target
        int rest_seconds
        int order_index
        uuid superset_group_id
        decimal weight_kg
    }

    SESSIONS {
        uuid id PK
        uuid user_id FK
        uuid plan_id FK
        timestamp started_at
        timestamp completed_at
        int total_volume_kg
        int duration_seconds
        boolean is_active
        json offline_state
    }

    SERIE_LOGS {
        uuid id PK
        uuid session_id FK
        uuid exercise_id FK
        int set_number
        decimal weight_kg
        int reps_done
        timestamp logged_at
        boolean is_pr
    }

    PERSONAL_RECORDS {
        uuid id PK
        uuid user_id FK
        uuid exercise_id FK
        decimal weight_kg
        int reps
        timestamp achieved_at
    }

    FOODS {
        uuid id PK
        string usda_id UK
        string barcode
        string name
        decimal calories_per_100g
        decimal protein_per_100g
        decimal carbs_per_100g
        decimal fat_per_100g
        string source
    }

    RECIPES {
        uuid id PK
        uuid user_id FK
        string name
        decimal total_calories
        decimal total_protein
        decimal total_carbs
        decimal total_fat
        timestamp created_at
    }

    RECIPE_INGREDIENTS {
        uuid id PK
        uuid recipe_id FK
        uuid food_id FK
        decimal quantity_g
    }

    DAILY_RECORDS {
        uuid id PK
        uuid user_id FK
        date record_date UK
        decimal total_calories
        decimal total_protein
        decimal total_carbs
        decimal total_fat
        int calorie_goal
    }

    MEALS {
        uuid id PK
        uuid daily_record_id FK
        string meal_type
        timestamp logged_at
    }

    FOOD_LOGS {
        uuid id PK
        uuid meal_id FK
        uuid food_id FK
        decimal quantity_g
        decimal calories
        decimal protein
        decimal carbs
        decimal fat
    }

    NUTRITION_PLANS {
        uuid id PK
        uuid user_id FK
        int calorie_goal
        decimal protein_goal_g
        decimal carbs_goal_g
        decimal fat_goal_g
        boolean is_active
        timestamp generated_at
    }

    SLEEP_RECORDS {
        uuid id PK
        uuid user_id FK
        timestamp sleep_start
        timestamp sleep_end
        int duration_minutes
        int quality_stars
        json phases
        string source
        timestamp recorded_at
    }

    WEARABLE_CONNECTIONS {
        uuid id PK
        uuid user_id FK
        string provider
        string access_token_enc
        string refresh_token_enc
        timestamp token_expires_at
        timestamp last_sync_at
        boolean is_active
    }

    WEARABLE_DATA {
        uuid id PK
        uuid user_id FK
        string provider
        date data_date
        int steps
        decimal calories_burned
        int avg_heart_rate
        decimal vo2max
        int stress_level
        json raw_data
    }

    NOTIFICATION_SETTINGS {
        uuid id PK
        uuid user_id FK
        string notification_type
        boolean is_enabled
        time scheduled_time
        json config
    }

    OFFLINE_QUEUE {
        uuid id PK
        uuid user_id FK
        string operation
        string entity_type
        uuid entity_id
        json payload
        timestamp client_timestamp
        boolean is_processed
        timestamp created_at
    }

    USERS ||--|| PROFILES : "tiene"
    USERS ||--o{ WEIGHT_HISTORY : "registra"
    USERS ||--o{ WORKOUT_PLANS : "tiene"
    USERS ||--o{ SESSIONS : "realiza"
    USERS ||--o{ PERSONAL_RECORDS : "logra"
    USERS ||--o{ DAILY_RECORDS : "registra"
    USERS ||--o{ RECIPES : "crea"
    USERS ||--o{ SLEEP_RECORDS : "registra"
    USERS ||--o{ WEARABLE_CONNECTIONS : "conecta"
    USERS ||--o{ WEARABLE_DATA : "importa"
    USERS ||--o{ NOTIFICATION_SETTINGS : "configura"
    USERS ||--o{ OFFLINE_QUEUE : "genera"
    USERS ||--o{ NUTRITION_PLANS : "tiene"

    WORKOUT_PLANS ||--o{ WORKOUT_DAYS : "contiene"
    WORKOUT_DAYS ||--o{ PLAN_EXERCISES : "incluye"
    PLAN_EXERCISES }o--|| EXERCISES : "referencia"

    SESSIONS ||--o{ SERIE_LOGS : "contiene"
    SERIE_LOGS }o--|| EXERCISES : "registra"

    DAILY_RECORDS ||--o{ MEALS : "contiene"
    MEALS ||--o{ FOOD_LOGS : "contiene"
    FOOD_LOGS }o--|| FOODS : "referencia"

    RECIPES ||--o{ RECIPE_INGREDIENTS : "contiene"
    RECIPE_INGREDIENTS }o--|| FOODS : "usa"
```

### 4.2 Estructura de la Cola_Offline

```typescript
interface OfflineQueueItem {
  id: string;                    // UUID local
  userId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  entityType: 'session' | 'serie_log' | 'food_log' | 'sleep_record' | 'weight';
  entityId: string;
  payload: Record<string, unknown>;
  clientTimestamp: number;       // Unix ms â€” usado para "Ãºltima escritura gana"
  isProcessed: boolean;
}
```

### 4.3 Esquema local SQLite / IndexedDB

El cliente mantiene un subconjunto de las tablas del servidor para operaciÃ³n offline:

| Tabla local | PropÃ³sito |
|---|---|
| `users_cache` | Datos de sesiÃ³n y perfil |
| `workout_plan_cache` | Plan activo + ejercicios |
| `sessions_local` | Sesiones en curso o recientes |
| `serie_logs_local` | Series registradas offline |
| `foods_cache` | Base de datos USDA en cachÃ© (~50k alimentos frecuentes) |
| `daily_records_local` | Registros nutricionales del dÃ­a |
| `food_logs_local` | AlimentoLogs offline |
| `sleep_records_local` | Registros de sueÃ±o offline |
| `offline_queue` | Cola de escrituras pendientes |

---



