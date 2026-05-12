# Documento de Requisitos — GymBit

## Introducción

GymBit es una aplicación multiplataforma (iOS, Android, Web PWA) de gestión fitness personal que acompaña al usuario en su transformación física de forma inteligente. Integra registro de perfil, generación de rutinas de ejercicio y planes nutricionales personalizados con IA, integración con wearables y seguimiento cronológico de progreso con visualizaciones claras. La aplicación opera en modo online y offline completo, priorizando la privacidad del usuario y el cumplimiento normativo (GDPR / Ley 1581 de Colombia).

---

## Glosario

- **GymBit**: El sistema de gestión fitness personal descrito en este documento.
- **Usuario**: Persona registrada en GymBit con edad mínima de 13 años.
- **Auth_Service**: Componente responsable de autenticación, autorización y gestión de sesiones.
- **Profile_Service**: Componente responsable de gestión del perfil y datos físicos del usuario.
- **Workout_Engine**: Componente responsable de generación, gestión y ejecución de rutinas de ejercicio.
- **Nutrition_Service**: Componente responsable del registro y planificación nutricional.
- **Sleep_Service**: Componente responsable del registro y análisis del ciclo de sueño.
- **Analytics_Service**: Componente responsable del dashboard, gráficos y exportación de reportes.
- **Wearable_Service**: Componente responsable de la integración con dispositivos wearables.
- **Notification_Service**: Componente responsable del envío y gestión de notificaciones.
- **Sync_Service**: Componente responsable de la sincronización offline/online y resolución de conflictos.
- **AI_Vision_Service**: Componente que utiliza Google Gemini Vision para reconocimiento de alimentos por foto.
- **Sesión**: Una unidad de entrenamiento compuesta por uno o más ejercicios.
- **SerieLog**: Registro de una serie individual dentro de un ejercicio (peso, repeticiones, tiempo).
- **RegistroDiario**: Registro nutricional de un día completo, compuesto por comidas y AlimentoLogs.
- **AlimentoLog**: Registro de un alimento consumido en una comida específica.
- **PR (Personal Record)**: Marca personal del usuario en un ejercicio determinado.
- **IMC**: Índice de Masa Corporal = peso(kg) / altura(m)².
- **TMB**: Tasa Metabólica Basal calculada con la fórmula Mifflin-St Jeor.
- **TDEE**: Total Daily Energy Expenditure = TMB × factor de actividad.
- **Sobrecarga_Progresiva**: Incremento sistemático de carga (+2.5 kg a +5 kg) cuando el usuario completa todas las series y repeticiones objetivo.
- **Cola_Offline**: Estructura de datos que almacena escrituras pendientes de sincronización cuando el dispositivo no tiene conexión.
- **Wearable**: Dispositivo de seguimiento de actividad física compatible (Apple Watch, Garmin, Wear OS).

---

## Requisitos

---

### Requisito 1: Registro e Inicio de Sesión

**User Story:** Como usuario nuevo, quiero registrarme y autenticarme de forma rápida y segura, para acceder a mis datos fitness desde cualquier dispositivo.

#### Criterios de Aceptación

