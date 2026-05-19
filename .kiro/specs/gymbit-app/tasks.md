# Plan de ImplementaciÃ³n: GymBit

## VisiÃ³n General

ImplementaciÃ³n incremental de GymBit como plataforma fitness multiplataforma (React Native + Expo para iOS/Android, React PWA para web, Node.js + Express para backend, MySQL como base de datos principal). Cada tarea construye sobre la anterior, comenzando por la infraestructura base y terminando con la integraciÃ³n completa de todos los mÃ³dulos.

**Stack tecnolÃ³gico:** TypeScript Â· React Native + Expo Â· React PWA Â· Node.js + Express Â· MySQL Â· Redis Â· Auth0 Â· SQLite (mobile) Â· IndexedDB (web)

---

## Tareas

- [x] 1. Configurar infraestructura base del proyecto
  - Inicializar monorepo con workspaces: `packages/mobile` (Expo), `packages/web` (React PWA), `packages/backend` (Express), `packages/shared` (tipos y utilidades comunes)
  - Configurar TypeScript estricto en todos los paquetes con `tsconfig.json` compartido
  - Configurar ESLint + Prettier con reglas comunes
  - Crear esquema inicial de MySQL con todas las tablas del modelo de datos (secciÃ³n 4.1 del diseÃ±o)
  - Configurar migraciones con `mysql2` + `knex` o `prisma migrate`
  - Configurar variables de entorno con validaciÃ³n (`zod` + `dotenv`)
  - _Requisitos: 13.1, 13.2, 14.1_

- [x] 2. Implementar Auth_Service (backend)
  - [x] 2.1 Implementar endpoints de autenticaciÃ³n con Auth0
    - Crear `POST /auth/register`, `POST /auth/login`, `POST /auth/callback` (OAuth 2.0 Google)
    - Implementar `POST /auth/refresh`, `POST /auth/logout`
    - Implementar `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/verify-email/:token`
    - Configurar bcrypt con cost factor â‰¥ 12 para contraseÃ±as locales
    - Generar JWT firmado con RS256, expiraciÃ³n 24 h; refresh token rotativo, expiraciÃ³n 30 dÃ­as
    - Implementar rate limiting con Redis: 5 intentos fallidos â†’ bloqueo 15 min
    - _Requisitos: 1.1, 1.2, 1.3, 1.5, 1.6, 1.9, 1.10, 13.6_

  - [x] 2.2 Escribir tests unitarios para Auth_Service
    - Testear flujo de registro, login, refresh y logout
    - Testear bloqueo por intentos fallidos (rate limiting)
    - Testear expiraciÃ³n y rotaciÃ³n de tokens
    - _Requisitos: 1.6, 1.7, 13.6_

  - [x] 2.3 Implementar middleware de autenticaciÃ³n para API Gateway
    - Validar JWT en cada request protegido
    - Propagar `userId` al contexto de cada servicio
    - Configurar HTTPS/TLS 1.2+ en Express
    - _Requisitos: 1.10, 13.2_

- [ ] 3. Implementar Profile_Service (backend)
  - [x] 3.1 Implementar endpoints de perfil y mÃ©tricas
    - Crear `GET /profile`, `PUT /profile`, `POST /profile/weight`, `GET /profile/weight/history`, `GET /profile/metrics`
    - Implementar validaciones: altura 100â€“250 cm, peso 30â€“300 kg, edad mÃ­nima 13 aÃ±os
    - Implementar cÃ¡lculo de IMC con 2 decimales de precisiÃ³n
    - Implementar TMB con fÃ³rmula Mifflin-St Jeor (hombre/mujer) y TDEE con factores de actividad
    - Persistir historial de peso con timestamp en `WEIGHT_HISTORY`
    - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 3.2 Escribir tests de propiedad para cÃ¡lculos de mÃ©tricas
    - **Propiedad 1: IMC siempre positivo y acotado para entradas vÃ¡lidas**
    - **Valida: Requisito 3.4**
    - **Propiedad 2: TMB hombre > TMB mujer para mismos parÃ¡metros fÃ­sicos**
    - **Valida: Requisito 3.5**
    - **Propiedad 3: TDEE = TMB Ã— factor, factor âˆˆ {1.2, 1.375, 1.55, 1.725, 1.9}**
    - **Valida: Requisito 3.5**

  - [x] 3.3 Escribir tests unitarios para validaciones de perfil
    - Testear rechazo de edad < 13 aÃ±os
    - Testear rechazo de altura fuera de rango
    - Testear rechazo de peso fuera de rango
    - _Requisitos: 3.6, 3.7, 3.8_

