# Plan de Implementación: GymBit

## Visión General

Implementación incremental de GymBit como plataforma fitness multiplataforma (React Native + Expo para iOS/Android, React PWA para web, Node.js + Express para backend, PostgreSQL como base de datos principal). Cada tarea construye sobre la anterior, comenzando por la infraestructura base y terminando con la integración completa de todos los módulos.

**Stack tecnológico:** TypeScript · React Native + Expo · React PWA · Node.js + Express · PostgreSQL · Redis · Auth0 · SQLite (mobile) · IndexedDB (web)

---

## Tareas

- [~] 1. Configurar infraestructura base del proyecto
  - Inicializar monorepo con workspaces: `packages/mobile` (Expo), `packages/web` (React PWA), `packages/backend` (Express), `packages/shared` (tipos y utilidades comunes)
  - Configurar TypeScript estricto en todos los paquetes con `tsconfig.json` compartido
  - Configurar ESLint + Prettier con reglas comunes
  - Crear esquema inicial de PostgreSQL con todas las tablas del modelo de datos (sección 4.1 del diseño)
  - Configurar migraciones con `node-postgres` o `pg-migrate`
  - Configurar variables de entorno con validación (`zod` + `dotenv`)
  - _Requisitos: 13.1, 13.2, 14.1_

- [ ] 2. Implementar Auth_Service (backend)
  - [ ] 2.1 Implementar endpoints de autenticación con Auth0
    - Crear `POST /auth/register`, `POST /auth/login`, `POST /auth/callback` (OAuth 2.0 Google)
    - Implementar `POST /auth/refresh`, `POST /auth/logout`
    - Implementar `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/verify-email/:token`
    - Configurar bcrypt con cost factor ≥ 12 para contraseñas locales
    - Generar JWT firmado con RS256, expiración 24 h; refresh token rotativo, expiración 30 días
    - Implementar rate limiting con Redis: 5 intentos fallidos → bloqueo 15 min
    - _Requisitos: 1.1, 1.2, 1.3, 1.5, 1.6, 1.9, 1.10, 13.6_

  - [ ]* 2.2 Escribir tests unitarios para Auth_Service
    - Testear flujo de registro, login, refresh y logout
    - Testear bloqueo por intentos fallidos (rate limiting)
    - Testear expiración y rotación de tokens
    - _Requisitos: 1.6, 1.7, 13.6_

  - [ ] 2.3 Implementar middleware de autenticación para API Gateway
    - Validar JWT en cada request protegido
    - Propagar `userId` al contexto de cada servicio
    - Configurar HTTPS/TLS 1.2+ en Express
    - _Requisitos: 1.10, 13.2_

- [ ] 3. Implementar Profile_Service (backend)
  - [ ] 3.1 Implementar endpoints de perfil y métricas
    - Crear `GET /profile`, `PUT /profile`, `POST /profile/weight`, `GET /profile/weight/history`, `GET /profile/metrics`
    - Implementar validaciones: altura 100–250 cm, peso 30–300 kg, edad mínima 13 años
    - Implementar cálculo de IMC con 2 decimales de precisión
    - Implementar TMB con fórmula Mifflin-St Jeor (hombre/mujer) y TDEE con factores de actividad
    - Persistir historial de peso con timestamp en `WEIGHT_HISTORY`
    - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ]* 3.2 Escribir tests de propiedad para cálculos de métricas
    - **Propiedad 1: IMC siempre positivo y acotado para entradas válidas**
    - **Valida: Requisito 3.4**
    - **Propiedad 2: TMB hombre > TMB mujer para mismos parámetros físicos**
    - **Valida: Requisito 3.5**
    - **Propiedad 3: TDEE = TMB × factor, factor ∈ {1.2, 1.375, 1.55, 1.725, 1.9}**
    - **Valida: Requisito 3.5**

  - [ ]* 3.3 Escribir tests unitarios para validaciones de perfil
    - Testear rechazo de edad < 13 años
    - Testear rechazo de altura fuera de rango
    - Testear rechazo de peso fuera de rango
    - _Requisitos: 3.6, 3.7, 3.8_

