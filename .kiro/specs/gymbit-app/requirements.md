# Documento de Requisitos â€” GymBit

## IntroducciÃ³n

GymBit es una aplicaciÃ³n multiplataforma (iOS, Android, Web PWA) de gestiÃ³n fitness personal que acompaÃ±a al usuario en su transformaciÃ³n fÃ­sica de forma inteligente. Integra registro de perfil, generaciÃ³n de rutinas de ejercicio y planes nutricionales personalizados con IA, integraciÃ³n con wearables y seguimiento cronolÃ³gico de progreso con visualizaciones claras. La aplicaciÃ³n opera en modo online y offline completo, priorizando la privacidad del usuario y el cumplimiento normativo (GDPR / Ley 1581 de Colombia).

---

## Glosario

- **GymBit**: El sistema de gestiÃ³n fitness personal descrito en este documento.
- **Usuario**: Persona registrada en GymBit con edad mÃ­nima de 13 aÃ±os.
- **Auth_Service**: Componente responsable de autenticaciÃ³n, autorizaciÃ³n y gestiÃ³n de sesiones.
- **Profile_Service**: Componente responsable de gestiÃ³n del perfil y datos fÃ­sicos del usuario.
- **Workout_Engine**: Componente responsable de generaciÃ³n, gestiÃ³n y ejecuciÃ³n de rutinas de ejercicio.
- **Nutrition_Service**: Componente responsable del registro y planificaciÃ³n nutricional.
- **Sleep_Service**: Componente responsable del registro y anÃ¡lisis del ciclo de sueÃ±o.
- **Analytics_Service**: Componente responsable del dashboard, grÃ¡ficos y exportaciÃ³n de reportes.
- **Wearable_Service**: Componente responsable de la integraciÃ³n con dispositivos wearables.
- **Notification_Service**: Componente responsable del envÃ­o y gestiÃ³n de notificaciones.
- **Sync_Service**: Componente responsable de la sincronizaciÃ³n offline/online y resoluciÃ³n de conflictos.
- **AI_Vision_Service**: Componente que utiliza Google Gemini Vision para reconocimiento de alimentos por foto.
- **SesiÃ³n**: Una unidad de entrenamiento compuesta por uno o mÃ¡s ejercicios.
- **SerieLog**: Registro de una serie individual dentro de un ejercicio (peso, repeticiones, tiempo).
- **RegistroDiario**: Registro nutricional de un dÃ­a completo, compuesto por comidas y AlimentoLogs.
- **AlimentoLog**: Registro de un alimento consumido en una comida especÃ­fica.
- **PR (Personal Record)**: Marca personal del usuario en un ejercicio determinado.
- **IMC**: Ãndice de Masa Corporal = peso(kg) / altura(m)Â².
- **TMB**: Tasa MetabÃ³lica Basal calculada con la fÃ³rmula Mifflin-St Jeor.
- **TDEE**: Total Daily Energy Expenditure = TMB Ã— factor de actividad.
- **Sobrecarga_Progresiva**: Incremento sistemÃ¡tico de carga (+2.5 kg a +5 kg) cuando el usuario completa todas las series y repeticiones objetivo.
- **Cola_Offline**: Estructura de datos que almacena escrituras pendientes de sincronizaciÃ³n cuando el dispositivo no tiene conexiÃ³n.
- **Wearable**: Dispositivo de seguimiento de actividad fÃ­sica compatible (Apple Watch, Garmin, Wear OS).

---

## Requisitos

---

### Requisito 1: Registro e Inicio de SesiÃ³n

**User Story:** Como usuario nuevo, quiero registrarme y autenticarme de forma rÃ¡pida y segura, para acceder a mis datos fitness desde cualquier dispositivo.

#### Criterios de AceptaciÃ³n

