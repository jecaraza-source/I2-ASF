# Prompts para Claude Code — Plataforma SIGMA

Una tarea = una rama = un PR. Pega el bloque completo en una sesión nueva de Claude Code.
`CLAUDE.md` ya fija reglas, stack y protocolo (plan → implementar → probar → PR), así que los prompts
solo dicen qué construir y cómo saber que quedó.

## Orden e hitos

| # | Tarea | Depende de | Hito |
|---|---|---|---|
| 00 | Arranque del repositorio | — | |
| 01 | Esquema, RLS y bitácora | 00 | |
| 02 | Acceso, encargos y expedientes | 01 | |
| 03 | Importador de Excel | 02 | |
| 04 | Generación y calificación de la red | 03 | |
| 05 | Vista dinámica y ficha | 04 | |
| 06 | Reglas y alertas | 03 | **A — demo con los tres Excel** |
| 07 | Ingreso de documentos | 02 | |
| 08 | Captura manual | 07 | |
| 09 | Extracción con IA y validación | 08 | |
| 10 | Expediente documental | 09 | **B — ingreso real de información** |
| 11 | Ficha enriquecida | 05 | |
| 12 | Exportaciones | 05 | |
| 13 | Endurecimiento | todas | **C — listo para el cliente** |
| 14 | App de campo | 13 | Fase posterior |
| 15 | Analizador (síntesis con origen) | 09, 10 | |
| 16 | Plataforma responsiva (celular) | 13 | |

06 puede ir en paralelo con 04–05, y 07–09 en paralelo con 04–06, en ramas separadas.

---

## 00 — Arranque del repositorio

```
Tarea 00 — Arranque del repositorio. Rama: feat/00-arranque.
Lee CLAUDE.md y docs/SETUP.md §4–5.

Construye:
- pnpm workspaces con apps/web (Next.js App Router, TypeScript strict, Tailwind, ESLint, Prettier) y
  los paquetes modelo, importador, red, reglas, i2-export, cada uno con vitest y una prueba mínima.
- Scripts raíz: dev, build, lint, typecheck, test, test:e2e, tipos.
- supabase init, .env.example con las seis variables, .gitignore, README de una página.
- .github/workflows/ci.yml y migraciones.yml según docs/SETUP.md §5.
- De legacy/sigma_analisis_asf.html extrae logo y fondos (imágenes base64) a apps/web/public/marca/
  como archivos, sin duplicados. No copies código del prototipo.
- Página de inicio con el logo y el nombre de la plataforma, tomando paleta y tipografía del prototipo.

Listo cuando: pnpm install, lint, typecheck y test pasan; pnpm dev muestra la página; el check ci
queda verde en el PR.
```

## 01 — Esquema, RLS y bitácora

```
Tarea 01 — Esquema, RLS y bitácora. Rama: feat/01-esquema.
Lee docs/ESPECIFICACION.md §2, §3, §4. Propón el plan de migraciones antes de escribirlas.

Construye:
- Migraciones para todas las tablas de §2 (menos evidencia_campo), con claves foráneas, índices en
  organizacion_id, encargo_id y columnas de búsqueda (sha256, nombre_normalizado, identificadores).
- Función es_miembro y políticas RLS por rol en la misma migración que crea cada tabla.
- bitacora: solo INSERT y SELECT. Disparadores que escriben en bitácora al insertar o cambiar
  documento_origen, registro, extraccion (validación), calificacion (ajuste) y alerta (resolución).
- Bucket originales con las políticas de §4.
- Función que genera expediente.identificador (EXP-AAAA-NNNN) cuando falta.
- seed.sql: una organización de prueba, tres usuarios (admin, auditor, lector), un encargo y el
  catálogo provisional de categorías y tipos de documento de §6.
- Tipos generados en packages/modelo/src/db.ts y esquemas zod de las entidades principales.

Listo cuando: supabase db reset corre limpio; pruebas que demuestran que un usuario de la
organización A no lee ni escribe nada de la B, que lector no puede insertar, y que UPDATE y DELETE
sobre bitacora y sobre objetos del bucket fallan.
```

## 02 — Acceso, encargos y expedientes