1. WHEN el usuario selecciona "Continuar con Google", THE Auth_Service SHALL completar el flujo OAuth 2.0 y crear la sesión en un máximo de 2 interacciones del usuario.
2. WHEN el usuario completa el formulario de registro con correo y contraseña válidos, THE Auth_Service SHALL crear la cuenta y enviar el correo de verificación en menos de 60 segundos.
3. WHEN el usuario hace clic en el enlace de verificación de correo, THE Auth_Service SHALL activar la cuenta y redirigir al onboarding en menos de 5 segundos.
4. WHEN el usuario completa el flujo de registro con correo, THE Auth_Service SHALL permitir el acceso completo a la aplicación en menos de 3 minutos desde el inicio del registro.
5. WHEN el usuario solicita recuperación de contraseña con un correo registrado, THE Auth_Service SHALL enviar un enlace de restablecimiento válido por 30 minutos en menos de 60 segundos.
6. IF el usuario proporciona credenciales incorrectas 5 veces consecutivas, THEN THE Auth_Service SHALL bloquear el intento de inicio de sesión por 15 minutos y notificar al usuario.
7. WHILE el usuario tiene una sesión activa, THE Auth_Service SHALL mantener la sesión válida sin requerir re-autenticación durante al menos 30 días.
8. WHILE el dispositivo no tiene conexión a internet, THE Auth_Service SHALL permitir el acceso a la aplicación usando la sesión almacenada localmente.
9. THE Auth_Service SHALL encriptar todas las contraseñas almacenadas usando bcrypt con un factor de coste mínimo de 12.
10. THE Auth_Service SHALL transmitir todas las credenciales exclusivamente sobre HTTPS con TLS 1.2 o superior.

---

### Requisito 2: Onboarding Post-Registro

**User Story:** Como usuario recién registrado, quiero completar un proceso de configuración inicial guiado, para que GymBit genere mi primer plan personalizado automáticamente.

#### Criterios de Aceptación

1. WHEN el usuario completa el registro exitosamente, THE GymBit SHALL iniciar el flujo de onboarding en la secuencia: objetivo principal → datos físicos → nivel de experiencia → días disponibles → equipamiento disponible.
2. WHEN el usuario completa todos los pasos del onboarding, THE Workout_Engine SHALL generar el primer plan de entrenamiento personalizado en menos de 10 segundos.
3. WHEN el usuario completa todos los pasos del onboarding, THE Nutrition_Service SHALL calcular el TDEE y generar el primer plan nutricional en menos de 10 segundos.
4. IF el usuario abandona el onboarding antes de completarlo, THEN THE GymBit SHALL guardar el progreso parcial y permitir retomarlo en el siguiente inicio de sesión.
5. THE GymBit SHALL permitir al usuario omitir pasos opcionales del onboarding y completarlos posteriormente desde el perfil.

---

### Requisito 3: Gestión del Perfil de Usuario

**User Story:** Como usuario, quiero gestionar mi perfil con mis datos físicos y objetivos, para que GymBit calcule mis métricas personalizadas correctamente.

#### Criterios de Aceptación

1. THE Profile_Service SHALL aceptar y almacenar los siguientes campos obligatorios: nombre, fecha de nacimiento, género, altura (100–250 cm), peso (30–300 kg) y objetivo principal.
2. THE Profile_Service SHALL aceptar y almacenar los siguientes campos opcionales: condiciones médicas, nivel de experiencia y días disponibles para entrenar.
3. WHEN el usuario actualiza su peso, THE Profile_Service SHALL registrar el nuevo valor junto con la fecha y hora de la actualización en el historial de peso.
4. WHEN el usuario guarda datos de perfil con altura y peso válidos, THE Profile_Service SHALL calcular y almacenar el IMC con dos decimales de precisión.
5. WHEN el usuario guarda datos de perfil completos, THE Profile_Service SHALL calcular la TMB usando la fórmula Mifflin-St Jeor y el TDEE multiplicando la TMB por el factor de actividad correspondiente al nivel de experiencia.
6. IF el usuario ingresa una fecha de nacimiento que corresponde a una edad menor de 13 años, THEN THE Profile_Service SHALL rechazar el registro y mostrar un mensaje indicando el requisito de edad mínima.
7. IF el usuario ingresa una altura fuera del rango 100–250 cm, THEN THE Profile_Service SHALL rechazar el valor y solicitar una corrección dentro del rango válido.
8. IF el usuario ingresa un peso fuera del rango 30–300 kg, THEN THE Profile_Service SHALL rechazar el valor y solicitar una corrección dentro del rango válido.
9. WHEN el usuario cambia su objetivo principal, THE Workout_Engine SHALL regenerar el plan de entrenamiento activo en menos de 10 segundos.
10. WHEN el usuario cambia su objetivo principal, THE Nutrition_Service SHALL recalcular el TDEE y actualizar el plan nutricional en menos de 10 segundos.

