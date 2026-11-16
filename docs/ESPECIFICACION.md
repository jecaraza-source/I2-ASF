# Especificación funcional — Plataforma SIGMA

Fuente de verdad del modelo y los módulos. Las tareas de `docs/PROMPTS.md` citan estas secciones.

## 1. Módulos y rutas

Todas las rutas cuelgan de `/encargos/[encargo]`.

| Módulo | Ruta | Qué hace | Tarea |
|---|---|---|---|
| Encargos y expedientes | `/encargos`, `…/expedientes` | Alta y navegación | 02 |
| Importación de Excel | `…/importaciones` | Plantillas de mapeo, vista previa, carga | 03 |
| Red de vínculos | `…/red`, `…/red/vista` | Generar, regenerar, calificar; explorar en el visor | 04, 05 |
| Alertas | `…/alertas`, `…/alertas/[id]` | Resultado de las reglas R01–R09; evidencias lado a lado; confirmar o descartar con motivo | 06 |
| Ingreso de documentos | `…/ingreso/importar`, `…/documentos/[id]` | Subida con pre-clasificación; visor del original | 07 |
| Captura manual | `…/ingreso/capturar` | Registro sin documento | 08 |
| Validación | `…/validacion` | Cola de extracciones por confirmar | 09 |
| Expediente documental | `…/expedientes/[exp]` | Tabla única con cuatro vistas | 10 |
| Ficha de entidad | `…/entidades/[id]` | Todo lo que se sabe de una entidad | 05, 11 |
| Registro | `…/registros/[id]` | Un registro con sus datos y la hoja, fila, celda o página de origen | 05 |
| Configuración | `…/configuracion` | Categorías, tipos de documento, reglas, fuentes | 02, 04, 11 |

## 2. Modelo de datos

Toda tabla de dominio lleva `id uuid pk`, `organizacion_id`, `creado_en`, `creado_por`, y `encargo_id`
cuando pertenece a un encargo. No se repiten abajo.

**Organización y acceso**

| Tabla | Columnas |
|---|---|
| `organizacion` | `nombre` |
| `miembro` | `usuario_id → auth.users`, `rol` (`admin`, `auditor`, `lector`); único por organización y usuario |
| `encargo` | `nombre`, `tipo_auditoria`, `umbral_confianza numeric default 0.85`, `periodo_inicio`, `periodo_fin`, `estado` |

**Expediente y registros**

| Tabla | Columnas |
|---|---|
| `expediente` | `numero_control` (nulo si no se conoce), `identificador` (único por encargo; se genera `EXP-AAAA-NNNN` si falta), `descripcion` |
| `categoria_documental` | `nombre`, `orden` |
| `tipo_documento` | `clave`, `nombre`, `categoria_id`, `campos_esperados jsonb` |
| `documento_origen` | `expediente_id`, `sha256`, `storage_path`, `nombre_archivo`, `mime`, `tamano`, `folio`, `fuente`, `recibido_por`, `recibido_en`, `original_id` (si es derivado); único (`encargo_id`, `sha256`) |
| `registro` | `expediente_id`, `tipo_documento_id`, `origen` (`documento`, `captura`, `importacion`), `documento_id` (nulo en capturas), `fuente`, `fecha_documento`, `estado_validacion` (`pendiente`, `validado`, `corregido`, `rechazado`), `estado_extraccion`, `resumen` |
| `extraccion` | `registro_id`, `campo`, `valor_crudo text`, `valor_normalizado jsonb`, `confianza numeric` (nulo si es manual), `ubicacion jsonb` (página, hoja, fila, celda), `metodo` (`ia`, `manual`, `importacion`), `estado`, `validado_por`, `validado_en` |

**Entidades, vínculos y eventos**