- [ ] 4. Checkpoint â€” Verificar que todos los tests pasen
  - Asegurar que todos los tests de Auth_Service y Profile_Service pasen. Consultar al usuario si surgen dudas.

- [ ] 5. Implementar Workout_Engine (backend)
  - [ ] 5.1 Implementar catÃ¡logo de ejercicios y generaciÃ³n de rutinas
    - Crear `GET /exercises` con filtros por grupo muscular y equipamiento
    - Crear `POST /workouts/generate` con lÃ³gica de selecciÃ³n de tipo de rutina (Full Body / PPL / Upper-Lower / Cardio)
    - Implementar reglas de selecciÃ³n: dÃ­as disponibles, objetivo, nivel de experiencia (secciÃ³n 3.3 del diseÃ±o)
    - Soportar configuraciÃ³n de super-sets (`superset_group_id` en `PLAN_EXERCISES`)
    - Crear `GET /workouts/plan` para obtener el plan activo
    - _Requisitos: 4.1, 4.2, 4.3, 4.6, 4.7_

  - [ ] 5.2 Escribir tests de propiedad para selecciÃ³n de rutina
    - **Propiedad 4: Principiante siempre recibe Full Body independientemente de los dÃ­as disponibles**
    - **Valida: Requisito 4.1**
    - **Propiedad 5: Objetivo ENDURANCE siempre produce Cardio puro**
    - **Valida: Requisito 4.1**
    - **Propiedad 6: Rutina sin equipamiento contiene Ãºnicamente ejercicios de peso corporal**
    - **Valida: Requisitos 4.6, 4.7**

  - [ ] 5.3 Implementar sesiones de entrenamiento y SerieLog
    - Crear `POST /workouts/sessions`, `PUT /workouts/sessions/:id`, `POST /workouts/sessions/:id/complete`
    - Crear `POST /workouts/series` para registrar cada serie (peso, reps, timestamp)
    - Calcular volumen total (kg Ã— reps) y duraciÃ³n al completar sesiÃ³n
    - Detectar y registrar PRs en `PERSONAL_RECORDS`; marcar `is_pr = true` en `SERIE_LOGS`
    - Crear `GET /workouts/sessions` (historial) y `GET /workouts/prs`
    - _Requisitos: 5.3, 5.4, 5.5, 4.5_

  - [ ] 5.4 Escribir tests unitarios para cÃ¡lculo de volumen y detecciÃ³n de PRs
    - Testear cÃ¡lculo de volumen total
    - Testear detecciÃ³n correcta de PR (nuevo mÃ¡ximo de peso Ã— reps)
    - _Requisitos: 5.4, 5.5, 4.5_

  - [ ] 5.5 Implementar Sobrecarga_Progresiva
    - Al iniciar sesiÃ³n, verificar si la sesiÃ³n anterior tuvo 100% de series y reps completadas
    - Aplicar incremento: +2.5 kg para ejercicios de aislamiento, +5 kg para compuestos
    - Actualizar `weight_kg` en `PLAN_EXERCISES` para la siguiente sesiÃ³n
    - _Requisitos: 4.4_

  - [ ] 5.6 Escribir tests de propiedad para Sobrecarga_Progresiva
    - **Propiedad 7: Incremento de carga solo ocurre cuando completion_rate = 100%**
    - **Valida: Requisito 4.4**
    - **Propiedad 8: Ejercicio compuesto recibe incremento â‰¥ ejercicio de aislamiento**
    - **Valida: Requisito 4.4**