---

### Requisito 4: Generación de Rutinas de Ejercicio

**User Story:** Como usuario, quiero que GymBit genere rutinas de ejercicio personalizadas según mi objetivo, nivel y disponibilidad, para entrenar de forma efectiva y estructurada.

#### Criterios de Aceptación

1. WHEN el Workout_Engine genera una rutina, THE Workout_Engine SHALL seleccionar el tipo de rutina (Full Body, PPL, Upper/Lower, Cardio puro) basándose en el objetivo, nivel de experiencia y días disponibles del usuario.
2. THE Workout_Engine SHALL incluir en cada ejercicio generado: nombre, grupos musculares trabajados, número de series, número de repeticiones objetivo, tiempo de descanso en segundos y referencia a GIF o video demostrativo.
3. THE Workout_Engine SHALL soportar la configuración de super-sets, agrupando dos o más ejercicios consecutivos sin descanso entre ellos.
4. WHEN el Workout_Engine detecta que el usuario completó todas las series y repeticiones objetivo de un ejercicio en la sesión anterior, THE Workout_Engine SHALL aplicar Sobrecarga_Progresiva incrementando la carga entre 2.5 kg y 5 kg en la siguiente sesión.
5. THE Workout_Engine SHALL mantener un historial de PRs por ejercicio, registrando el peso máximo levantado, las repeticiones y la fecha.
6. WHEN el usuario solicita una rutina con equipamiento específico, THE Workout_Engine SHALL generar ejercicios exclusivamente compatibles con el equipamiento declarado por el usuario.
7. IF el usuario no tiene equipamiento disponible, THEN THE Workout_Engine SHALL generar una rutina compuesta únicamente por ejercicios con peso corporal.

---

### Requisito 5: Modo Entrenamiento en Vivo

**User Story:** Como usuario, quiero registrar mi entrenamiento en tiempo real con temporizadores y contadores, para llevar un seguimiento preciso de cada serie y ejercicio.

#### Criterios de Aceptación

1. WHILE el usuario está en una sesión de entrenamiento activa, THE Workout_Engine SHALL mantener la pantalla del dispositivo encendida sin apagado automático.
2. WHILE el usuario está en una sesión de entrenamiento activa, THE Workout_Engine SHALL mostrar un temporizador de descanso que inicia automáticamente al registrar una serie completada.
3. WHEN el usuario registra una serie, THE Workout_Engine SHALL almacenar el peso utilizado, las repeticiones realizadas y la marca de tiempo en el SerieLog correspondiente.
4. WHEN el usuario completa todos los ejercicios de una sesión, THE Workout_Engine SHALL calcular y mostrar el resumen de la sesión incluyendo: duración total, volumen total (kg × repeticiones), ejercicios completados y PRs rotos.
5. WHEN el usuario rompe un PR durante una sesión, THE Workout_Engine SHALL notificar al usuario de forma inmediata con una confirmación visual y sonora.
6. IF el usuario cierra la aplicación durante una sesión activa, THEN THE Workout_Engine SHALL guardar el estado de la sesión y permitir reanudarla al volver a abrir la aplicación.
7. WHILE el dispositivo no tiene conexión a internet durante una sesión activa, THE Workout_Engine SHALL continuar registrando todos los datos localmente y sincronizarlos al recuperar la conexión.

---

### Requisito 6: Registro Nutricional

**User Story:** Como usuario, quiero registrar mis comidas diarias de múltiples formas, para llevar un control preciso de mi ingesta calórica y de macronutrientes.

#### Criterios de Aceptación