| Tabla | Columnas |
|---|---|
| `entidad` | `tipo` (`persona_fisica`, `persona_moral`, `cuenta`, `domicilio`, `telefono`, `dependencia`, `otro`), `nombre`, `nombre_normalizado`, `identificadores jsonb` (rfc, curp, clabe, imsi), `atributos jsonb`, `riesgo_declarado`, `fusionada_en` (entidad canónica si se aceptó una fusión) |
| `alias_entidad` | `entidad_id`, `alias`, `extraccion_id` |
| `fusion_propuesta` | `entidad_a`, `entidad_b`, `motivo`, `estado` (`propuesta`, `aceptada`, `rechazada`), `resuelta_por` |
| `registro_entidad` | `registro_id`, `entidad_id`, `rol` (involucrados de un registro) |
| `vinculo` | `origen_id`, `destino_id`, `tipo`, `fuerza smallint` (1–10), `fuerza_original text`, `fecha_inicio`, `dirigido bool` |
| `evento` | `tipo` (`contrato`, `transferencia`, `llamada`, `pago`, `otro`), `fecha_hora`, `monto numeric(18,2)`, `moneda`, `atributos jsonb` |
| `evento_participante` | `evento_id`, `entidad_id`, `rol` (`origen`, `destino`, `parte`) |
| `evidencia` | `objeto_tipo` (`entidad`, `vinculo`, `evento`, `alerta`), `objeto_id`, `registro_id`, `extraccion_id` |

**Red y calificación**

| Tabla | Columnas |
|---|---|
| `regla_calificacion` | `version int`, `criterio`, `peso`, `parametros jsonb`, `activa` |
| `red_generada` | `semillas uuid[]`, `alcance smallint`, `version_reglas`, `generada_en`, `generada_por`, `resumen jsonb` |
| `red_nodo` | `red_id`, `entidad_id`, `distancia` |
| `red_vinculo` | `red_id`, `vinculo_id` |
| `calificacion` | `red_id`, `objeto_tipo`, `objeto_id`, `puntaje`, `nivel`, `criterios jsonb`, `ajuste_nivel`, `ajuste_motivo`, `ajustado_por` |

**Alertas, consultas y operación**

| Tabla | Columnas |
|---|---|
| `alerta` | `regla`, `severidad`, `estado` (`abierta`, `confirmada`, `descartada`), `detalle jsonb`, `huella`, `vigente`, `resuelta_por`, `resuelta_en`, `resolucion_motivo` |
| `hallazgo`, `hallazgo_alerta` | `redaccion`, `firmado_por`, `firmado_en` |
| `fuente_consulta` | `nombre`, `tipo` (`interna`, `externa`), `conector`, `config jsonb`, `activa` |
| `resultado_consulta` | `entidad_id`, `fuente_id`, `coincidencia` (`exacta`, `propuesta`), `datos jsonb`, `consultado_en`, `estado` (`pendiente`, `confirmada`, `descartada`), `registro_id` (si se incorporó) |
| `plantilla_importacion` | `nombre`, `firma_hojas jsonb`, `mapeo jsonb` |
| `trabajo` | `tipo`, `payload jsonb`, `estado` (`pendiente`, `en_proceso`, `hecho`, `error`), `intentos`, `error`, `bloqueado_hasta` |
| `bitacora` | `actor`, `accion`, `objeto_tipo`, `objeto_id`, `detalle jsonb`, `en` |

`evidencia_campo` (auditoría física) se define en la tarea 14.

## 3. Roles y RLS

- `admin`: todo dentro de su organización, incluida la configuración.
- `auditor`: crea y valida registros, genera redes, resuelve alertas, firma hallazgos.
- `lector`: solo lectura.

Función `es_miembro(organizacion_id, roles text[])` (`security definer`, `search_path` fijo) usada por
todas las políticas. `bitacora`: solo INSERT y SELECT. Registro por invitación; el alta pública queda
desactivada.

Decisiones de implementación (tarea 01):

- **Catálogos por organización, sin `encargo_id`:** `categoria_documental`, `tipo_documento`,
  `regla_calificacion`, `fuente_consulta` y `plantilla_importacion`. Solo `admin` los escribe.
  `trabajo.encargo_id` y `bitacora.encargo_id` son opcionales.
- **Integridad entre organizaciones en la base:** las referencias usan claves foráneas compuestas
  (`organizacion_id, encargo_id` → `encargo`; `encargo_id, x_id` → tabla del encargo), así que no se
  puede ligar un objeto a un encargo de otra organización.