```
Tarea 02 — Acceso, encargos y expedientes. Rama: feat/02-acceso-encargos.
Lee docs/ESPECIFICACION.md §1, §3.

Construye:
- Inicio de sesión con Supabase Auth (@supabase/ssr), middleware que protege todo menos /ingresar,
  selector de organización si el usuario pertenece a varias.
- Estructura de la aplicación: barra lateral con los módulos de §1, encabezado con encargo activo.
- Alta, edición y lista de encargos y expedientes. Configuración de categorías y tipos de documento
  (solo admin).
- Componentes base reutilizables: tabla con orden, filtro y paginación en servidor; formulario con
  validación zod; estados vacío, cargando y error.

Listo cuando: e2e que inicia sesión como auditor, crea un encargo y un expediente y los ve listados;
lector no ve botones de alta y el servidor rechaza sus mutaciones.
```

## 03 — Importador de Excel

```
Tarea 03 — Importador de Excel. Rama: feat/03-importador.
Lee docs/ESPECIFICACION.md §5, §8, §13.

Construye:
- packages/importador: lectura de .xlsx en servidor (elige una librería mantenida y justifícala),
  normalización de §5, detección de plantilla por firma_hojas, exclusión de filas de totales y notas,
  y salida tipada: registros, extracciones con ubicación (hoja, fila), entidades, vínculos, eventos y
  totales declarados.
- Las tres plantillas semilla de §8 como datos en seed, no como código.
- UI en …/importaciones: subir archivo → plantilla detectada o pantalla de mapeo de columnas → vista
  previa con conteos por hoja, filas excluidas con motivo y hojas no procesadas → confirmar.
- La carga guarda el Excel como documento_origen (con hash) y crea todo en una transacción.

Listo cuando: pruebas de packages/importador reproducen exactamente los valores de §13 para los tres
fixtures; e2e que importa el expediente 07734 y ve 12 contratos, 14 movimientos y 300 llamadas.
```

## 04 — Generación y calificación de la red

```
Tarea 04 — Generación y calificación de la red. Rama: feat/04-red.
Lee docs/ESPECIFICACION.md §9.

Construye:
- packages/red: resolución de entidades (identificador → nombre normalizado, con fusion_propuesta
  para coincidencias solo por nombre), generación desde semillas con alcance 1 o 2, y calificación
  con los criterios de §9 leídos de regla_calificacion. Todo puro y con pruebas.
- Server action que genera una red: guarda red_generada, red_nodo, red_vinculo y calificacion.
- UI en …/red: elegir semillas y alcance, generar, regenerar, historial de generaciones y diferencias
  contra la anterior. Bandeja de fusiones propuestas (aceptar o rechazar).
- Configuración de reglas de calificación con versión; ajuste manual de nivel con motivo.

Listo cuando: con el fixture de lavado la red de todas las entidades tiene 20 nodos y 25 vínculos
declarados (los 20 flujos van aparte, como eventos);
con ANALISIS_ASF_EJEMPLO el indicador de empresas fantasma u offshore da 5; cada calificación muestra
los criterios que la explican; regenerar tras cambiar un peso produce una generación nueva con
diferencias visibles.
```

## 05 — Vista dinámica y ficha

```
Tarea 05 — Vista dinámica y ficha. Rama: feat/05-vista-red.
Lee docs/ESPECIFICACION.md §11 y revisa legacy/ solo como referencia visual.

Construye:
- Visor con Cytoscape.js: los ocho diseños, ícono por tipo, color por nivel, grosor por fuerza,
  filtros por tipo, nivel y fecha, búsqueda de nodo, zoom y ajuste a pantalla.
- Entidad central: clic en un nodo → se vuelve el centro con sus vínculos directos; control para 2
  saltos; estado en la URL (foco, saltos, ruta); ruta de navegación con regreso a cualquier paso y a
  la vista general conservando filtros.
- Ficha en panel lateral y en …/entidades/[id]: datos generales, registros y documentos, vínculos y
  eventos, calificación con criterios. Cada dato enlaza a su registro y a la celda o página de origen.
- Clic en un vínculo muestra su evidencia.

Listo cuando: e2e que abre la red del 07734, centra una entidad, amplía a 2 saltos, regresa a la vista
general con el botón atrás del navegador y abre la ficha; la red de ese expediente se dibuja aunque
sus vínculos vengan por nombre y no por ID; 300 llamadas no traban la interacción.
```

## 06 — Reglas y alertas