1. WHEN el usuario busca un alimento por nombre, THE Nutrition_Service SHALL consultar la base de datos USDA y mostrar resultados en menos de 3 segundos.
2. WHEN el usuario escanea un código de barras, THE Nutrition_Service SHALL identificar el producto y mostrar su información nutricional en menos de 5 segundos.
3. WHEN el usuario fotografía un alimento o plato, THE AI_Vision_Service SHALL identificar los alimentos presentes y estimar las porciones con una precisión mínima del 85% en condiciones de iluminación adecuada.
4. WHEN el usuario agrega un alimento al RegistroDiario, THE Nutrition_Service SHALL actualizar los totales de calorías, proteínas, carbohidratos y grasas del día en tiempo real.
5. THE Nutrition_Service SHALL permitir al usuario guardar recetas personalizadas compuestas por múltiples ingredientes con sus porciones.
6. WHEN el usuario registra una receta guardada, THE Nutrition_Service SHALL calcular y registrar los macronutrientes totales de la receta según las porciones indicadas.
7. WHILE el dispositivo no tiene conexión a internet, THE Nutrition_Service SHALL permitir el registro de alimentos usando la base de datos local almacenada en caché, sin acceso a la funcionalidad de reconocimiento por foto.
8. WHEN el dispositivo recupera la conexión a internet, THE Sync_Service SHALL sincronizar todos los registros nutricionales pendientes en la Cola_Offline.

---

### Requisito 7: Plan Nutricional Personalizado

**User Story:** Como usuario, quiero recibir un plan nutricional basado en mi TDEE y objetivo, para alcanzar mis metas de composición corporal de forma estructurada.

#### Criterios de Aceptación

1. WHEN el Nutrition_Service genera un plan nutricional, THE Nutrition_Service SHALL calcular el objetivo calórico diario ajustando el TDEE según el objetivo del usuario: déficit de 300–500 kcal para LOSE_WEIGHT, superávit de 200–400 kcal para GAIN_MUSCLE y GAIN_WEIGHT, y TDEE exacto para MAINTENANCE y ENDURANCE.
2. WHEN el Nutrition_Service genera un plan nutricional, THE Nutrition_Service SHALL distribuir los macronutrientes diarios según el objetivo: proteínas 1.6–2.2 g/kg de peso corporal para GAIN_MUSCLE, proteínas 1.2–1.6 g/kg para LOSE_WEIGHT, con el resto distribuido entre carbohidratos y grasas.
3. WHEN el Nutrition_Service genera un plan nutricional, THE Nutrition_Service SHALL sugerir al menos 3 recetas diarias compatibles con los objetivos calóricos y de macronutrientes del usuario.
4. WHEN el usuario actualiza su peso o cambia su objetivo, THE Nutrition_Service SHALL recalcular el plan nutricional en menos de 10 segundos.

---

### Requisito 8: Registro del Ciclo de Sueño

**User Story:** Como usuario, quiero registrar mis horas de sueño y su calidad, para que GymBit ajuste mi plan de entrenamiento según mi nivel de recuperación.

#### Criterios de Aceptación

1. WHEN el usuario registra manualmente su sueño, THE Sleep_Service SHALL almacenar la hora de inicio, hora de fin, duración calculada y calificación de calidad en escala de 1 a 5 estrellas.
2. WHERE un wearable compatible está conectado, THE Sleep_Service SHALL importar automáticamente los datos de fases de sueño (REM, profundo, ligero) del dispositivo.
3. WHEN el Sleep_Service detecta que la calidad de sueño del usuario fue de 2 estrellas o menos en las últimas 24 horas, THE Workout_Engine SHALL reducir la intensidad de la sesión del día en un 20% respecto al plan original.
4. THE Analytics_Service SHALL mostrar la correlación entre la calidad de sueño y el rendimiento en entrenamiento en un gráfico de línea con datos de los últimos 30 días.

---

### Requisito 9: Dashboard y Visualizaciones

**User Story:** Como usuario, quiero ver un resumen visual de mi progreso fitness en un dashboard centralizado, para tomar decisiones informadas sobre mi entrenamiento y nutrición.