- **Sin DELETE en la evidencia:** ningún usuario borra `documento_origen`, `registro`, `extraccion`,
  `evidencia`, `entidad`, `vinculo`, `evento`, redes, calificaciones, alertas ni hallazgos; lo erróneo
  se marca (`rechazado`, `descartada`). `documento_origen`, `evidencia`, `red_*` y `hallazgo_alerta`
  tampoco admiten UPDATE. Un disparador impide reescribir `sha256`, ruta, organización o encargo de un
  original, incluso desde el servidor.
- **`bitacora`:** además de RLS, un disparador rechaza UPDATE, DELETE y TRUNCATE para cualquier rol.
  Los disparadores de bitácora guardan IDs y cambios de estado, nunca valores de la evidencia.
- **Valores de estado:** `text` con `check` (no `enum`). `encargo.estado`: `activo`, `cerrado`,
  `archivado`. `alerta.severidad`: `critica`, `alta`, `media`, `baja`. `calificacion.nivel`:
  `critico`, `alto`, `medio`, `bajo`.
- **Funciones auxiliares** en el esquema `privado`, que no se expone por la API.

## 4. Almacenamiento

Bucket privado `originales`, ruta `{organizacion}/{encargo}/{sha256}`. Políticas: INSERT y SELECT para
miembros; sin UPDATE ni DELETE. El navegador calcula el SHA-256 (Web Crypto) para detectar duplicados
antes de subir; el servidor lo recalcula al procesar y **ese** es el que se guarda. Si no coinciden,
el documento se rechaza y se registra en bitácora. Descarga solo con URL firmada de corta duración.

- **Flujo (tarea 07):** el servidor emite una URL firmada de subida para la ruta de la huella declarada;
  el navegador sube directo; el servidor descarga lo que quedó, recalcula el SHA-256, revisa que los
  primeros bytes correspondan a la extensión y que el tipo almacenado sea el esperado, y solo entonces
  llama a `registrar_documento` (documento, registro pendiente y trabajo en una transacción).
- **Aceptados:** PDF, PNG, JPG, WEBP, TIFF, XLSX, XLS, EML y MSG, hasta 50 MB. Solo PDF e imágenes
  rasterizadas tienen vista previa; lo demás se descarga. Nunca HTML ni SVG.
- **Rechazos:** `bitacora.accion = 'documento.rechazado'` con `motivo` (`sha256_no_coincide`,
  `tipo_no_coincide`, `tamano_excedido`) y ambas huellas. El objeto rechazado queda en el bucket (no
  hay DELETE) sin `documento_origen` que lo referencie.
- **Visor:** `…/documentos/[id]`, URL firmada de 60 segundos; cada consulta escribe
  `documento.consulta` en bitácora.

## 5. Normalización

- **Montos:** conserva signo y paréntesis contables. Nunca `replace(/[^0-9.]/g,'')`.
- **Fechas:** ISO 8601. Convierte seriales de Excel. `dd/mm/aaaa` es formato mexicano.
- **Fuerza del vínculo:** escala 1–10. `CRÍTICO=9`, `ALTO=7`, `MEDIO=5`, `BAJO=3`. El valor original
  va en `fuerza_original`.
- **Nombres:** `nombre_normalizado` en mayúsculas, sin acentos ni dobles espacios, sin sufijos
  societarios (SA DE CV, SAPI DE CV, S DE RL, SC, SA, LTD, CORP, LLC, INC).
- **RFC, CURP, CLABE:** valida el formato; si falla, marca `invalido` en `identificadores` y conserva.

## 6. Ingreso de información

Dos vías, un mismo `registro`.

**Importar documento** (tarea 07). Pre-clasificación manual de tres campos: tipo de documento,
expediente (existente o nuevo) y fuente. Con eso se crean `documento_origen` y `registro`
(`origen = documento`, `estado_validacion = pendiente`) y un `trabajo` de extracción.
`registro.estado_extraccion` sigue al trabajo: `en_cola` al crear, `en_espera` cuando el procesador
lo toma (hasta la tarea 09 no hay extracción), luego `en_proceso`, `hecha` o `error`; `no_aplica`
para capturas e importaciones.