- [ ] 4. Checkpoint — Verificar que todos los tests pasen
  - Asegurar que todos los tests de Auth_Service y Profile_Service pasen. Consultar al usuario si surgen dudas.

- [ ] 5. Implementar Workout_Engine (backend)
  - [ ] 5.1 Implementar catálogo de ejercicios y generación de rutinas
    - Crear `GET /exercises` con filtros por grupo muscular y equipamiento
    - Crear `POST /workouts/generate` con lógica de selección de tipo de rutina (Full Body / PPL / Upper-Lower / Cardio)
    - Implementar reglas de selección: días disponibles, objetivo, nivel de experiencia (sección 3.3 del diseño)
    - Soportar configuración de super-sets (`superset_group_id` en `PLAN_EXERCISES`)
    - Crear `GET /workouts/plan` para obtener el plan activo
    - _Requisitos: 4.1, 4.2, 4.3, 4.6, 4.7_

  - [ ]* 5.2 Escribir tests de propiedad para selección de rutina
    - **Propiedad 4: Principiante siempre recibe Full Body independientemente de los días disponibles**
    - **Valida: Requisito 4.1**
    - **Propiedad 5: Objetivo ENDURANCE siempre produce Cardio puro**
    - **Valida: Requisito 4.1**
    - **Propiedad 6: Rutina sin equipamiento contiene únicamente ejercicios de peso corporal**
    - **Valida: Requisitos 4.6, 4.7**

  - [ ] 5.3 Implementar sesiones de entrenamiento y SerieLog
    - Crear `POST /workouts/sessions`, `PUT /workouts/sessions/:id`, `POST /workouts/sessions/:id/complete`
    - Crear `POST /workouts/series` para registrar cada serie (peso, reps, timestamp)
    - Calcular volumen total (kg × reps) y duración al completar sesión
    - Detectar y registrar PRs en `PERSONAL_RECORDS`; marcar `is_pr = true` en `SERIE_LOGS`
    - Crear `GET /workouts/sessions` (historial) y `GET /workouts/prs`
    - _Requisitos: 5.3, 5.4, 5.5, 4.5_

  - [ ]* 5.4 Escribir tests unitarios para cálculo de volumen y detección de PRs
    - Testear cálculo de volumen total
    - Testear detección correcta de PR (nuevo máximo de peso × reps)
    - _Requisitos: 5.4, 5.5, 4.5_

  - [ ] 5.5 Implementar Sobrecarga_Progresiva
    - Al iniciar sesión, verificar si la sesión anterior tuvo 100% de series y reps completadas
    - Aplicar incremento: +2.5 kg para ejercicios de aislamiento, +5 kg para compuestos
    - Actualizar `weight_kg` en `PLAN_EXERCISES` para la siguiente sesión
    - _Requisitos: 4.4_

  - [ ]* 5.6 Escribir tests de propiedad para Sobrecarga_Progresiva
    - **Propiedad 7: Incremento de carga solo ocurre cuando completion_rate = 100%**
    - **Valida: Requisito 4.4**
    - **Propiedad 8: Ejercicio compuesto recibe incremento ≥ ejercicio de aislamiento**
    - **Valida: Requisito 4.4**