#### Criterios de Aceptación

1. THE Analytics_Service SHALL mostrar en el resumen diario: calorías restantes del día, próxima sesión programada, nivel de hidratación, horas de sueño de la noche anterior y un mensaje motivacional.
2. THE Analytics_Service SHALL mostrar los siguientes gráficos: evolución de peso (línea), calorías consumidas vs objetivo (barras), frecuencia de entrenamiento (heatmap tipo GitHub), progreso de PR por ejercicio (línea), evolución de IMC (línea), promedio de sueño semanal (barras), distribución de macronutrientes (donut) y recuperación muscular por grupo (gauge o radar).
3. WHEN el usuario solicita exportar el reporte mensual, THE Analytics_Service SHALL generar y descargar un archivo PDF con el resumen del mes en menos de 30 segundos.
4. WHILE el dispositivo no tiene conexión a internet, THE Analytics_Service SHALL mostrar los gráficos usando los datos ya sincronizados localmente.
5. THE Analytics_Service SHALL actualizar todos los gráficos del dashboard en menos de 2 segundos al navegar a la pantalla principal.

---

### Requisito 10: Integración con Wearables

**User Story:** Como usuario con wearable, quiero sincronizar automáticamente mis datos de actividad y salud, para enriquecer mi seguimiento fitness sin intervención manual.

#### Criterios de Aceptación

1. THE Wearable_Service SHALL soportar la integración con Apple Watch mediante HealthKit, Garmin mediante Garmin Connect API y dispositivos Wear OS mediante Google Fit API.
2. WHEN el Wearable_Service ejecuta una sincronización, THE Wearable_Service SHALL importar los siguientes datos disponibles: frecuencia cardíaca, pasos diarios, calorías quemadas, datos de sueño, nivel de estrés y VO2max.
3. THE Wearable_Service SHALL ejecutar sincronizaciones automáticas en segundo plano cada 30 minutos mientras el dispositivo tiene conexión a internet.
4. THE GymBit SHALL funcionar con todas sus funcionalidades principales sin requerir un wearable conectado.
5. IF la sincronización con un wearable falla, THEN THE Wearable_Service SHALL reintentar la sincronización en el siguiente ciclo de 30 minutos y notificar al usuario solo después de 3 fallos consecutivos.

---

### Requisito 11: Notificaciones Inteligentes

**User Story:** Como usuario, quiero recibir notificaciones personalizadas y configurables, para mantenerme motivado y en seguimiento de mis hábitos fitness.

#### Criterios de Aceptación

1. THE Notification_Service SHALL enviar los siguientes tipos de notificaciones: recordatorio de entrenamiento, recordatorio de hidratación, recordatorio de registro de comida, alerta de PR roto, alerta de logro o racha, alerta de recuperación baja y recordatorio de pesaje semanal.
2. THE Notification_Service SHALL permitir al usuario activar, desactivar y configurar el horario de cada tipo de notificación de forma independiente.
3. WHILE el dispositivo está en modo No Molestar del sistema operativo, THE Notification_Service SHALL suprimir todas las notificaciones no urgentes de GymBit.
4. WHERE el usuario ha conectado Google Calendar o Apple Calendar, THE Notification_Service SHALL crear eventos de entrenamiento en el calendario seleccionado al programar una sesión.
5. IF el usuario no ha registrado ninguna comida antes de las 14:00 horas del día, THEN THE Notification_Service SHALL enviar un recordatorio de registro de comida.

---

### Requisito 12: Modo Offline y Sincronización

**User Story:** Como usuario, quiero usar GymBit sin conexión a internet, para entrenar y registrar mis datos en cualquier lugar sin interrupciones.

#### Criterios de Aceptación