**Procesador de trabajos.** `/api/trabajos/procesar` (cron de Vercel, `CRON_SECRET`) usa la service
role key, único lugar donde se permite. `tomar_trabajos` toma pendientes con `for update skip locked`
y los bloquea 5 minutos; `terminar_trabajo` los cierra o los reintenta con espera creciente (2, 4
minutos); al tercer fallo quedan en `error`. Los manejadores son idempotentes.

**Captura manual** (tarea 08). El mismo formulario que produce una extracción validada, sin archivo:
`origen = captura`, `metodo = manual`, `confianza` nula, fuente declarada obligatoria. Se muestra como
«sin soporte documental». Al asociarle un documento se ejecuta la extracción y se compara campo por
campo con lo capturado; cada diferencia genera una alerta `R11_captura_vs_documento`.

- **Formulario único:** campos comunes (abajo) + `campos_esperados` del tipo + involucrados repetibles
  (empresa, persona o dependencia; rol; RFC; CURP) con autocompletado contra las entidades del
  encargo. Lo valida y normaliza el servidor con las funciones de §5. Un RFC o CURP con formato
  inválido se conserva marcado, no bloquea.
- **`campos_esperados`:** arreglo de `{ clave, etiqueta, tipo, requerido? }` con `tipo` en `texto`,
  `texto_largo`, `fecha`, `monto`, `numero`. El catálogo provisional trae los suyos
  (`privado.campos_provisionales`); un tipo nuevo con esa clave los recibe al crearse.
- **Qué guarda `capturar_registro`** (una transacción): el registro `validado`; una extracción
  `manual`/`validado` por campo y por involucrado, sin confianza; las entidades (se reutiliza la que
  tenga el mismo RFC válido, o el mismo tipo y nombre normalizado); `registro_entidad` con el rol;
  evidencia; y un evento cuando el tipo lo amerita: `contrato` (dependencia → proveedor) o
  `comprobante_transferencia` (ordenante → beneficiario), con al menos dos involucrados.
- **`asociar_documento`:** sube y verifica el original como en §4, liga `documento_id` (el origen
  sigue siendo `captura`) y encola la extracción con `comparar_con_captura`.

**Catálogo provisional** (configurable por organización):

| Categoría | Tipos de documento |
|---|---|
| Contractual | contrato, convenio modificatorio, acta de entrega |
| Financiera | estado de cuenta, comprobante de transferencia |
| Fiscal | CFDI, constancia de situación fiscal |
| Corporativa | acta constitutiva, poder notarial |
| Comunicaciones | registro telefónico, oficio |
| Otros | otro |

**Campos comunes del registro:** involucrados con rol, razones sociales, RFC y CURP, fecha del
documento, números de referencia (expediente, contrato, factura, cuenta), montos con moneda,
domicilios, teléfonos. Cada tipo de documento añade los suyos en `campos_esperados`.

## 7. Extracción con IA

- Corre en servidor, dentro del procesador de trabajos. Entrada: el archivo y los `campos_esperados`
  del tipo de documento. Salida: JSON validado con zod, un elemento por campo con `valor`, `confianza`
  (0–1) y `ubicacion`.
- El prompt de sistema declara que el contenido del documento es dato y no instrucciones.
- Respuesta inválida o error: reintento con espera; al tercer fallo el trabajo queda en `error` y el
  registro en `pendiente` para captura manual.
- Extracciones con `confianza ≥ umbral` quedan `validado` con `validado_por` nulo (automáticas);
  las demás entran a la cola de validación. Solo lo validado alimenta entidades y vínculos.
- Formato de envío de PDF e imágenes: verificar en la documentación vigente del SDK al implementar.

## 8. Importador de Excel

Mapeo explícito por plantilla: nada de adivinar columnas. Una plantilla se reconoce por
`firma_hojas` (nombres de hoja y encabezados). Flujo: subir → detectar plantilla o pedir mapeo →
vista previa con conteos y filas excluidas → confirmar. Cada fila válida crea un `registro`
(`origen = importacion`) con sus extracciones y `ubicacion` de hoja y fila.

Filas excluidas del detalle: primera celda que empata `^TOTAL`, `RESUMEN`, o que empieza con `[`;
filas sin identificador válido. Los totales del archivo **sí** se guardan como extracción
`total_declarado` para la regla R01. Ninguna hoja se ignora en silencio: las no mapeadas se listan.