- [ ] 6. Implementar Nutrition_Service (backend)
  - [ ] 6.1 Implementar bÃºsqueda y registro de alimentos
    - Crear `GET /nutrition/search?q=` con integraciÃ³n a USDA FoodData API (< 3 s)
    - Crear `POST /nutrition/barcode` para bÃºsqueda por cÃ³digo de barras
    - Crear `POST /nutrition/daily/meals` y `POST /nutrition/daily/meals/:id/foods`
    - Crear `DELETE /nutrition/daily/meals/:id/foods/:foodId`
    - Crear `GET /nutrition/daily/:date` para obtener el RegistroDiario
    - Actualizar totales de macros en `DAILY_RECORDS` en tiempo real al agregar/eliminar alimentos
    - _Requisitos: 6.1, 6.2, 6.4_

  - [ ] 6.2 Implementar recetas y plan nutricional
    - Crear `GET /nutrition/recipes`, `POST /nutrition/recipes`
    - Calcular macros totales de receta a partir de ingredientes y porciones
    - Crear `POST /nutrition/plan/generate` con cÃ¡lculo de objetivo calÃ³rico segÃºn objetivo del usuario
    - Implementar distribuciÃ³n de macros: proteÃ­nas 1.6â€“2.2 g/kg (GAIN_MUSCLE), 1.2â€“1.6 g/kg (LOSE_WEIGHT)
    - Crear `GET /nutrition/plan` para obtener el plan activo
    - _Requisitos: 6.5, 6.6, 7.1, 7.2, 7.3_

  - [ ] 6.3 Escribir tests de propiedad para cÃ¡lculo nutricional
    - **Propiedad 9: CalorÃ­as totales de receta = suma de calorÃ­as de cada ingrediente Ã— porciÃ³n**
    - **Valida: Requisito 6.6**
    - **Propiedad 10: Objetivo calÃ³rico LOSE_WEIGHT < TDEE < objetivo calÃ³rico GAIN_MUSCLE**
    - **Valida: Requisito 7.1**
    - **Propiedad 11: Macros distribuidos cubren exactamente el objetivo calÃ³rico (proteÃ­nasÃ—4 + carbosÃ—4 + grasasÃ—9 â‰ˆ objetivo_kcal)**
    - **Valida: Requisito 7.2**

  - [ ] 6.4 Escribir tests unitarios para Nutrition_Service
    - Testear actualizaciÃ³n de totales diarios al agregar y eliminar alimentos
    - Testear recÃ¡lculo del plan al cambiar objetivo o peso
    - _Requisitos: 6.4, 7.4_

- [ ] 7. Implementar AI_Vision_Service y Sleep_Service (backend)
  - [ ] 7.1 Implementar reconocimiento de alimentos por foto
    - Crear `POST /nutrition/photo` que envÃ­a imagen a Google Gemini Vision
    - Parsear respuesta de Gemini para extraer alimentos identificados y porciones estimadas
    - Almacenar imagen en Object Storage (S3)
    - Manejar errores de API y timeout con respuesta de fallback
    - _Requisitos: 6.3_

  - [ ] 7.2 Implementar Sleep_Service
    - Crear `POST /sleep` para registro manual (inicio, fin, duraciÃ³n calculada, calidad 1â€“5 estrellas)
    - Crear `GET /sleep/history`, `GET /sleep/latest`
    - Crear `POST /sleep/wearable` para importar datos de fases (REM, profundo, ligero)
    - Implementar lÃ³gica de reducciÃ³n de intensidad: calidad â‰¤ 2 estrellas â†’ reducir 20% la carga del dÃ­a
    - _Requisitos: 8.1, 8.2, 8.3_

  - [ ] 7.3 Escribir tests unitarios para Sleep_Service
    - Testear cÃ¡lculo de duraciÃ³n a partir de inicio y fin
    - Testear activaciÃ³n de reducciÃ³n de intensidad con calidad â‰¤ 2 estrellas
    - Testear que calidad > 2 estrellas no modifica el plan
    - _Requisitos: 8.1, 8.3_