1. WHEN el usuario selecciona "Continuar con Google", THE Auth_Service SHALL completar el flujo OAuth 2.0 y crear la sesiÃ³n en un mÃ¡ximo de 2 interacciones del usuario.
2. WHEN el usuario completa el formulario de registro con correo y contraseÃ±a vÃ¡lidos, THE Auth_Service SHALL crear la cuenta y enviar el correo de verificaciÃ³n en menos de 60 segundos.
3. WHEN el usuario hace clic en el enlace de verificaciÃ³n de correo, THE Auth_Service SHALL activar la cuenta y redirigir al onboarding en menos de 5 segundos.
4. WHEN el usuario completa el flujo de registro con correo, THE Auth_Service SHALL permitir el acceso completo a la aplicaciÃ³n en menos de 3 minutos desde el inicio del registro.
5. WHEN el usuario solicita recuperaciÃ³n de contraseÃ±a con un correo registrado, THE Auth_Service SHALL enviar un enlace de restablecimiento vÃ¡lido por 30 minutos en menos de 60 segundos.
6. IF el usuario proporciona credenciales incorrectas 5 veces consecutivas, THEN THE Auth_Service SHALL bloquear el intento de inicio de sesiÃ³n por 15 minutos y notificar al usuario.
7. WHILE el usuario tiene una sesiÃ³n activa, THE Auth_Service SHALL mantener la sesiÃ³n vÃ¡lida sin requerir re-autenticaciÃ³n durante al menos 30 dÃ­as.
8. WHILE el dispositivo no tiene conexiÃ³n a internet, THE Auth_Service SHALL permitir el acceso a la aplicaciÃ³n usando la sesiÃ³n almacenada localmente.
9. THE Auth_Service SHALL encriptar todas las contraseÃ±as almacenadas usando bcrypt con un factor de coste mÃ­nimo de 12.
10. THE Auth_Service SHALL transmitir todas las credenciales exclusivamente sobre HTTPS con TLS 1.2 o superior.

---

### Requisito 2: Onboarding Post-Registro

**User Story:** Como usuario reciÃ©n registrado, quiero completar un proceso de configuraciÃ³n inicial guiado, para que GymBit genere mi primer plan personalizado automÃ¡ticamente.

#### Criterios de AceptaciÃ³n

1. WHEN el usuario completa el registro exitosamente, THE GymBit SHALL iniciar el flujo de onboarding en la secuencia: objetivo principal â†’ datos fÃ­sicos â†’ nivel de experiencia â†’ dÃ­as disponibles â†’ equipamiento disponible.
2. WHEN el usuario completa todos los pasos del onboarding, THE Workout_Engine SHALL generar el primer plan de entrenamiento personalizado en menos de 10 segundos.
3. WHEN el usuario completa todos los pasos del onboarding, THE Nutrition_Service SHALL calcular el TDEE y generar el primer plan nutricional en menos de 10 segundos.
4. IF el usuario abandona el onboarding antes de completarlo, THEN THE GymBit SHALL guardar el progreso parcial y permitir retomarlo en el siguiente inicio de sesiÃ³n.
5. THE GymBit SHALL permitir al usuario omitir pasos opcionales del onboarding y completarlos posteriormente desde el perfil.

---

### Requisito 3: GestiÃ³n del Perfil de Usuario

**User Story:** Como usuario, quiero gestionar mi perfil con mis datos fÃ­sicos y objetivos, para que GymBit calcule mis mÃ©tricas personalizadas correctamente.

#### Criterios de AceptaciÃ³n

1. THE Profile_Service SHALL aceptar y almacenar los siguientes campos obligatorios: nombre, fecha de nacimiento, gÃ©nero, altura (100â€“250 cm), peso (30â€“300 kg) y objetivo principal.
2. THE Profile_Service SHALL aceptar y almacenar los siguientes campos opcionales: condiciones mÃ©dicas, nivel de experiencia y dÃ­as disponibles para entrenar.
3. WHEN el usuario actualiza su peso, THE Profile_Service SHALL registrar el nuevo valor junto con la fecha y hora de la actualizaciÃ³n en el historial de peso.
4. WHEN el usuario guarda datos de perfil con altura y peso vÃ¡lidos, THE Profile_Service SHALL calcular y almacenar el IMC con dos decimales de precisiÃ³n.
5. WHEN el usuario guarda datos de perfil completos, THE Profile_Service SHALL calcular la TMB usando la fÃ³rmula Mifflin-St Jeor y el TDEE multiplicando la TMB por el factor de actividad correspondiente al nivel de experiencia.
6. IF el usuario ingresa una fecha de nacimiento que corresponde a una edad menor de 13 aÃ±os, THEN THE Profile_Service SHALL rechazar el registro y mostrar un mensaje indicando el requisito de edad mÃ­nima.
7. IF el usuario ingresa una altura fuera del rango 100â€“250 cm, THEN THE Profile_Service SHALL rechazar el valor y solicitar una correcciÃ³n dentro del rango vÃ¡lido.
8. IF el usuario ingresa un peso fuera del rango 30â€“300 kg, THEN THE Profile_Service SHALL rechazar el valor y solicitar una correcciÃ³n dentro del rango vÃ¡lido.
9. WHEN el usuario cambia su objetivo principal, THE Workout_Engine SHALL regenerar el plan de entrenamiento activo en menos de 10 segundos.
10. WHEN el usuario cambia su objetivo principal, THE Nutrition_Service SHALL recalcular el TDEE y actualizar el plan nutricional en menos de 10 segundos.