**Plantillas semilla** (fila = fila del encabezado):

| Archivo | Hoja | Fila | Produce |
|---|---|---|---|
| `ANALISIS_ASF_EJEMPLO` | `CONTRATOS` | 1 | evento `contrato`; entidades proveedor y dependencia |
| | `VINCULOS` | 1 | entidades por nombre (`ENTIDAD_A`, `ENTIDAD_B`) y vínculo con `FUERZA` |
| | `FINANCIEROS` | 1 | evento `transferencia` (`MONTO_MXN`), con `ETAPA_ALERTA` |
| | `RESUMEN EJECUTIVO` | — | cifras declaradas (`total_declarado`) |
| `ASF_Auditoria_Forense_07734` | `PORTADA` | — | cifras declaradas |
| | `ANALISIS TELEFONICO` | 1 | evento `llamada`; entidades teléfono y persona (`NOMBRE_A`, `NOMBRE_B`) |
| | `CONTRATOS IRREGULARES` | 3 | evento `contrato`; proveedor con `RFC` |
| | `RED DE VÍNCULOS` | 3 | entidades por nombre y vínculo con `FUERZA` |
| | `MOVIMIENTOS FINANCIEROS` | 2 | evento `transferencia` (`MONTO ($MXN)`, `TIPO OPERACIÓN`) |
| | `RESUMEN EJECUTIVO` | — | cifras declaradas |
| `Red_Lavado_Dinero_LDN2024047` | `NODOS — ENTIDADES` | 3 | entidades con `ID`, `RIESGO` → `riesgo_declarado` |
| | `FLUJOS FINANCIEROS` | 2 | evento `transferencia` por `ORIGEN (ID)` y `DESTINO (ID)`; monto en la moneda de la columna que traiga valor |
| | `VÍNCULOS` | 2 | vínculo por `NODO_A`, `NODO_B` con `PESO` |

Las entidades se resuelven por identificador cuando existe (`ID`, `RFC`) y por nombre normalizado en
caso contrario. Así los tres formatos terminan en el mismo grafo.

**Formato del mapeo (tarea 03).** `plantilla_importacion.mapeo = { hojas: [...] }`. Cada hoja declara
su `clase` (`contratos`, `transferencias`, `vinculos`, `llamadas`, `entidades`, `cifras`), la
`fila_encabezado` y las `columnas` por encabezado (validado con `plantillaSchema` de
`@sigma/importador`). `firma_hojas = [{ hoja, encabezados[] }]`: la plantilla aplica si todas sus hojas
existen y traen esos encabezados en las primeras 10 filas. Las plantillas semilla viven en
`packages/importador/plantillas/*.json` y generan `supabase/seed_plantillas.sql`.

**Carga (tarea 03).** La función `importar_excel(jsonb)` (`security invoker`, con RLS) crea en una sola
transacción el `documento_origen`, un `registro` validado por fila (y uno por hoja de cifras, con
extracciones `total_declarado`), las extracciones con `ubicacion` (hoja, fila, celda), entidades
(reutiliza las del encargo por RFC válido, teléfono o nombre normalizado), vínculos, eventos,
`registro_entidad`, `evidencia` y la entrada `importacion.carga` en bitácora. La vista
`importacion_resumen` (`security_invoker`) cuenta lo producido por cada archivo.

## 9. Red de vínculos

**Resolución de entidades.** Prioridad: RFC → CURP → identificador del archivo → nombre normalizado.
Coincidencia por identificador fusiona directo. Coincidencia solo por nombre parecido crea
`fusion_propuesta`; no se fusiona hasta que un auditor acepta. Aceptar (`resolver_fusion`) no reescribe
vínculos, eventos ni evidencia: marca `entidad_b.fusionada_en = entidad_a`, agrega el nombre de B como
alias de A y la red usa la entidad canónica al generarse. Un par (en cualquier orden) se propone una sola
vez; un rechazo no se vuelve a proponer.

**Generación.** Entrada: una o varias entidades semilla y alcance (1 o 2 saltos). Pasos: reunir
registros validados que las mencionan → obtener entidades → reunir vínculos declarados y eventos
entre ellas (los eventos se dibujan como aristas aparte y no cuentan como vínculos) → calificar → guardar `red_generada` con sus nodos, vínculos y
calificaciones. Regenerar crea una generación nueva; la pantalla muestra qué cambió contra la anterior
(nodos y vínculos añadidos, calificaciones que subieron o bajaron).

