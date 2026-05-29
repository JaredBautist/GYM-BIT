# 🏋️ GymBit — Tu Compañero Fitness Inteligente

<div align="center">

![GymBit Banner](https://img.shields.io/badge/GymBit-Fitness%20App-6366F1?style=for-the-badge&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript)
![React Native](https://img.shields.io/badge/React%20Native-0.76-61DAFB?style=flat-square&logo=react)
![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=nodedotjs)
![Tests](https://img.shields.io/badge/Tests-155%20passing-22C55E?style=flat-square)

**Plataforma fitness multiplataforma (iOS · Android · Web PWA)**  
Rutinas personalizadas con IA · Nutrición · Sueño · Wearables · Modo offline completo

</div>

---

## 📋 Tabla de Contenidos

- [¿Qué es GymBit?](#-qué-es-gymbit)
- [Características principales](#-características-principales)
- [Arquitectura](#-arquitectura)
- [Requisitos previos](#-requisitos-previos)
- [Instalación](#-instalación)
- [Variables de entorno](#-variables-de-entorno)
- [Ejecutar el proyecto](#-ejecutar-el-proyecto)
- [Cómo ver la app en tu teléfono](#-cómo-ver-la-app-en-tu-teléfono)
- [Ejecutar los tests](#-ejecutar-los-tests)
- [Estructura del proyecto](#-estructura-del-proyecto)
- [Stack tecnológico](#-stack-tecnológico)
- [API Reference](#-api-reference)
- [Seguridad y privacidad](#-seguridad-y-privacidad)

---

## 🎯 ¿Qué es GymBit?

GymBit es una aplicación fitness personal multiplataforma que acompaña al usuario en su transformación física de forma inteligente. Combina:

- **Rutinas personalizadas** generadas según tu objetivo, nivel y disponibilidad
- **Nutrición inteligente** con reconocimiento de alimentos por foto (Google Gemini Vision)
- **Seguimiento de sueño** con ajuste automático de intensidad de entrenamiento
- **Integración con wearables** (Apple Watch, Garmin, Wear OS)
- **Modo offline completo** — funciona sin internet y sincroniza al reconectarse
- **Dashboard con gráficos** de progreso en tiempo real

---

## ✨ Características principales

| Módulo | Descripción |
|--------|-------------|
| 🔐 **Autenticación** | Login con correo/contraseña o Google OAuth 2.0 (Auth0) |
| 👤 **Perfil** | IMC, TMB y TDEE calculados en tiempo real (Mifflin-St Jeor) |
| 💪 **Rutinas** | Full Body, PPL, Upper/Lower, Cardio — con sobrecarga progresiva automática |
| 🥗 **Nutrición** | Búsqueda USDA, escáner de código de barras, reconocimiento por foto con IA |
| 😴 **Sueño** | Registro manual o desde wearable, ajuste de intensidad si calidad ≤ 2 estrellas |
| 📊 **Dashboard** | 8 tipos de gráficos: peso, calorías, heatmap, PRs, IMC, sueño, macros, recuperación |
| ⌚ **Wearables** | HealthKit (Apple Watch), Garmin Connect, Google Fit — sync cada 30 min |
| 🔔 **Notificaciones** | 7 tipos configurables, integración con Google/Apple Calendar |
| 📡 **Offline** | SQLite (móvil) / IndexedDB (web) + Cola_Offline con resolución de conflictos |
| 🔒 **Seguridad** | AES-256, HTTPS/TLS 1.2+, GDPR / Ley 1581 Colombia |

---

## 🏗️ Arquitectura

```
gymbit/
├── packages/
│   ├── backend/      → Node.js + Express + MySQL (API REST)
│   ├── mobile/       → React Native + Expo (iOS & Android)
│   ├── web/          → React + Vite + PWA (navegador)
│   └── shared/       → Tipos TypeScript compartidos
```

```
Cliente móvil/web  ──HTTPS──▶  API Gateway (Express)
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
               Auth_Service   Workout_Engine  Nutrition_Service
               Profile_Service  Sleep_Service  Analytics_Service
               Wearable_Service  Notification_Service  Sync_Service
                    │               │               │
                    └───────────────┼───────────────┘
                                    ▼
                              MySQL + Redis
```

---

## 📦 Requisitos previos

Asegúrate de tener instalado:

| Herramienta | Versión mínima | Instalación |
|-------------|---------------|-------------|
| **Node.js** | 20.x | [nodejs.org](https://nodejs.org) |
| **npm** | 10.x | Incluido con Node.js |
| **MySQL** | 8.x | [mysql.com](https://dev.mysql.com/downloads/) |
| **Redis** | 7.x | [redis.io](https://redis.io/download) |
| **Git** | 2.x | [git-scm.com](https://git-scm.com) |

Para el cliente móvil:

| Herramienta | Descripción |
|-------------|-------------|
| **Expo Go** (Android) | App para previsualizar — ver sección [Cómo ver la app](#-cómo-ver-la-app-en-tu-teléfono) |
| **Cámara** (iOS) | Escanea el QR directamente desde la cámara del iPhone |

---

## 🚀 Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/JaredBautist/GYM-BIT.git
cd GYM-BIT
```

### 2. Instalar dependencias (todas los paquetes a la vez)

```bash
npm install
```

### 3. Configurar la base de datos MySQL

```bash
# Crear la base de datos
mysql -u root -p -e "CREATE DATABASE gymbit CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p -e "CREATE USER 'gymbit'@'localhost' IDENTIFIED BY 'gymbit';"
mysql -u root -p -e "GRANT ALL PRIVILEGES ON gymbit.* TO 'gymbit'@'localhost';"
mysql -u root -p -e "FLUSH PRIVILEGES;"
```

### 4. Configurar variables de entorno

```bash
# Backend
cp packages/backend/.env.example packages/backend/.env
# Edita el archivo con tus credenciales (ver sección Variables de entorno)
```

### 5. Ejecutar migraciones

```bash
cd packages/backend
npm run migrate
cd ../..
```

---

## ⚙️ Variables de entorno

Edita `packages/backend/.env` con tus valores:

```env
# Servidor
NODE_ENV=development
PORT=3000

# Base de datos
DATABASE_URL=mysql://gymbit:gymbit@localhost:3306/gymbit

# Redis (caché y sesiones)
REDIS_URL=redis://localhost:6379

# Auth0 (autenticación)
AUTH0_DOMAIN=tu-tenant.auth0.com
AUTH0_CLIENT_ID=tu-client-id
AUTH0_CLIENT_SECRET=tu-client-secret
AUTH0_AUDIENCE=https://api.gymbit.app

# JWT (claves RS256)
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem

# Google Gemini Vision (reconocimiento de alimentos por foto)
GEMINI_API_KEY=tu-gemini-api-key

# AWS S3 (almacenamiento de fotos y PDFs)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=tu-access-key
AWS_SECRET_ACCESS_KEY=tu-secret-key
S3_BUCKET=gymbit-media

# USDA FoodData (base de datos nutricional)
USDA_API_KEY=tu-usda-api-key

# Firebase FCM (notificaciones push)
FIREBASE_SERVICE_ACCOUNT_PATH=./keys/firebase-service-account.json

# Cifrado AES-256 (datos en reposo)
ENCRYPTION_KEY=base64-encoded-32-byte-key
```

Para la app web, crea `packages/web/.env`:

```env
VITE_API_URL=http://localhost:3000
```

Para la app móvil, crea `packages/mobile/.env`:

```env
EXPO_PUBLIC_API_URL=http://192.168.20.30:3000
EXPO_PUBLIC_AUTH0_DOMAIN=tu-tenant.auth0.com
EXPO_PUBLIC_AUTH0_CLIENT_ID=tu-client-id
```

> ⚠️ **Importante para móvil:** usa tu IP local (ej. `192.168.1.100`) en lugar de `localhost`, ya que el teléfono físico no puede acceder a `localhost` de tu computador.

---

## ▶️ Ejecutar el proyecto

Cada paquete se ejecuta de forma independiente. Abre **3 terminales**:

### Terminal 1 — Backend (API)

```bash
cd packages/backend
npm run dev
```

El servidor arranca en `http://localhost:3000`

Verifica que funciona:
```bash
curl http://localhost:3000/health
# → {"status":"ok","timestamp":"..."}
```

### Terminal 2 — App Móvil (iOS & Android)

```bash
cd packages/mobile
npx expo start
```

Esto abre el **Metro Bundler** de Expo con un QR en la terminal.

Si quieres forzar el modo túnel (útil si el teléfono y el PC no están en la misma red):

```bash
npx expo start --tunnel
```

### Terminal 3 — Web PWA

```bash
cd packages/web
npm run dev
```

La web queda disponible en `http://localhost:5173`

---

## 📱 Cómo ver la app en tu teléfono

> 💡 **Antes de empezar:** asegúrate de que el backend esté corriendo (`npm run dev` en `packages/backend`) y que tu teléfono y tu PC estén en la **misma red WiFi**.

---

### 🤖 Android — Expo Go

**Paso 1 — Instalar Expo Go**

Descarga la app desde la Play Store:

[![Expo Go en Play Store](https://img.shields.io/badge/Play%20Store-Expo%20Go-34A853?style=flat-square&logo=google-play)](https://play.google.com/store/apps/details?id=host.exp.exponent)

O búscala directamente como **"Expo Go"** en la Play Store.

**Paso 2 — Iniciar la app**

En tu PC, abre una terminal y ejecuta:

```bash
cd packages/mobile
npx expo start
```

Verás algo así en la terminal:

```
Metro waiting on exp://192.168.1.100:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
█ ▄▄▄▄▄ █▀█ █▄█ █
█ █   █ █▀▀▀█ ▀ █
█ █▄▄▄█ █▀ █▀▄▄ █
█▄▄▄▄▄▄▄█▄▀▄█▄▀ █
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ 
```

**Paso 3 — Escanear el QR**

1. Abre **Expo Go** en tu Android
2. Toca el botón **"Scan QR code"**
3. Apunta la cámara al QR de la terminal
4. La app GymBit carga en tu teléfono ✅

---

### 🍎 iOS — Cámara nativa (sin instalar nada)

En iPhone **no necesitas descargar ninguna app**:

**Paso 1 — Iniciar la app** (igual que Android)

```bash
cd packages/mobile
npx expo start
```

**Paso 2 — Escanear con la cámara**

1. Abre la **app Cámara** nativa de tu iPhone
2. Apunta al QR que aparece en la terminal
3. Aparece un banner en la parte superior de la pantalla — tócalo
4. Se abre Safari con la app GymBit ✅

> 💡 Si el QR no funciona en iOS, también puedes abrir la versión web en Safari:
> ```
> http://TU_IP_LOCAL:5173
> ```

---

### 🔧 Solución de problemas comunes

| Problema | Solución |
|----------|----------|
| El QR no carga / "Network error" | Usa `npx expo start --tunnel` para conectar por internet en lugar de red local |
| "Unable to resolve host" | Verifica que el teléfono y el PC estén en la misma WiFi |
| La app carga pero no conecta al backend | Cambia `localhost` por tu IP local en `packages/mobile/.env` |
| Expo Go pide actualización | Actualiza Expo Go desde la Play Store |

Para encontrar tu IP local en Linux/Mac:
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
# o
hostname -I
```

En Windows:
```bash
ipconfig
# Busca "Dirección IPv4"
```

---

## 🧪 Ejecutar los tests

```bash
# Todos los tests del backend
cd packages/backend
/home/balckyshadown/Escritorio/gymbit/node_modules/.bin/jest \
  --config /home/balckyshadown/Escritorio/gymbit/packages/backend/jest.config.js \
  --no-coverage

# O usando el script npm
npm test
```

**Resultado esperado:**
```
Test Suites: 13 passed, 13 total
Tests:       155 passed, 155 total
```

### Tipos de tests incluidos

| Tipo | Descripción | Herramienta |
|------|-------------|-------------|
| **Unitarios** | Servicios, validaciones, cálculos | Jest |
| **Propiedad** | Invariantes matemáticos (IMC, macros, sync) | fast-check |
| **Integración** | Flujos completos de Auth, Workout, Nutrition | Jest |

---

## 📁 Estructura del proyecto

```
gymbit/
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── config/          → Variables de entorno (Zod)
│   │   │   ├── db/              → Pool MySQL + migraciones
│   │   │   ├── middleware/      → Auth JWT
│   │   │   ├── routes/          → Endpoints REST
│   │   │   │   ├── auth/        → POST /auth/login, /register...
│   │   │   │   ├── profile/     → GET/PUT /profile
│   │   │   │   ├── workouts/    → Rutinas y sesiones
│   │   │   │   ├── nutrition/   → Alimentos y plan nutricional
│   │   │   │   ├── sleep/       → Registro de sueño
│   │   │   │   ├── analytics/   → Dashboard y gráficos
│   │   │   │   ├── wearables/   → Integración wearables
│   │   │   │   ├── notifications/ → Configuración notificaciones
│   │   │   │   ├── sync/        → Cola_Offline sync
│   │   │   │   └── users/       → GDPR (eliminar/exportar datos)
│   │   │   └── services/        → Lógica de negocio
│   │   │       ├── auth.service.ts
│   │   │       ├── profile.service.ts
│   │   │       ├── workout.service.ts
│   │   │       ├── nutrition.service.ts
│   │   │       ├── sleep.service.ts
│   │   │       ├── analytics.service.ts
│   │   │       ├── wearable.service.ts
│   │   │       ├── notification.service.ts
│   │   │       ├── sync.service.ts
│   │   │       └── ai.vision.service.ts
│   │   └── src/__tests__/       → 155 tests
│   │
│   ├── mobile/
│   │   └── src/
│   │       ├── db/              → SQLite local (expo-sqlite)
│   │       │   ├── schema.ts    → 9 tablas locales
│   │       │   ├── database.ts  → Singleton + helpers
│   │       │   └── repositories/ → CRUD por entidad
│   │       ├── offline/         → Cola_Offline + SyncManager
│   │       └── screens/         → Pantallas React Native
│   │           ├── auth/        → Login, Register, ForgotPassword
│   │           ├── onboarding/  → Flujo de configuración inicial
│   │           ├── profile/     → Perfil + historial de peso
│   │           ├── workout/     → Sesión activa + resumen
│   │           ├── nutrition/   → Registro diario + plan
│   │           ├── sleep/       → Registro de sueño
│   │           ├── dashboard/   → Dashboard con gráficos
│   │           └── settings/    → Wearables + notificaciones
│   │
│   ├── web/
│   │   └── src/
│   │       ├── db/              → IndexedDB (misma estructura que SQLite)
│   │       ├── offline/         → Cola_Offline para web
│   │       ├── hooks/           → useAuth, etc.
│   │       ├── i18n/            → Español + sistema extensible
│   │       └── pages/           → Dashboard, Login con Recharts
│   │
│   └── shared/
│       └── src/types/           → Tipos TypeScript compartidos
│           ├── user.ts
│           ├── workout.ts
│           ├── nutrition.ts
│           ├── sleep.ts
│           ├── wearable.ts
│           └── sync.ts
│
├── .kiro/specs/gymbit-app/      → Documentación del spec
│   ├── requirements.md
│   ├── design.md
│   └── tasks.md
├── package.json                 → Monorepo workspaces
├── tsconfig.base.json
├── .eslintrc.js
└── .prettierrc
```

---

## 🛠️ Stack tecnológico

### Backend
| Tecnología | Uso |
|-----------|-----|
| Node.js 20 + Express | Servidor API REST |
| TypeScript 5 | Tipado estático |
| MySQL 8 | Base de datos principal |
| Redis 7 | Caché + rate limiting |
| Auth0 | OAuth 2.0 / OIDC |
| JWT RS256 | Tokens de acceso (24h) |
| bcrypt (cost 12) | Hash de contraseñas |
| Zod | Validación de esquemas |
| Google Gemini Vision | Reconocimiento de alimentos |
| AWS S3 | Almacenamiento de fotos/PDFs |
| Firebase FCM | Notificaciones push |

### App Móvil
| Tecnología | Uso |
|-----------|-----|
| React Native 0.76 | Framework móvil |
| Expo 52 | Toolchain + APIs nativas |
| expo-sqlite | Base de datos local offline |
| expo-secure-store | Sesión cifrada AES-256 |
| expo-camera | Captura de fotos |
| expo-barcode-scanner | Escáner de códigos de barras |
| expo-keep-awake | Pantalla encendida en entrenamiento |
| Victory Native | Gráficos (línea, barras, donut, radar) |
| @react-native-community/netinfo | Detección de conectividad |

### Web PWA
| Tecnología | Uso |
|-----------|-----|
| React 18 | Framework web |
| Vite 6 | Bundler + dev server |
| vite-plugin-pwa | Service Worker + manifest |
| Recharts | Gráficos web |
| IndexedDB | Almacenamiento offline |
| react-router-dom 6 | Enrutamiento |

---

## 📡 API Reference

Base URL: `http://localhost:3000`

### Autenticación
```
POST /auth/register          → Registro con correo/contraseña
POST /auth/login             → Login
POST /auth/callback          → OAuth 2.0 Google
POST /auth/refresh           → Renovar token
POST /auth/logout            → Cerrar sesión
POST /auth/forgot-password   → Recuperar contraseña
GET  /auth/verify-email/:token → Verificar correo
```

### Perfil
```
GET    /profile              → Obtener perfil
PUT    /profile              → Actualizar perfil
POST   /profile/weight       → Registrar peso
GET    /profile/weight/history → Historial de peso
GET    /profile/metrics      → IMC, TMB, TDEE
```

### Entrenamiento
```
POST /workouts/generate      → Generar plan
GET  /workouts/plan          → Plan activo
POST /workouts/sessions      → Iniciar sesión
PUT  /workouts/sessions/:id  → Actualizar sesión
POST /workouts/sessions/:id/complete → Completar sesión
POST /workouts/series        → Registrar serie
GET  /workouts/prs           → Récords personales
GET  /exercises              → Catálogo de ejercicios
```

### Nutrición
```
GET  /nutrition/search?q=    → Buscar alimento (USDA)
POST /nutrition/barcode      → Buscar por código de barras
POST /nutrition/photo        → Reconocer por foto (Gemini)
GET  /nutrition/daily/:date  → Registro diario
POST /nutrition/daily/meals  → Agregar comida
POST /nutrition/recipes      → Crear receta
GET  /nutrition/plan         → Plan nutricional activo
POST /nutrition/plan/generate → Generar plan nutricional
```

### Sueño
```
POST /sleep              → Registrar sueño manual
GET  /sleep/history      → Historial
GET  /sleep/latest       → Último registro
POST /sleep/wearable     → Importar desde wearable
```

### Analytics
```
GET  /analytics/dashboard     → Resumen diario
GET  /analytics/charts/:type  → Datos de gráfico
POST /analytics/export/pdf    → Exportar reporte mensual
```

### Sincronización
```
POST /sync/push   → Enviar Cola_Offline al servidor
GET  /sync/pull   → Obtener cambios del servidor
GET  /sync/status → Estado de sincronización
```

### GDPR
```
DELETE /users/:id        → Eliminar cuenta permanentemente
GET    /users/:id/export → Exportar todos los datos en JSON
```

---

## 🔒 Seguridad y privacidad

- **Contraseñas:** bcrypt con cost factor ≥ 12
- **Tokens:** JWT RS256, acceso 24h, refresh 30 días (rotativo)
- **Datos en reposo:** AES-256
- **Transporte:** HTTPS/TLS 1.2+
- **Rate limiting:** 5 intentos fallidos → bloqueo 15 min (Redis)
- **Sesión offline:** expo-secure-store (Keychain iOS / Keystore Android)
- **Cumplimiento:** GDPR + Ley 1581 de Colombia
- **Eliminación de datos:** endpoint dedicado, ejecución inmediata
- **Exportación de datos:** JSON completo en < 24 horas

---

## 🤝 Contribuir

1. Haz fork del repositorio
2. Crea una rama: `git checkout -b feature/mi-feature`
3. Haz commit: `git commit -m 'feat: agregar mi feature'`
4. Push: `git push origin feature/mi-feature`
5. Abre un Pull Request

---

## 📄 Licencia

MIT © 2024 GymBit Team

---

<div align="center">
  Hecho con 💪 para ayudarte a alcanzar tus metas fitness
</div>