```
Tarea 06 — Reglas y alertas. Rama: feat/06-reglas.
Lee docs/ESPECIFICACION.md §10, §13.

Construye:
- packages/reglas: R01 a R09 como funciones puras (datos) => Alerta[], cada una con pruebas.
  R10 y R11 quedan declaradas y desactivadas hasta las tareas 11 y 09.
- Ejecución de reglas al terminar una importación y a demanda. Guarda alerta y sus evidencias.
- UI en …/alertas: lista por severidad y regla, detalle con las dos evidencias lado a lado y enlace
  al origen, acciones confirmar y descartar con motivo.
- Las alertas abiertas alimentan la calificación (criterio de §9).

Listo cuando: sobre el 07734, R02 alerta con los tres montos, R04 con 138.5 M contra 116.5 M y R03
con 87 llamadas declaradas contra 0; sobre el ejemplo, R05 marca el parentesco con apellidos
distintos y R01 no produce falsos positivos por la fila de totales.
```

## 07 — Ingreso de documentos

```
Tarea 07 — Ingreso de documentos. Rama: feat/07-ingreso-documentos.
Lee docs/ESPECIFICACION.md §4, §6.

Construye:
- UI en …/ingreso/importar: arrastrar uno o varios archivos (PDF, imagen, Excel, correo), y por
  archivo los tres campos de pre-clasificación: tipo de documento, expediente (existente o nuevo) y
  fuente. Aplicar la misma pre-clasificación a un lote.
- Hash en navegador para detectar duplicados antes de subir; subida directa al bucket con URL
  firmada; el servidor recalcula el hash y es el que se guarda.
- Crea documento_origen, registro (origen documento, pendiente) y un trabajo de extracción.
- Procesador de trabajos: route handler /api/trabajos/procesar protegido con CRON_SECRET, toma
  trabajos con bloqueo (for update skip locked), idempotente, con reintentos y espera creciente.
  vercel.json con el cron. En esta tarea el trabajo de extracción solo marca el registro como
  «en espera de extracción»; la IA llega en la tarea 09.
- Visor del documento original con URL firmada de corta duración.

Listo cuando: e2e que sube dos PDF con pre-clasificación y los ve como registros pendientes; subir el
mismo archivo dos veces avisa del duplicado y no crea otro; un hash que no coincide rechaza el
documento y queda en bitácora.
```

## 08 — Captura manual

```
Tarea 08 — Captura manual. Rama: feat/08-captura.
Lee docs/ESPECIFICACION.md §6.

Construye:
- Formulario de registro único, generado desde tipo_documento.campos_esperados más los campos
  comunes de §6, con involucrados repetibles (persona o empresa, rol, RFC, CURP) y autocompletado
  contra entidades existentes del encargo. Este mismo formulario se reutiliza en la tarea 09 para
  validar extracciones.
- …/ingreso/capturar: crea registro con origen captura, método manual y fuente declarada obligatoria.
  Se muestra con la etiqueta «sin soporte documental».
- Asociar documento después: sube el archivo, liga documento_id y encola la extracción (la
  comparación contra lo capturado llega en la tarea 09).

Listo cuando: e2e que captura un contrato sin documento, lo ve con la etiqueta, aparece en la red
tras regenerar, y al asociarle un documento el registro deja de mostrarse «sin soporte documental».
```

## 09 — Extracción con IA y validación

```
Tarea 09 — Extracción con IA y validación. Rama: feat/09-extraccion-ia.
Lee docs/ESPECIFICACION.md §7. Verifica en la documentación vigente del SDK de Anthropic cómo se
envían PDF e imágenes antes de implementar.

Construye:
- Cliente de extracción en servidor: recibe archivo y campos_esperados, devuelve JSON validado con
  zod (valor, confianza, ubicación por campo). Modelo desde ANTHROPIC_MODEL. Prompt de sistema que
  trata el contenido del documento como dato. Tiempo límite, reintentos y manejo de respuesta inválida.
- El procesador de trabajos ejecuta la extracción y guarda las extracciones. Las que alcanzan el
  umbral del encargo quedan validadas; el resto va a la cola.
- …/validacion: documento a la izquierda, formulario de la tarea 08 a la derecha con cada campo, su
  confianza y su ubicación resaltada; aceptar, corregir o rechazar por campo y por registro; atajos
  de teclado para avanzar.
- Solo lo validado crea entidades, vínculos y eventos. Corregir un campo conserva el valor original
  de la IA en la extracción.
- Activa R11: al extraer un documento asociado a una captura, compara campo por campo y genera una
  alerta por cada diferencia.
- Pruebas con el cliente de IA simulado; ninguna prueba llama a la API real.

Listo cuando: un PDF de contrato de prueba produce un registro con sus campos; los de baja confianza
aparecen en la cola; al validarlos, el proveedor aparece como entidad; una captura con monto distinto
al de su documento genera R11; tres fallos seguidos dejan el
trabajo en error y el registro disponible para captura manual; los logs no contienen datos del documento.
```