**Calificación (provisional, configurable en `regla_calificacion`).**

| Criterio | Aplica a | Peso inicial |
|---|---|---|
| `riesgo_declarado` CRÍTICO / ALTO / MEDIO | entidad | 60 / 40 / 20 |
| Tipo declarado como fantasma, fachada u offshore | entidad | 30 |
| Alerta abierta de R06–R10 | entidad | 15 por alerta |
| Vínculo de fuerza ≥ 7 con entidad de nivel crítico | entidad | 10 |
| Etapa o alerta financiera en un evento | vínculo | 20 |
| `fuerza` del vínculo | vínculo | `fuerza × 8` |

Puntaje = suma con tope en 100. Niveles: crítico ≥ 75, alto ≥ 50, medio ≥ 25, bajo < 25.
`calificacion.criterios` guarda la lista de criterios activados con su aporte, para explicar el nivel.
El auditor puede ajustar el nivel con motivo obligatorio; el ajuste va a bitácora.

Criterios en `regla_calificacion` (tarea 04): `riesgo_declarado` (`parametros.niveles`),
`tipo_declarado` (`parametros.patron`), `alertas_abiertas` (`parametros.reglas`, peso por alerta),
`vinculo_fuerte_con_critico` (`parametros.fuerza_minima`, se suma una vez), `evento_con_etapa` (vínculo
cuyos extremos comparten un evento con etapa) y `fuerza_vinculo` (peso × fuerza). Editar pesos crea la
versión N+1 (`nueva_version_reglas`) y desactiva las anteriores; sin reglas se usan las de esta tabla
como versión 0. Cada generación se guarda con `guardar_red` en una transacción.

## 10. Reglas de validación cruzada

Funciones puras `(datos) => Alerta[]`. Cada alerta enlaza las evidencias que se contradicen.

| ID | Regla |
|---|---|
| R01 | Total declarado distinto de la suma del detalle |
| R02 | Mismo concepto con cifras distintas entre hojas o documentos |
| R03 | Afirmación cuantitativa en un vínculo sin respaldo en eventos |
| R04 | Suma de un tipo de evento distinta de la cifra reportada |
| R05 | Parentesco declarado con apellidos incompatibles y sin nota |
| R06 | Monto pagado mayor al original sin convenio modificatorio |
| R07 | Adjudicaciones directas sucesivas al mismo proveedor |
| R08 | Domicilio fiscal o representante legal compartido entre proveedores |
| R09 | Empresa constituida pocos días antes del contrato |
| R10 | Proveedor en lista 69-B del SAT (requiere la fuente de la tarea 11) |
| R11 | Captura manual que difiere del documento asociado después |

- **Ejecución:** al terminar cada importación y a demanda desde `…/alertas`. Solo leen registros
  validados. R10 y R11 están declaradas y desactivadas hasta las tareas 11 y 09.
- **Identidad:** cada alerta lleva una `huella` (regla + evidencias). Volver a ejecutar no duplica
  alertas ni reabre las resueltas. Una alerta abierta que ya no se reproduce queda `vigente = false`
  (se sigue viendo, pero no cuenta para la calificación de §9); nunca se resuelve sola.
- **Detalle:** `detalle` guarda `titulo`, `descripcion`, `entidades` y `evidencias` (`lado`, `etiqueta`,
  `valor`, `registro_id`, `extraccion_id`, `ubicacion`); además cada evidencia se inserta en
  `evidencia` con `objeto_tipo = 'alerta'`.
- **Resolución:** `confirmada` o `descartada`, siempre con motivo, quién y cuándo. Confirmar no crea
  un hallazgo.
- **Criterios provisionales** (por confirmar con el cliente, §14): R02 agrupa cifras del mismo concepto
  que difieren menos de 10 %; R03 contrasta llamadas y transferencias (no contratos); R05 revisa
  hermanos, padres e hijos; R07 alerta desde 2 adjudicaciones directas; R09 toma la fecha de
  constitución del RFC y alerta hasta 90 días antes del primer contrato.