- [ ] 8. Checkpoint â€” Verificar que todos los tests pasen
  - Asegurar que todos los tests de Workout_Engine, Nutrition_Service y Sleep_Service pasen. Consultar al usuario si surgen dudas.

- [ ] 9. Implementar Analytics_Service, Wearable_Service y Notification_Service (backend)
  - [ ] 9.1 Implementar Analytics_Service
    - Crear `GET /analytics/dashboard` con resumen diario (calorÃ­as restantes, prÃ³xima sesiÃ³n, sueÃ±o, mensaje motivacional)
    - Crear `GET /analytics/charts/:type` para cada tipo de grÃ¡fico (peso, calorÃ­as, heatmap, PRs, IMC, sueÃ±o, macros, recuperaciÃ³n)
    - Crear `POST /analytics/export/pdf` que genera reporte mensual en PDF (< 30 s)
    - Cachear resultados de dashboard en Redis con TTL de 2 minutos
    - _Requisitos: 9.1, 9.2, 9.3, 9.5, 14.3_

  - [ ] 9.2 Implementar Wearable_Service
    - Crear `POST /wearables/connect/:provider` para HealthKit, Garmin Connect API y Google Fit API
    - Crear `DELETE /wearables/disconnect/:provider`, `GET /wearables/status`
    - Crear `POST /wearables/sync` para sincronizaciÃ³n manual
    - Implementar sincronizaciÃ³n automÃ¡tica en background cada 30 minutos
    - Importar: frecuencia cardÃ­aca, pasos, calorÃ­as quemadas, sueÃ±o, estrÃ©s, VO2max
    - Implementar lÃ³gica de reintentos: notificar al usuario solo tras 3 fallos consecutivos
    - _Requisitos: 10.1, 10.2, 10.3, 10.5_

  - [ ] 9.3 Implementar Notification_Service
    - Crear `GET /notifications/settings`, `PUT /notifications/settings`
    - Implementar envÃ­o de notificaciones via Expo Notifications + Firebase FCM
    - Soportar todos los tipos: recordatorio entrenamiento, hidrataciÃ³n, comida, PR, logro, recuperaciÃ³n baja, pesaje
    - Implementar supresiÃ³n en modo No Molestar del SO
    - Crear `POST /notifications/calendar/connect` para Google Calendar y Apple Calendar
    - Implementar regla: si no hay comida registrada antes de las 14:00 â†’ enviar recordatorio
    - _Requisitos: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ] 9.4 Escribir tests unitarios para Analytics_Service
    - Testear cÃ¡lculo de calorÃ­as restantes del dÃ­a
    - Testear generaciÃ³n de datos para cada tipo de grÃ¡fico
    - _Requisitos: 9.1, 9.2_

- [ ] 10. Implementar Sync_Service y Cola_Offline (backend)
  - [ ] 10.1 Implementar endpoints de sincronizaciÃ³n
    - Crear `POST /sync/push` para recibir la Cola_Offline del cliente y aplicar escrituras
    - Crear `GET /sync/pull` para enviar cambios del servidor al cliente
    - Crear `GET /sync/status` para estado de sincronizaciÃ³n
    - Implementar resoluciÃ³n de conflictos: Ãºltima escritura gana por `clientTimestamp`
    - Procesar Cola_Offline en menos de 60 segundos al recuperar conexiÃ³n
    - _Requisitos: 12.2, 12.3, 12.4_

  - [ ] 10.2 Escribir tests de propiedad para resoluciÃ³n de conflictos
    - **Propiedad 12: Para dos escrituras en conflicto, siempre prevalece la de mayor clientTimestamp**
    - **Valida: Requisito 12.4**
    - **Propiedad 13: Procesar la Cola_Offline es idempotente (procesar dos veces produce el mismo resultado)**
    - **Valida: Requisito 12.3**

- [ ] 11. Checkpoint â€” Verificar que todos los tests de backend pasen
  - Ejecutar suite completa de tests del backend. Asegurar cobertura de todos los servicios. Consultar al usuario si surgen dudas.