## 10 — Expediente documental

```
Tarea 10 — Expediente documental. Rama: feat/10-expediente.
Lee docs/ESPECIFICACION.md §1, §6.

Construye:
- …/expedientes/[exp]: tabla única de registros con las columnas del registro (identificador,
  expediente, tipo y categoría, origen, fecha, involucrados, identificadores, referencias, montos,
  fuente y hash, estado de validación, calificación), con orden, filtros y búsqueda en servidor.
- Cuatro vistas sobre los mismos datos: por expediente, por entidad (a través de expedientes del
  encargo), por categoría y línea de tiempo.
- Árbol lateral expediente → entidad → categoría con conteos.
- Detalle del registro: campos, documento original, entidades y vínculos que generó, bitácora.
- Exportar la vista actual a CSV (queda en bitácora).

Listo cuando: e2e que filtra un expediente por entidad y por categoría, cambia a línea de tiempo y
abre un registro hasta su documento; los conteos del árbol coinciden con la tabla.
```

## 11 — Ficha enriquecida

```
Tarea 11 — Ficha enriquecida. Rama: feat/11-ficha-enriquecida.
Lee docs/ESPECIFICACION.md §11, §14.

Construye:
- Interfaz ConectorFuente y registro de conectores configurables en fuente_consulta.
- Conector interno «otros expedientes»: busca la entidad en los demás encargos de la misma
  organización por RFC, CURP o nombre normalizado.
- Conector «lista 69-B»: el admin carga el CSV publicado por el SAT; la búsqueda es por RFC. Activa R10.
- Conector de ejemplo documentado para agregar una fuente externa por API.
- En la ficha, secciones «otros expedientes» y «coincidencias externas»: exactas y propuestas, con
  fuente y hora; confirmar, descartar e incorporar como registro.
- Consulta a demanda y por lote como trabajo en segundo plano.

Listo cuando: una entidad presente en dos encargos muestra el otro en su ficha; un RFC incluido en el
CSV de prueba genera coincidencia exacta y alerta R10; una coincidencia por nombre queda como
propuesta hasta confirmarla; nada cruza organizaciones (prueba de RLS).
```

## 12 — Exportaciones

```
Tarea 12 — Exportaciones. Rama: feat/12-exportaciones.
Lee docs/ESPECIFICACION.md §12.

Construye:
- packages/i2-export: CSV de entidades y de vínculos de una red generada, documento con la
  especificación de importación para Analyst's Notebook, y GraphML.
- Reporte PDF en servidor (sin navegador headless) con la plantilla institucional del prototipo:
  resumen del encargo, red, entidades con nivel y criterios, alertas, y al pie folio, fecha, autor y
  SHA-256 de los datos exportados.
- Botones de exportación en la red y en el expediente. Cada exportación va a bitácora.

Listo cuando: los CSV del fixture de lavado traen 20 entidades y 25 vínculos; el GraphML abre en un
visor estándar; el hash impreso en el PDF coincide con el de los datos exportados.
```

## 13 — Endurecimiento

```
Tarea 13 — Endurecimiento. Rama: feat/13-endurecimiento.
Lee CLAUDE.md (reglas no negociables) y docs/SETUP.md.

Haz, y entrega un informe con hallazgos y correcciones:
- Auditoría de RLS tabla por tabla y de políticas del bucket; corre los asesores de seguridad y
  rendimiento de Supabase y corrige lo que marquen.
- Búsqueda en todo el código de innerHTML, dangerouslySetInnerHTML, uso de la service role key fuera
  del procesador de trabajos y datos personales en logs.
- Prueba de carga: 5,000 nodos en el visor y 50,000 registros en el expediente; índices y paginación
  donde haga falta.
- Suite e2e completa de los flujos de los hitos A y B. Estados de error y vacíos en todas las pantallas.
- Accesibilidad básica: teclado, contraste, etiquetas.
- Lista de verificación de despliegue y de respaldo y restauración de la base.

Listo cuando: el informe no deja hallazgos críticos abiertos, la suite e2e pasa en CI y los asesores
de Supabase no reportan problemas de seguridad.
```