## 11. Vista dinámica y ficha

- **Motor:** Cytoscape.js. Diseños: fuerza, circular, agrupados, jerarquía, organización, abanico,
  empaquetado, mínimos cruces. Ícono por tipo, color por nivel, grosor por fuerza.
- **Entidad central:** al elegir un nodo, la red se redibuja con él al centro y sus vínculos directos;
  control para ampliar a 2 saltos. El estado vive en la URL (`?foco=<id>&saltos=1&ruta=<id>,<id>`),
  así el botón atrás y los enlaces compartidos funcionan. Ruta de navegación visible con regreso a
  cualquier paso y a la vista general, conservando filtros (`tipos`, `niveles`, `desde`, `hasta`,
  `diseno`, que también viven en la URL).
- **Qué se dibuja:** la generación más reciente. Los vínculos declarados son líneas continuas; los
  eventos se agrupan en una línea por par de entidades y tipo («12 llamadas»), punteada, con grosor
  creciente según la cantidad. En una llamada se unen teléfono con teléfono y persona con persona.
  Clic en una línea muestra los vínculos o eventos que la sostienen y sus registros de origen.
- **Ficha:** panel lateral y página propia. Secciones: datos generales e identificadores, registros y
  documentos, vínculos y eventos, calificación con criterios, otros expedientes, coincidencias externas.
- **Ficha enriquecida:** interfaz `ConectorFuente { buscar(entidad): Promise<Coincidencia[]> }`.
  Coincidencia por RFC o CURP = `exacta`; por nombre = `propuesta`, que el auditor confirma o descarta.
  Cada resultado guarda fuente y hora de consulta. Lo confirmado puede incorporarse como registro
  (`origen = captura`, fuente = nombre de la fuente).
- La búsqueda en otros expedientes nunca cruza organizaciones.

## 12. Exportaciones

- **i2 Analyst's Notebook:** CSV de entidades y CSV de vínculos, más un documento con la
  especificación de importación (columnas, tipos, iconos). **GraphML** como alternativa.
- **PDF de reporte:** generado en servidor, sin navegador headless. Incluye folio del expediente,
  fecha, autor y SHA-256 de los datos exportados. Toda exportación va a bitácora.

## 13. Fixtures y valores esperados

Si un cambio altera estos valores, la prueba falla.

**`ANALISIS_ASF_EJEMPLO.xlsx`**
- 20 contratos. Original $157,330,000; pagado $165,430,000; diferencia $8,100,000.
- 25 vínculos; 5 entidades únicas de tipo fantasma u offshore como destino (no 17).
- 26 movimientos, 9 de ellos wire transfer. Se excluyen las filas finales de notas.
- R05 alerta: Mario Alberto Fuentes Castillo figura como «hermano» de Rodrigo Vargas Moreno.

**`ASF_Auditoria_Forense_07734.xlsx`**
- 12 contratos. Original $1,948,320,450; pagado $1,655,320,000.
- R02 alerta: portada $1,847,320,450, resumen $1,947,320,450, detalle $1,948,320,450.
- 14 movimientos; 5 wire transfers por $138,500,000. R04 alerta contra los $116.5 M del resumen.
- 300 llamadas. R03 alerta: el vínculo afirma 87 llamadas entre Ana Torres Castillo y Carlos Mendoza
  Ríos y el registro telefónico tiene 0.

**`Red_Lavado_Dinero_LDN2024047.xlsx`**
- 20 entidades, 25 vínculos, 20 flujos.

## 14. Decisiones pendientes con el cliente

Cada una tiene un valor provisional para no detener el desarrollo.

| Decisión | Valor provisional | Dónde se cambia |
|---|---|---|
| Catálogo de categorías y tipos de documento | Tabla de §6 | `…/configuracion` |
| Regla para generar identificadores de expediente | `EXP-AAAA-NNNN` | Función SQL |
| Pesos y umbrales de la calificación | Tabla de §9 | `regla_calificacion` |
| Inventario de bases de datos para la ficha | Otros expedientes + lista 69-B por CSV | `fuente_consulta` |
| Umbral de confianza de la IA | 0.85 | `encargo.umbral_confianza` |