- [ ] 6. Implementar Nutrition_Service (backend)
  - [ ] 6.1 Implementar búsqueda y registro de alimentos
    - Crear `GET /nutrition/search?q=` con integración a USDA FoodData API (< 3 s)
    - Crear `POST /nutrition/barcode` para búsqueda por código de barras
    - Crear `POST /nutrition/daily/meals` y `POST /nutrition/daily/meals/:id/foods`
    - Crear `DELETE /nutrition/daily/meals/:id/foods/:foodId`
    - Crear `GET /nutrition/daily/:date` para obtener el RegistroDiario
    - Actualizar totales de macros en `DAILY_RECORDS` en tiempo real al agregar/eliminar alimentos
    - _Requisitos: 6.1, 6.2, 6.4_

  - [ ] 6.2 Implementar recetas y plan nutricional
    - Crear `GET /nutrition/recipes`, `POST /nutrition/recipes`
    - Calcular macros totales de receta a partir de ingredientes y porciones
    - Crear `POST /nutrition/plan/generate` con cálculo de objetivo calórico según objetivo del usuario
    - Implementar distribución de macros: proteínas 1.6–2.2 g/kg (GAIN_MUSCLE), 1.2–1.6 g/kg (LOSE_WEIGHT)
    - Crear `GET /nutrition/plan` para obtener el plan activo
    - _Requisitos: 6.5, 6.6, 7.1, 7.2, 7.3_

  - [ ]* 6.3 Escribir tests de propiedad para cálculo nutricional
    - **Propiedad 9: Calorías totales de receta = suma de calorías de cada ingrediente × porción**
    - **Valida: Requisito 6.6**
    - **Propiedad 10: Objetivo calórico LOSE_WEIGHT < TDEE < objetivo calórico GAIN_MUSCLE**
    - **Valida: Requisito 7.1**
    - **Propiedad 11: Macros distribuidos cubren exactamente el objetivo calórico (proteínas×4 + carbos×4 + grasas×9 ≈ objetivo_kcal)**
    - **Valida: Requisito 7.2**

  - [ ]* 6.4 Escribir tests unitarios para Nutrition_Service
    - Testear actualización de totales diarios al agregar y eliminar alimentos
    - Testear recálculo del plan al cambiar objetivo o peso
    - _Requisitos: 6.4, 7.4_

- [ ] 7. Implementar AI_Vision_Service y Sleep_Service (backend)
  - [ ] 7.1 Implementar reconocimiento de alimentos por foto
    - Crear `POST /nutrition/photo` que envía imagen a Google Gemini Vision
    - Parsear respuesta de Gemini para extraer alimentos identificados y porciones estimadas
    - Almacenar imagen en Object Storage (S3)
    - Manejar errores de API y timeout con respuesta de fallback
    - _Requisitos: 6.3_

  - [ ] 7.2 Implementar Sleep_Service
    - Crear `POST /sleep` para registro manual (inicio, fin, duración calculada, calidad 1–5 estrellas)
    - Crear `GET /sleep/history`, `GET /sleep/latest`
    - Crear `POST /sleep/wearable` para importar datos de fases (REM, profundo, ligero)
    - Implementar lógica de reducción de intensidad: calidad ≤ 2 estrellas → reducir 20% la carga del día
    - _Requisitos: 8.1, 8.2, 8.3_

  - [ ]* 7.3 Escribir tests unitarios para Sleep_Service
    - Testear cálculo de duración a partir de inicio y fin
    - Testear activación de reducción de intensidad con calidad ≤ 2 estrellas
    - Testear que calidad > 2 estrellas no modifica el plan
    - _Requisitos: 8.1, 8.3_

- [ ] 8. Checkpoint — Verificar que todos los tests pasen
  - Asegurar que todos los tests de Workout_Engine, Nutrition_Service y Sleep_Service pasen. Consultar al usuario si surgen dudas.

- [ ] 9. Implementar Analytics_Service, Wearable_Service y Notification_Service (backend)
  - [ ] 9.1 Implementar Analytics_Service
    - Crear `GET /analytics/dashboard` con resumen diario (calorías restantes, próxima sesión, sueño, mensaje motivacional)
    - Crear `GET /analytics/charts/:type` para cada tipo de gráfico (peso, calorías, heatmap, PRs, IMC, sueño, macros, recuperación)
    - Crear `POST /analytics/export/pdf` que genera reporte mensual en PDF (< 30 s)
    - Cachear resultados de dashboard en Redis con TTL de 2 minutos
    - _Requisitos: 9.1, 9.2, 9.3, 9.5, 14.3_

  - [ ] 9.2 Implementar Wearable_Service
    - Crear `POST /wearables/connect/:provider` para HealthKit, Garmin Connect API y Google Fit API
    - Crear `DELETE /wearables/disconnect/:provider`, `GET /wearables/status`
    - Crear `POST /wearables/sync` para sincronización manual
    - Implementar sincronización automática en background cada 30 minutos
    - Importar: frecuencia cardíaca, pasos, calorías quemadas, sueño, estrés, VO2max
    - Implementar lógica de reintentos: notificar al usuario solo tras 3 fallos consecutivos
    - _Requisitos: 10.1, 10.2, 10.3, 10.5_

  - [ ] 9.3 Implementar Notification_Service
    - Crear `GET /notifications/settings`, `PUT /notifications/settings`
    - Implementar envío de notificaciones via Expo Notifications + Firebase FCM
    - Soportar todos los tipos: recordatorio entrenamiento, hidratación, comida, PR, logro, recuperación baja, pesaje
    - Implementar supresión en modo No Molestar del SO
    - Crear `POST /notifications/calendar/connect` para Google Calendar y Apple Calendar
    - Implementar regla: si no hay comida registrada antes de las 14:00 → enviar recordatorio
    - _Requisitos: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ]* 9.4 Escribir tests unitarios para Analytics_Service
    - Testear cálculo de calorías restantes del día
    - Testear generación de datos para cada tipo de gráfico
    - _Requisitos: 9.1, 9.2_