## 14 — App de campo (fase posterior)

```
Tarea 14 — App de campo. Rama: feat/14-campo.
Lee docs/ESPECIFICACION.md §2 y propón primero el diseño de evidencia_campo y del modo sin conexión.

Construye una PWA en la misma aplicación (…/campo): programa de trabajo generado desde la red
calificada, cédulas prellenadas por partida, captura de foto con geolocalización, hora y hash al
momento, trabajo sin conexión con sincronización, y conciliación: lo observado coincide o genera una
alerta que reingresa al modelo.

Listo cuando: e2e en modo sin conexión que captura evidencia, sincroniza al reconectar y produce una
alerta por una discrepancia.
```

---

## 15 — Analizador (síntesis con origen)

```
Tarea 15 — Analizador. Rama: feat/15-analizador. Requiere 09 (validación) y 10 (expediente).
Lee CLAUDE.md (reglas 1, 4, 7 y 8) y docs/ESPECIFICACION.md §1, §1.2, §7.

Construye:
- …/analizador: el auditor elige el alcance (un expediente o una entidad) y qué registros entran;
  solo cuentan registros validados.
- Síntesis generada por IA (pasa por iaPermitida y queda en uso_ia) en la que cada afirmación
  cita el o los registros que la sostienen; una afirmación sin registro no se guarda.
- La síntesis nace como borrador: el auditor la revisa, edita y aprueba. Se guardan la versión de
  la IA y la aprobada, con autor y fecha; todo va a bitácora.
- Cada cita abre el registro y, desde ahí, la página, hoja, fila o celda de origen.
- La síntesis aprobada puede adjuntarse a un hallazgo, pero nunca crea hallazgos sola.

Listo cuando: una síntesis del fixture cita solo registros validados; quitar un registro del
alcance quita sus afirmaciones; el texto dentro de un documento no cambia las instrucciones del
modelo (prueba con un documento que intenta dar órdenes); lector no genera ni aprueba.
```

## 16 — Plataforma responsiva (celular)

Leer la plataforma en un iPhone sin perder funciones: menú del celular (panel modal con módulos y
zona del usuario), una columna, tablas como tarjetas (`tabla-tarjetas` + `data-etiqueta`), red con
gestos y altura de pantalla, campos de 16 px para que iOS no acerque la página.

**Listo cuando:** `e2e/movil.spec.ts` (390 × 844, táctil) recorre las pantallas de lectura sin que
nada se salga a lo ancho, el menú lleva a cada módulo y axe no reporta hallazgos graves.

---

## Prompts de apoyo

**Continuar una tarea en sesión nueva**

```
Continúa la tarea NN en la rama feat/NN-nombre. Lee CLAUDE.md, la tarea en docs/PROMPTS.md y
git log main..HEAD. Dime qué está hecho, qué falta contra «Listo cuando» y sigue desde ahí.
```

**Corregir un defecto**

```
Defecto: <qué pasa> / Esperado: <qué debería pasar> / Pasos: <cómo reproducir>.
Primero escribe una prueba que falle por este defecto, luego corrige la causa y confirma que pasa.
No amplíes el alcance.
```

**Revisar un PR antes de fusionar**

```
Revisa el PR actual contra CLAUDE.md (reglas no negociables) y la tarea NN de docs/PROMPTS.md.
Reporta, por severidad: fallas de RLS o de trazabilidad, datos sin escapar, lógica de negocio fuera
de packages/, pruebas faltantes y criterios de «Listo cuando» sin cumplir. No modifiques código.
```

**Cambio de especificación**

```
Cambia <qué> en docs/ESPECIFICACION.md §<n>. Antes de tocar código, lista las migraciones, paquetes,
pantallas y pruebas afectadas, y propón el orden. Espera mi confirmación.
```