- [ ] 12. Implementar almacenamiento local y lÃ³gica offline (cliente mÃ³vil)
  - [ ] 12.1 Configurar SQLite con expo-sqlite en React Native
    - Crear esquema local con tablas: `users_cache`, `workout_plan_cache`, `sessions_local`, `serie_logs_local`, `foods_cache`, `daily_records_local`, `food_logs_local`, `sleep_records_local`, `offline_queue`
    - Implementar funciones CRUD para cada tabla local
    - Implementar persistencia de sesiÃ³n cifrada con AES-256 (expo-secure-store)
    - _Requisitos: 1.8, 12.1, 12.5, 13.1_

  - [ ] 12.2 Implementar Cola_Offline en cliente mÃ³vil
    - Implementar `OfflineQueueItem` con estructura definida en secciÃ³n 4.2 del diseÃ±o
    - Interceptar escrituras cuando no hay conexiÃ³n y encolar en `offline_queue` local
    - Detectar recuperaciÃ³n de conexiÃ³n y disparar `POST /sync/push` automÃ¡ticamente
    - _Requisitos: 12.2, 12.3_

  - [ ] 12.3 Escribir tests de propiedad para Cola_Offline en cliente
    - **Propiedad 14: Toda escritura offline queda encolada con clientTimestamp antes de intentar sincronizar**
    - **Valida: Requisito 12.2**

- [ ] 13. Implementar pantallas de autenticaciÃ³n y onboarding (cliente mÃ³vil)
  - [ ] 13.1 Implementar pantallas de registro, login y recuperaciÃ³n de contraseÃ±a
    - Crear pantallas: `LoginScreen`, `RegisterScreen`, `ForgotPasswordScreen`
    - Integrar Auth0 con `expo-auth-session` para flujo OAuth 2.0 Google
    - Mostrar errores de validaciÃ³n inline y mensajes de bloqueo por intentos fallidos
    - Persistir sesiÃ³n localmente al autenticarse exitosamente
    - _Requisitos: 1.1, 1.2, 1.4, 1.5, 1.6, 1.8_

  - [ ] 13.2 Implementar flujo de onboarding
    - Crear pantallas secuenciales: objetivo â†’ datos fÃ­sicos â†’ nivel de experiencia â†’ dÃ­as disponibles â†’ equipamiento
    - Guardar progreso parcial en SQLite para retomar si el usuario abandona
    - Al completar, disparar generaciÃ³n de plan de entrenamiento y plan nutricional
    - Mostrar indicador de carga mientras se generan los planes (< 10 s)
    - _Requisitos: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 14. Implementar pantallas de perfil y mÃ©tricas (cliente mÃ³vil)
  - Crear `ProfileScreen` con formulario de ediciÃ³n de datos fÃ­sicos
  - Mostrar IMC, TMB y TDEE calculados en tiempo real al editar altura/peso
  - Implementar `WeightHistoryScreen` con grÃ¡fico de evoluciÃ³n de peso (Victory Native)
  - Validar rangos de altura y peso con mensajes de error claros
  - Al guardar cambios de objetivo, mostrar confirmaciÃ³n de regeneraciÃ³n de planes
  - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [ ] 15. Implementar pantallas de entrenamiento en vivo (cliente mÃ³vil)
  - [ ] 15.1 Implementar pantalla de sesiÃ³n activa
    - Crear `WorkoutSessionScreen` con lista de ejercicios del dÃ­a y GIFs demostrativos
    - Implementar temporizador de descanso que inicia automÃ¡ticamente al registrar una serie
    - Mantener pantalla encendida durante sesiÃ³n activa (`expo-keep-awake`)
    - Registrar cada serie con peso, reps y timestamp; actualizar UI en tiempo real
    - Guardar estado de sesiÃ³n en SQLite para reanudar si la app se cierra
    - _Requisitos: 5.1, 5.2, 5.3, 5.6, 5.7_

  - [ ] 15.2 Implementar resumen de sesiÃ³n y notificaciÃ³n de PR
    - Crear `SessionSummaryScreen` con duraciÃ³n, volumen total, ejercicios completados y PRs rotos
    - Mostrar animaciÃ³n/sonido al romper un PR durante la sesiÃ³n
    - Sincronizar sesiÃ³n completada con backend (o encolar si offline)
    - _Requisitos: 5.4, 5.5_