- [ ] 10. Implementar Sync_Service y Cola_Offline (backend)
  - [ ] 10.1 Implementar endpoints de sincronización
    - Crear `POST /sync/push` para recibir la Cola_Offline del cliente y aplicar escrituras
    - Crear `GET /sync/pull` para enviar cambios del servidor al cliente
    - Crear `GET /sync/status` para estado de sincronización
    - Implementar resolución de conflictos: última escritura gana por `clientTimestamp`
    - Procesar Cola_Offline en menos de 60 segundos al recuperar conexión
    - _Requisitos: 12.2, 12.3, 12.4_

  - [ ]* 10.2 Escribir tests de propiedad para resolución de conflictos
    - **Propiedad 12: Para dos escrituras en conflicto, siempre prevalece la de mayor clientTimestamp**
    - **Valida: Requisito 12.4**
    - **Propiedad 13: Procesar la Cola_Offline es idempotente (procesar dos veces produce el mismo resultado)**
    - **Valida: Requisito 12.3**

- [ ] 11. Checkpoint — Verificar que todos los tests de backend pasen
  - Ejecutar suite completa de tests del backend. Asegurar cobertura de todos los servicios. Consultar al usuario si surgen dudas.

- [ ] 12. Implementar almacenamiento local y lógica offline (cliente móvil)
  - [ ] 12.1 Configurar SQLite con expo-sqlite en React Native
    - Crear esquema local con tablas: `users_cache`, `workout_plan_cache`, `sessions_local`, `serie_logs_local`, `foods_cache`, `daily_records_local`, `food_logs_local`, `sleep_records_local`, `offline_queue`
    - Implementar funciones CRUD para cada tabla local
    - Implementar persistencia de sesión cifrada con AES-256 (expo-secure-store)
    - _Requisitos: 1.8, 12.1, 12.5, 13.1_

  - [ ] 12.2 Implementar Cola_Offline en cliente móvil
    - Implementar `OfflineQueueItem` con estructura definida en sección 4.2 del diseño
    - Interceptar escrituras cuando no hay conexión y encolar en `offline_queue` local
    - Detectar recuperación de conexión y disparar `POST /sync/push` automáticamente
    - _Requisitos: 12.2, 12.3_

  - [ ]* 12.3 Escribir tests de propiedad para Cola_Offline en cliente
    - **Propiedad 14: Toda escritura offline queda encolada con clientTimestamp antes de intentar sincronizar**
    - **Valida: Requisito 12.2**