1. WHILE el dispositivo no tiene conexión a internet, THE GymBit SHALL permitir el acceso completo a: perfil del usuario, rutina del día, modo entrenamiento en vivo, registro de comidas con base de datos local, registro de sueño y gráficos con datos previamente sincronizados.
2. WHILE el dispositivo no tiene conexión a internet, THE Sync_Service SHALL almacenar todas las escrituras del usuario en la Cola_Offline con marca de tiempo.
3. WHEN el dispositivo recupera la conexión a internet, THE Sync_Service SHALL procesar la Cola_Offline y sincronizar todos los datos pendientes en menos de 60 segundos.
4. WHEN el Sync_Service detecta un conflicto entre un dato local y un dato del servidor, THE Sync_Service SHALL resolver el conflicto aplicando la política de última escritura gana, basándose en la marca de tiempo.
5. THE Sync_Service SHALL almacenar los datos offline en SQLite en dispositivos móviles y en IndexedDB en la versión web.

---

### Requisito 13: Seguridad y Privacidad de Datos

**User Story:** Como usuario, quiero que mis datos personales y de salud estén protegidos y gestionados conforme a la normativa vigente, para confiar en que mi información está segura.

#### Criterios de Aceptación

1. THE GymBit SHALL encriptar todos los datos almacenados en reposo usando AES-256.
2. THE GymBit SHALL transmitir todos los datos entre cliente y servidor exclusivamente sobre HTTPS con TLS 1.2 o superior.
3. THE GymBit SHALL cumplir con los requisitos del Reglamento General de Protección de Datos (GDPR) y la Ley 1581 de Colombia para el tratamiento de datos personales.
4. WHEN el usuario solicita la eliminación de su cuenta, THE GymBit SHALL eliminar permanentemente todos los datos personales del usuario en un plazo máximo de 30 días.
5. WHEN el usuario solicita la exportación de sus datos, THE GymBit SHALL generar y entregar un archivo con todos los datos personales del usuario en formato JSON en menos de 24 horas.
6. THE Auth_Service SHALL implementar tokens de acceso con expiración máxima de 24 horas y tokens de refresco con expiración máxima de 30 días.

---

### Requisito 14: Rendimiento y Disponibilidad

**User Story:** Como usuario, quiero que GymBit cargue rápido y funcione de forma estable, para no perder el ritmo de mi entrenamiento por problemas técnicos.

#### Criterios de Aceptación

1. THE GymBit SHALL completar la carga inicial de la aplicación en menos de 3 segundos en una conexión 4G estándar.
2. THE GymBit SHALL mantener una tasa de fallos críticos (crashes) inferior al 0.1% de las sesiones de uso.
3. THE Analytics_Service SHALL renderizar todos los gráficos del dashboard en menos de 2 segundos con hasta 365 días de datos históricos.
4. THE Nutrition_Service SHALL devolver resultados de búsqueda de alimentos en menos de 3 segundos para consultas a la base de datos USDA.
5. THE GymBit SHALL soportar modo oscuro y modo claro, respetando la preferencia del sistema operativo del usuario.
6. THE GymBit SHALL implementar una arquitectura de internacionalización (i18n) que soporte español como idioma principal y permita agregar idiomas adicionales sin cambios estructurales.

---

### Requisito 15: Accesibilidad

**User Story:** Como usuario con necesidades de accesibilidad, quiero que GymBit cumpla con estándares de accesibilidad, para poder usar la aplicación con tecnologías de asistencia.

#### Criterios de Aceptación

1. THE GymBit SHALL cumplir con los criterios de conformidad WCAG 2.1 nivel AA en todas las pantallas de la aplicación web y móvil.
2. THE GymBit SHALL proporcionar etiquetas de accesibilidad (aria-label o equivalente nativo) en todos los elementos interactivos de la interfaz.
3. THE GymBit SHALL mantener un ratio de contraste mínimo de 4.5:1 entre texto y fondo en todos los modos de color (claro y oscuro).
4. THE GymBit SHALL soportar navegación completa mediante teclado en la versión web y mediante gestos de accesibilidad del sistema operativo en la versión móvil.