- [ ] 16. Implementar pantallas de nutriciÃ³n (cliente mÃ³vil)
  - [ ] 16.1 Implementar registro de alimentos
    - Crear `NutritionDailyScreen` con vista de comidas del dÃ­a y totales de macros
    - Implementar bÃºsqueda de alimentos con debounce (< 3 s desde USDA o cachÃ© local)
    - Implementar escÃ¡ner de cÃ³digo de barras con `expo-barcode-scanner`
    - Implementar captura de foto con `expo-camera` y envÃ­o a AI_Vision_Service
    - Deshabilitar reconocimiento por foto cuando no hay conexiÃ³n
    - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.7_

  - [ ] 16.2 Implementar recetas y plan nutricional
    - Crear `RecipesScreen` para ver y crear recetas con ingredientes
    - Crear `NutritionPlanScreen` con objetivo calÃ³rico y distribuciÃ³n de macros
    - Mostrar progreso diario de macros con grÃ¡fico donut (Victory Native)
    - _Requisitos: 6.5, 6.6, 7.1, 7.2, 7.3_

- [ ] 17. Implementar pantallas de sueÃ±o, wearables y notificaciones (cliente mÃ³vil)
  - [ ] 17.1 Implementar registro de sueÃ±o
    - Crear `SleepLogScreen` con selector de hora inicio/fin y calificaciÃ³n de calidad (1â€“5 estrellas)
    - Mostrar historial de sueÃ±o con grÃ¡fico de barras semanal (Victory Native)
    - _Requisitos: 8.1, 8.2_

  - [ ] 17.2 Implementar integraciÃ³n con wearables
    - Crear `WearablesScreen` con estado de conexiÃ³n por proveedor (HealthKit, Garmin, Google Fit)
    - Implementar flujo de conexiÃ³n/desconexiÃ³n por proveedor
    - Mostrar Ãºltima sincronizaciÃ³n y datos importados
    - _Requisitos: 10.1, 10.2, 10.3, 10.4_

  - [ ] 17.3 Implementar configuraciÃ³n de notificaciones
    - Crear `NotificationSettingsScreen` con toggles por tipo de notificaciÃ³n y selector de horario
    - Implementar conexiÃ³n con Google Calendar / Apple Calendar
    - _Requisitos: 11.1, 11.2, 11.4_

- [ ] 18. Implementar Dashboard y Analytics (cliente mÃ³vil)
  - Crear `DashboardScreen` con resumen diario: calorÃ­as restantes, prÃ³xima sesiÃ³n, sueÃ±o, hidrataciÃ³n, mensaje motivacional
  - Implementar todos los grÃ¡ficos con Victory Native: evoluciÃ³n de peso (lÃ­nea), calorÃ­as vs objetivo (barras), heatmap de entrenamiento, progreso de PRs (lÃ­nea), evoluciÃ³n de IMC (lÃ­nea), sueÃ±o semanal (barras), macros (donut), recuperaciÃ³n muscular (radar)
  - Mostrar grÃ¡ficos con datos locales cuando no hay conexiÃ³n
  - Implementar exportaciÃ³n de reporte PDF mensual
  - Actualizar dashboard en < 2 s al navegar a la pantalla principal
  - _Requisitos: 9.1, 9.2, 9.3, 9.4, 9.5, 14.3_

- [ ] 19. Checkpoint â€” Verificar que la app mÃ³vil funciona correctamente
  - Ejecutar suite de tests del cliente mÃ³vil. Verificar flujos principales: auth, onboarding, entrenamiento, nutriciÃ³n, sueÃ±o, dashboard. Consultar al usuario si surgen dudas.