---

### Requisito 4: GeneraciÃ³n de Rutinas de Ejercicio

**User Story:** Como usuario, quiero que GymBit genere rutinas de ejercicio personalizadas segÃºn mi objetivo, nivel y disponibilidad, para entrenar de forma efectiva y estructurada.

#### Criterios de AceptaciÃ³n

1. WHEN el Workout_Engine genera una rutina, THE Workout_Engine SHALL seleccionar el tipo de rutina (Full Body, PPL, Upper/Lower, Cardio puro) basÃ¡ndose en el objetivo, nivel de experiencia y dÃ­as disponibles del usuario.
2. THE Workout_Engine SHALL incluir en cada ejercicio generado: nombre, grupos musculares trabajados, nÃºmero de series, nÃºmero de repeticiones objetivo, tiempo de descanso en segundos y referencia a GIF o video demostrativo.
3. THE Workout_Engine SHALL soportar la configuraciÃ³n de super-sets, agrupando dos o mÃ¡s ejercicios consecutivos sin descanso entre ellos.
4. WHEN el Workout_Engine detecta que el usuario completÃ³ todas las series y repeticiones objetivo de un ejercicio en la sesiÃ³n anterior, THE Workout_Engine SHALL aplicar Sobrecarga_Progresiva incrementando la carga entre 2.5 kg y 5 kg en la siguiente sesiÃ³n.
5. THE Workout_Engine SHALL mantener un historial de PRs por ejercicio, registrando el peso mÃ¡ximo levantado, las repeticiones y la fecha.
6. WHEN el usuario solicita una rutina con equipamiento especÃ­fico, THE Workout_Engine SHALL generar ejercicios exclusivamente compatibles con el equipamiento declarado por el usuario.
7. IF el usuario no tiene equipamiento disponible, THEN THE Workout_Engine SHALL generar una rutina compuesta Ãºnicamente por ejercicios con peso corporal.

---

### Requisito 5: Modo Entrenamiento en Vivo

**User Story:** Como usuario, quiero registrar mi entrenamiento en tiempo real con temporizadores y contadores, para llevar un seguimiento preciso de cada serie y ejercicio.

#### Criterios de AceptaciÃ³n

1. WHILE el usuario estÃ¡ en una sesiÃ³n de entrenamiento activa, THE Workout_Engine SHALL mantener la pantalla del dispositivo encendida sin apagado automÃ¡tico.
2. WHILE el usuario estÃ¡ en una sesiÃ³n de entrenamiento activa, THE Workout_Engine SHALL mostrar un temporizador de descanso que inicia automÃ¡ticamente al registrar una serie completada.
3. WHEN el usuario registra una serie, THE Workout_Engine SHALL almacenar el peso utilizado, las repeticiones realizadas y la marca de tiempo en el SerieLog correspondiente.
4. WHEN el usuario completa todos los ejercicios de una sesiÃ³n, THE Workout_Engine SHALL calcular y mostrar el resumen de la sesiÃ³n incluyendo: duraciÃ³n total, volumen total (kg Ã— repeticiones), ejercicios completados y PRs rotos.
5. WHEN el usuario rompe un PR durante una sesiÃ³n, THE Workout_Engine SHALL notificar al usuario de forma inmediata con una confirmaciÃ³n visual y sonora.
6. IF el usuario cierra la aplicaciÃ³n durante una sesiÃ³n activa, THEN THE Workout_Engine SHALL guardar el estado de la sesiÃ³n y permitir reanudarla al volver a abrir la aplicaciÃ³n.
7. WHILE el dispositivo no tiene conexiÃ³n a internet durante una sesiÃ³n activa, THE Workout_Engine SHALL continuar registrando todos los datos localmente y sincronizarlos al recuperar la conexiÃ³n.

---

### Requisito 6: Registro Nutricional

**User Story:** Como usuario, quiero registrar mis comidas diarias de mÃºltiples formas, para llevar un control preciso de mi ingesta calÃ³rica y de macronutrientes.

#### Criterios de AceptaciÃ³n