- [ ] 13. Implementar pantallas de autenticación y onboarding (cliente móvil)
  - [ ] 13.1 Implementar pantallas de registro, login y recuperación de contraseña
    - Crear pantallas: `LoginScreen`, `RegisterScreen`, `ForgotPasswordScreen`
    - Integrar Auth0 con `expo-auth-session` para flujo OAuth 2.0 Google
    - Mostrar errores de validación inline y mensajes de bloqueo por intentos fallidos
    - Persistir sesión localmente al autenticarse exitosamente
    - _Requisitos: 1.1, 1.2, 1.4, 1.5, 1.6, 1.8_

  - [ ] 13.2 Implementar flujo de onboarding
    - Crear pantallas secuenciales: objetivo → datos físicos → nivel de experiencia → días disponibles → equipamiento
    - Guardar progreso parcial en SQLite para retomar si el usuario abandona
    - Al completar, disparar generación de plan de entrenamiento y plan nutricional
    - Mostrar indicador de carga mientras se generan los planes (< 10 s)
    - _Requisitos: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 14. Implementar pantallas de perfil y métricas (cliente móvil)
  - Crear `ProfileScreen` con formulario de edición de datos físicos
  - Mostrar IMC, TMB y TDEE calculados en tiempo real al editar altura/peso
  - Implementar `WeightHistoryScreen` con gráfico de evolución de peso (Victory Native)
  - Validar rangos de altura y peso con mensajes de error claros
  - Al guardar cambios de objetivo, mostrar confirmación de regeneración de planes
  - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [ ] 15. Implementar pantallas de entrenamiento en vivo (cliente móvil)
  - [ ] 15.1 Implementar pantalla de sesión activa
    - Crear `WorkoutSessionScreen` con lista de ejercicios del día y GIFs demostrativos
    - Implementar temporizador de descanso que inicia automáticamente al registrar una serie
    - Mantener pantalla encendida durante sesión activa (`expo-keep-awake`)
    - Registrar cada serie con peso, reps y timestamp; actualizar UI en tiempo real
    - Guardar estado de sesión en SQLite para reanudar si la app se cierra
    - _Requisitos: 5.1, 5.2, 5.3, 5.6, 5.7_

  - [ ] 15.2 Implementar resumen de sesión y notificación de PR
    - Crear `SessionSummaryScreen` con duración, volumen total, ejercicios completados y PRs rotos
    - Mostrar animación/sonido al romper un PR durante la sesión
    - Sincronizar sesión completada con backend (o encolar si offline)
    - _Requisitos: 5.4, 5.5_

- [ ] 16. Implementar pantallas de nutrición (cliente móvil)
  - [ ] 16.1 Implementar registro de alimentos
    - Crear `NutritionDailyScreen` con vista de comidas del día y totales de macros
    - Implementar búsqueda de alimentos con debounce (< 3 s desde USDA o caché local)
    - Implementar escáner de código de barras con `expo-barcode-scanner`
    - Implementar captura de foto con `expo-camera` y envío a AI_Vision_Service
    - Deshabilitar reconocimiento por foto cuando no hay conexión
    - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.7_

  - [ ] 16.2 Implementar recetas y plan nutricional
    - Crear `RecipesScreen` para ver y crear recetas con ingredientes
    - Crear `NutritionPlanScreen` con objetivo calórico y distribución de macros
    - Mostrar progreso diario de macros con gráfico donut (Victory Native)
    - _Requisitos: 6.5, 6.6, 7.1, 7.2, 7.3_

- [ ] 17. Implementar pantallas de sueño, wearables y notificaciones (cliente móvil)
  - [ ] 17.1 Implementar registro de sueño
    - Crear `SleepLogScreen` con selector de hora inicio/fin y calificación de calidad (1–5 estrellas)
    - Mostrar historial de sueño con gráfico de barras semanal (Victory Native)
    - _Requisitos: 8.1, 8.2_

  - [ ] 17.2 Implementar integración con wearables
    - Crear `WearablesScreen` con estado de conexión por proveedor (HealthKit, Garmin, Google Fit)
    - Implementar flujo de conexión/desconexión por proveedor
    - Mostrar última sincronización y datos importados
    - _Requisitos: 10.1, 10.2, 10.3, 10.4_

  - [ ] 17.3 Implementar configuración de notificaciones
    - Crear `NotificationSettingsScreen` con toggles por tipo de notificación y selector de horario
    - Implementar conexión con Google Calendar / Apple Calendar
    - _Requisitos: 11.1, 11.2, 11.4_

- [ ] 18. Implementar Dashboard y Analytics (cliente móvil)
  - Crear `DashboardScreen` con resumen diario: calorías restantes, próxima sesión, sueño, hidratación, mensaje motivacional
  - Implementar todos los gráficos con Victory Native: evolución de peso (línea), calorías vs objetivo (barras), heatmap de entrenamiento, progreso de PRs (línea), evolución de IMC (línea), sueño semanal (barras), macros (donut), recuperación muscular (radar)
  - Mostrar gráficos con datos locales cuando no hay conexión
  - Implementar exportación de reporte PDF mensual
  - Actualizar dashboard en < 2 s al navegar a la pantalla principal
  - _Requisitos: 9.1, 9.2, 9.3, 9.4, 9.5, 14.3_