- [ ] 20. Implementar versiÃ³n web PWA (React)
  - [ ] 20.1 Configurar proyecto React PWA con Service Worker
    - Inicializar proyecto React con Vite + TypeScript
    - Configurar Service Worker para cachÃ© offline de assets y datos
    - Configurar IndexedDB con la misma estructura de tablas locales que SQLite (secciÃ³n 4.3 del diseÃ±o)
    - Implementar Cola_Offline en IndexedDB con la misma lÃ³gica que el cliente mÃ³vil
    - _Requisitos: 12.1, 12.2, 12.5_

  - [ ] 20.2 Implementar pantallas web con Recharts
    - Reutilizar lÃ³gica de negocio del paquete `shared`
    - Implementar todas las pantallas equivalentes a la versiÃ³n mÃ³vil
    - Usar Recharts para todos los grÃ¡ficos (equivalente a Victory Native)
    - Implementar navegaciÃ³n completa por teclado en todos los formularios e interacciones
    - _Requisitos: 9.2, 14.1, 15.4_

- [ ] 21. Implementar accesibilidad, i18n, modo oscuro y rendimiento
  - [ ] 21.1 Implementar accesibilidad WCAG 2.1 AA
    - Agregar `aria-label` o equivalente nativo en todos los elementos interactivos
    - Verificar ratio de contraste â‰¥ 4.5:1 en modo claro y oscuro
    - Implementar navegaciÃ³n por teclado completa en web
    - Implementar soporte para gestos de accesibilidad del SO en mÃ³vil
    - _Requisitos: 15.1, 15.2, 15.3, 15.4_

  - [ ] 21.2 Implementar modo oscuro y modo claro
    - Detectar preferencia del SO con `useColorScheme` (mÃ³vil) y `prefers-color-scheme` (web)
    - Aplicar tema dinÃ¡mico en todos los componentes
    - _Requisitos: 14.5_

  - [ ] 21.3 Implementar internacionalizaciÃ³n (i18n)
    - Configurar `i18next` con espaÃ±ol como idioma principal
    - Extraer todos los strings de la UI a archivos de traducciÃ³n
    - Estructurar para agregar idiomas adicionales sin cambios en el cÃ³digo
    - _Requisitos: 14.6_

  - [ ] 21.4 Optimizar rendimiento de carga inicial
    - Implementar code splitting y lazy loading de pantallas
    - Optimizar bundle para carga inicial < 3 s en 4G
    - Implementar cachÃ© de datos frecuentes en Redis (backend) y almacenamiento local (cliente)
    - _Requisitos: 14.1, 14.2_

- [ ] 22. Implementar seguridad y cumplimiento normativo
  - Implementar cifrado AES-256 para todos los datos en reposo (almacenamiento local y DB)
  - Implementar endpoint `DELETE /users/:id` para eliminaciÃ³n permanente de datos en â‰¤ 30 dÃ­as (GDPR)
  - Implementar endpoint `GET /users/:id/export` para exportaciÃ³n de datos en JSON en < 24 h
  - Cifrar tokens de wearables en `WEARABLE_CONNECTIONS` (`access_token_enc`, `refresh_token_enc`)
  - _Requisitos: 13.1, 13.2, 13.3, 13.4, 13.5_

- [ ] 23. Checkpoint final â€” Verificar integraciÃ³n completa y todos los tests
  - Ejecutar suite completa de tests (backend + mÃ³vil + web). Verificar que todos los requisitos estÃ©n cubiertos. Consultar al usuario si surgen dudas.

---

## Notas

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP mÃ¡s rÃ¡pido
- Cada tarea referencia requisitos especÃ­ficos para trazabilidad completa
- Los checkpoints garantizan validaciÃ³n incremental antes de avanzar al siguiente mÃ³dulo
- Los tests de propiedad validan invariantes matemÃ¡ticos crÃ­ticos (cÃ¡lculos de mÃ©tricas, nutriciÃ³n, sincronizaciÃ³n)
- Los tests unitarios validan casos especÃ­ficos y condiciones de error
- El paquete `shared` centraliza tipos TypeScript y utilidades para evitar duplicaciÃ³n entre mÃ³vil, web y backend