1. WHEN el usuario busca un alimento por nombre, THE Nutrition_Service SHALL consultar la base de datos USDA y mostrar resultados en menos de 3 segundos.
2. WHEN el usuario escanea un cÃ³digo de barras, THE Nutrition_Service SHALL identificar el producto y mostrar su informaciÃ³n nutricional en menos de 5 segundos.
3. WHEN el usuario fotografÃ­a un alimento o plato, THE AI_Vision_Service SHALL identificar los alimentos presentes y estimar las porciones con una precisiÃ³n mÃ­nima del 85% en condiciones de iluminaciÃ³n adecuada.
4. WHEN el usuario agrega un alimento al RegistroDiario, THE Nutrition_Service SHALL actualizar los totales de calorÃ­as, proteÃ­nas, carbohidratos y grasas del dÃ­a en tiempo real.
5. THE Nutrition_Service SHALL permitir al usuario guardar recetas personalizadas compuestas por mÃºltiples ingredientes con sus porciones.
6. WHEN el usuario registra una receta guardada, THE Nutrition_Service SHALL calcular y registrar los macronutrientes totales de la receta segÃºn las porciones indicadas.
7. WHILE el dispositivo no tiene conexiÃ³n a internet, THE Nutrition_Service SHALL permitir el registro de alimentos usando la base de datos local almacenada en cachÃ©, sin acceso a la funcionalidad de reconocimiento por foto.
8. WHEN el dispositivo recupera la conexiÃ³n a internet, THE Sync_Service SHALL sincronizar todos los registros nutricionales pendientes en la Cola_Offline.

---

### Requisito 7: Plan Nutricional Personalizado

**User Story:** Como usuario, quiero recibir un plan nutricional basado en mi TDEE y objetivo, para alcanzar mis metas de composiciÃ³n corporal de forma estructurada.

#### Criterios de AceptaciÃ³n

1. WHEN el Nutrition_Service genera un plan nutricional, THE Nutrition_Service SHALL calcular el objetivo calÃ³rico diario ajustando el TDEE segÃºn el objetivo del usuario: dÃ©ficit de 300â€“500 kcal para LOSE_WEIGHT, superÃ¡vit de 200â€“400 kcal para GAIN_MUSCLE y GAIN_WEIGHT, y TDEE exacto para MAINTENANCE y ENDURANCE.
2. WHEN el Nutrition_Service genera un plan nutricional, THE Nutrition_Service SHALL distribuir los macronutrientes diarios segÃºn el objetivo: proteÃ­nas 1.6â€“2.2 g/kg de peso corporal para GAIN_MUSCLE, proteÃ­nas 1.2â€“1.6 g/kg para LOSE_WEIGHT, con el resto distribuido entre carbohidratos y grasas.
3. WHEN el Nutrition_Service genera un plan nutricional, THE Nutrition_Service SHALL sugerir al menos 3 recetas diarias compatibles con los objetivos calÃ³ricos y de macronutrientes del usuario.
4. WHEN el usuario actualiza su peso o cambia su objetivo, THE Nutrition_Service SHALL recalcular el plan nutricional en menos de 10 segundos.

---

### Requisito 8: Registro del Ciclo de SueÃ±o

**User Story:** Como usuario, quiero registrar mis horas de sueÃ±o y su calidad, para que GymBit ajuste mi plan de entrenamiento segÃºn mi nivel de recuperaciÃ³n.

#### Criterios de AceptaciÃ³n

1. WHEN el usuario registra manualmente su sueÃ±o, THE Sleep_Service SHALL almacenar la hora de inicio, hora de fin, duraciÃ³n calculada y calificaciÃ³n de calidad en escala de 1 a 5 estrellas.
2. WHERE un wearable compatible estÃ¡ conectado, THE Sleep_Service SHALL importar automÃ¡ticamente los datos de fases de sueÃ±o (REM, profundo, ligero) del dispositivo.
3. WHEN el Sleep_Service detecta que la calidad de sueÃ±o del usuario fue de 2 estrellas o menos en las Ãºltimas 24 horas, THE Workout_Engine SHALL reducir la intensidad de la sesiÃ³n del dÃ­a en un 20% respecto al plan original.
4. THE Analytics_Service SHALL mostrar la correlaciÃ³n entre la calidad de sueÃ±o y el rendimiento en entrenamiento en un grÃ¡fico de lÃ­nea con datos de los Ãºltimos 30 dÃ­as.

---

### Requisito 9: Dashboard y Visualizaciones

**User Story:** Como usuario, quiero ver un resumen visual de mi progreso fitness en un dashboard centralizado, para tomar decisiones informadas sobre mi entrenamiento y nutriciÃ³n.

#### Criterios de AceptaciÃ³n