- [ ] 19. Checkpoint — Verificar que la app móvil funciona correctamente
  - Ejecutar suite de tests del cliente móvil. Verificar flujos principales: auth, onboarding, entrenamiento, nutrición, sueño, dashboard. Consultar al usuario si surgen dudas.

- [ ] 20. Implementar versión web PWA (React)
  - [ ] 20.1 Configurar proyecto React PWA con Service Worker
    - Inicializar proyecto React con Vite + TypeScript
    - Configurar Service Worker para caché offline de assets y datos
    - Configurar IndexedDB con la misma estructura de tablas locales que SQLite (sección 4.3 del diseño)
    - Implementar Cola_Offline en IndexedDB con la misma lógica que el cliente móvil
    - _Requisitos: 12.1, 12.2, 12.5_

  - [ ] 20.2 Implementar pantallas web con Recharts
    - Reutilizar lógica de negocio del paquete `shared`
    - Implementar todas las pantallas equivalentes a la versión móvil
    - Usar Recharts para todos los gráficos (equivalente a Victory Native)
    - Implementar navegación completa por teclado en todos los formularios e interacciones
    - _Requisitos: 9.2, 14.1, 15.4_

- [ ] 21. Implementar accesibilidad, i18n, modo oscuro y rendimiento
  - [ ] 21.1 Implementar accesibilidad WCAG 2.1 AA
    - Agregar `aria-label` o equivalente nativo en todos los elementos interactivos
    - Verificar ratio de contraste ≥ 4.5:1 en modo claro y oscuro
    - Implementar navegación por teclado completa en web
    - Implementar soporte para gestos de accesibilidad del SO en móvil
    - _Requisitos: 15.1, 15.2, 15.3, 15.4_

  - [ ] 21.2 Implementar modo oscuro y modo claro
    - Detectar preferencia del SO con `useColorScheme` (móvil) y `prefers-color-scheme` (web)
    - Aplicar tema dinámico en todos los componentes
    - _Requisitos: 14.5_

  - [ ] 21.3 Implementar internacionalización (i18n)
    - Configurar `i18next` con español como idioma principal
    - Extraer todos los strings de la UI a archivos de traducción
    - Estructurar para agregar idiomas adicionales sin cambios en el código
    - _Requisitos: 14.6_

  - [ ] 21.4 Optimizar rendimiento de carga inicial
    - Implementar code splitting y lazy loading de pantallas
    - Optimizar bundle para carga inicial < 3 s en 4G
    - Implementar caché de datos frecuentes en Redis (backend) y almacenamiento local (cliente)
    - _Requisitos: 14.1, 14.2_

- [ ] 22. Implementar seguridad y cumplimiento normativo
  - Implementar cifrado AES-256 para todos los datos en reposo (almacenamiento local y DB)
  - Implementar endpoint `DELETE /users/:id` para eliminación permanente de datos en ≤ 30 días (GDPR)
  - Implementar endpoint `GET /users/:id/export` para exportación de datos en JSON en < 24 h
  - Cifrar tokens de wearables en `WEARABLE_CONNECTIONS` (`access_token_enc`, `refresh_token_enc`)
  - _Requisitos: 13.1, 13.2, 13.3, 13.4, 13.5_

- [ ] 23. Checkpoint final — Verificar integración completa y todos los tests
  - Ejecutar suite completa de tests (backend + móvil + web). Verificar que todos los requisitos estén cubiertos. Consultar al usuario si surgen dudas.

---

## Notas

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia requisitos específicos para trazabilidad completa
- Los checkpoints garantizan validación incremental antes de avanzar al siguiente módulo
- Los tests de propiedad validan invariantes matemáticos críticos (cálculos de métricas, nutrición, sincronización)
- Los tests unitarios validan casos específicos y condiciones de error
- El paquete `shared` centraliza tipos TypeScript y utilidades para evitar duplicación entre móvil, web y backend