1. THE Analytics_Service SHALL mostrar en el resumen diario: calorÃ­as restantes del dÃ­a, prÃ³xima sesiÃ³n programada, nivel de hidrataciÃ³n, horas de sueÃ±o de la noche anterior y un mensaje motivacional.
2. THE Analytics_Service SHALL mostrar los siguientes grÃ¡ficos: evoluciÃ³n de peso (lÃ­nea), calorÃ­as consumidas vs objetivo (barras), frecuencia de entrenamiento (heatmap tipo GitHub), progreso de PR por ejercicio (lÃ­nea), evoluciÃ³n de IMC (lÃ­nea), promedio de sueÃ±o semanal (barras), distribuciÃ³n de macronutrientes (donut) y recuperaciÃ³n muscular por grupo (gauge o radar).
3. WHEN el usuario solicita exportar el reporte mensual, THE Analytics_Service SHALL generar y descargar un archivo PDF con el resumen del mes en menos de 30 segundos.
4. WHILE el dispositivo no tiene conexiÃ³n a internet, THE Analytics_Service SHALL mostrar los grÃ¡ficos usando los datos ya sincronizados localmente.
5. THE Analytics_Service SHALL actualizar todos los grÃ¡ficos del dashboard en menos de 2 segundos al navegar a la pantalla principal.

---

### Requisito 10: IntegraciÃ³n con Wearables

**User Story:** Como usuario con wearable, quiero sincronizar automÃ¡ticamente mis datos de actividad y salud, para enriquecer mi seguimiento fitness sin intervenciÃ³n manual.

#### Criterios de AceptaciÃ³n

1. THE Wearable_Service SHALL soportar la integraciÃ³n con Apple Watch mediante HealthKit, Garmin mediante Garmin Connect API y dispositivos Wear OS mediante Google Fit API.
2. WHEN el Wearable_Service ejecuta una sincronizaciÃ³n, THE Wearable_Service SHALL importar los siguientes datos disponibles: frecuencia cardÃ­aca, pasos diarios, calorÃ­as quemadas, datos de sueÃ±o, nivel de estrÃ©s y VO2max.
3. THE Wearable_Service SHALL ejecutar sincronizaciones automÃ¡ticas en segundo plano cada 30 minutos mientras el dispositivo tiene conexiÃ³n a internet.
4. THE GymBit SHALL funcionar con todas sus funcionalidades principales sin requerir un wearable conectado.
5. IF la sincronizaciÃ³n con un wearable falla, THEN THE Wearable_Service SHALL reintentar la sincronizaciÃ³n en el siguiente ciclo de 30 minutos y notificar al usuario solo despuÃ©s de 3 fallos consecutivos.

---

### Requisito 11: Notificaciones Inteligentes

**User Story:** Como usuario, quiero recibir notificaciones personalizadas y configurables, para mantenerme motivado y en seguimiento de mis hÃ¡bitos fitness.

#### Criterios de AceptaciÃ³n

1. THE Notification_Service SHALL enviar los siguientes tipos de notificaciones: recordatorio de entrenamiento, recordatorio de hidrataciÃ³n, recordatorio de registro de comida, alerta de PR roto, alerta de logro o racha, alerta de recuperaciÃ³n baja y recordatorio de pesaje semanal.
2. THE Notification_Service SHALL permitir al usuario activar, desactivar y configurar el horario de cada tipo de notificaciÃ³n de forma independiente.
3. WHILE el dispositivo estÃ¡ en modo No Molestar del sistema operativo, THE Notification_Service SHALL suprimir todas las notificaciones no urgentes de GymBit.
4. WHERE el usuario ha conectado Google Calendar o Apple Calendar, THE Notification_Service SHALL crear eventos de entrenamiento en el calendario seleccionado al programar una sesiÃ³n.
5. IF el usuario no ha registrado ninguna comida antes de las 14:00 horas del dÃ­a, THEN THE Notification_Service SHALL enviar un recordatorio de registro de comida.

---

### Requisito 12: Modo Offline y SincronizaciÃ³n

**User Story:** Como usuario, quiero usar GymBit sin conexiÃ³n a internet, para entrenar y registrar mis datos en cualquier lugar sin interrupciones.

#### Criterios de AceptaciÃ³n

1. WHILE el dispositivo no tiene conexiÃ³n a internet, THE GymBit SHALL permitir el acceso completo a: perfil del usuario, rutina del dÃ­a, modo entrenamiento en vivo, registro de comidas con base de datos local, registro de sueÃ±o y grÃ¡ficos con datos previamente sincronizados.
2. WHILE el dispositivo no tiene conexiÃ³n a internet, THE Sync_Service SHALL almacenar todas las escrituras del usuario en la Cola_Offline con marca de tiempo.
3. WHEN el dispositivo recupera la conexiÃ³n a internet, THE Sync_Service SHALL procesar la Cola_Offline y sincronizar todos los datos pendientes en menos de 60 segundos.
4. WHEN el Sync_Service detecta un conflicto entre un dato local y un dato del servidor, THE Sync_Service SHALL resolver el conflicto aplicando la polÃ­tica de Ãºltima escritura gana, basÃ¡ndose en la marca de tiempo.
5. THE Sync_Service SHALL almacenar los datos offline en SQLite en dispositivos mÃ³viles y en IndexedDB en la versiÃ³n web.

---

### Requisito 13: Seguridad y Privacidad de Datos

**User Story:** Como usuario, quiero que mis datos personales y de salud estÃ©n protegidos y gestionados conforme a la normativa vigente, para confiar en que mi informaciÃ³n estÃ¡ segura.

#### Criterios de AceptaciÃ³n

1. THE GymBit SHALL encriptar todos los datos almacenados en reposo usando AES-256.
2. THE GymBit SHALL transmitir todos los datos entre cliente y servidor exclusivamente sobre HTTPS con TLS 1.2 o superior.
3. THE GymBit SHALL cumplir con los requisitos del Reglamento General de ProtecciÃ³n de Datos (GDPR) y la Ley 1581 de Colombia para el tratamiento de datos personales.
4. WHEN el usuario solicita la eliminaciÃ³n de su cuenta, THE GymBit SHALL eliminar permanentemente todos los datos personales del usuario en un plazo mÃ¡ximo de 30 dÃ­as.
5. WHEN el usuario solicita la exportaciÃ³n de sus datos, THE GymBit SHALL generar y entregar un archivo con todos los datos personales del usuario en formato JSON en menos de 24 horas.
6. THE Auth_Service SHALL implementar tokens de acceso con expiraciÃ³n mÃ¡xima de 24 horas y tokens de refresco con expiraciÃ³n mÃ¡xima de 30 dÃ­as.

---

### Requisito 14: Rendimiento y Disponibilidad

**User Story:** Como usuario, quiero que GymBit cargue rÃ¡pido y funcione de forma estable, para no perder el ritmo de mi entrenamiento por problemas tÃ©cnicos.

#### Criterios de AceptaciÃ³n

1. THE GymBit SHALL completar la carga inicial de la aplicaciÃ³n en menos de 3 segundos en una conexiÃ³n 4G estÃ¡ndar.
2. THE GymBit SHALL mantener una tasa de fallos crÃ­ticos (crashes) inferior al 0.1% de las sesiones de uso.
3. THE Analytics_Service SHALL renderizar todos los grÃ¡ficos del dashboard en menos de 2 segundos con hasta 365 dÃ­as de datos histÃ³ricos.
4. THE Nutrition_Service SHALL devolver resultados de bÃºsqueda de alimentos en menos de 3 segundos para consultas a la base de datos USDA.
5. THE GymBit SHALL soportar modo oscuro y modo claro, respetando la preferencia del sistema operativo del usuario.
6. THE GymBit SHALL implementar una arquitectura de internacionalizaciÃ³n (i18n) que soporte espaÃ±ol como idioma principal y permita agregar idiomas adicionales sin cambios estructurales.

---

### Requisito 15: Accesibilidad

**User Story:** Como usuario con necesidades de accesibilidad, quiero que GymBit cumpla con estÃ¡ndares de accesibilidad, para poder usar la aplicaciÃ³n con tecnologÃ­as de asistencia.

#### Criterios de AceptaciÃ³n

1. THE GymBit SHALL cumplir con los criterios de conformidad WCAG 2.1 nivel AA en todas las pantallas de la aplicaciÃ³n web y mÃ³vil.
2. THE GymBit SHALL proporcionar etiquetas de accesibilidad (aria-label o equivalente nativo) en todos los elementos interactivos de la interfaz.
3. THE GymBit SHALL mantener un ratio de contraste mÃ­nimo de 4.5:1 entre texto y fondo en todos los modos de color (claro y oscuro).
4. THE GymBit SHALL soportar navegaciÃ³n completa mediante teclado en la versiÃ³n web y mediante gestos de accesibilidad del sistema operativo en la versiÃ³n mÃ³vil.

