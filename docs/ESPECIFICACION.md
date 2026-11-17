# Especificación funcional — Plataforma SIGMA

Fuente de verdad del modelo y los módulos. Las tareas de `docs/PROMPTS.md` citan estas secciones.

## 1. Módulos y rutas

Todas las rutas cuelgan de `/encargos/[encargo]`.

| Módulo | Ruta | Qué hace | Tarea |
|---|---|---|---|
| Encargos y expedientes | `/encargos`, `…/expedientes` | Alta y navegación | 02 |
| Importación de Excel | `…/importaciones` | Plantillas de mapeo, vista previa, carga | 03 |
| Red de vínculos | `…/red`, `…/red/vista` | Generar, regenerar, calificar; explorar en el visor | 04, 05 |
| Alertas | `…/alertas`, `…/alertas/[id]` | Resultado de las reglas R01–R12; evidencias lado a lado; confirmar o descartar con motivo | 06 |
| Ingreso de documentos | `…/ingreso/importar`, `…/documentos/[id]` | Subida con pre-clasificación; visor del original | 07 |
| Captura manual | `…/ingreso/capturar` | Registro sin documento | 08 |
| Validación | `…/validacion`, `…/validacion/[registro]` | Cola de documentos leídos por la IA; aceptar, corregir o rechazar por campo y por registro (§7.2) | 09 |
| Expediente documental | `…/expedientes/[exp]`, `…/registros`, `…/registros/exportar` | Tabla única con cuatro vistas, árbol y exportación (§6.1) | 10 |
| Ficha de entidad | `…/entidades/[id]` | Todo lo que se sabe de una entidad | 05, 11 |
| Registro | `…/registros/[id]` | Un registro con sus datos y la hoja, fila, celda o página de origen | 05 |
| Configuración | `…/configuracion` | Categorías, tipos de documento, reglas, fuentes | 02, 04, 11 |
| Recorridos guiados | `…/recorridos`, `…/recorridos/[clave]` | Empezar por una tarea y seguir sus etapas, con el avance real del encargo | — |
| Analizador | `…/analizador`, `…/analizador/nueva`, `…/analizador/[id]` | Síntesis de un expediente o entidad con cada afirmación ligada a su registro (§15) | 15 |
| Hallazgos | `…/hallazgos`, `…/hallazgos/[id]` | Redacción y firma del auditor; respaldo en alertas y síntesis aprobadas (§15) | 15 |
| Verificación en campo | `…/verificacion` | Programa de visitas a proveedores de riesgo; cédulas, fotos y resultado (§16) | 14 |
| App de campo | `/campo` (fuera del encargo) | Celular del auditor o verificador: aviso, cédula, fotos, funciona sin señal (§16) | 14 |
| Usuarios y accesos | `/usuarios` (fuera del encargo) | Usuarios, roles, bitácora de acceso y control de cambios (§3.1) | — |

### 1.1 Navegación: menú por capacidad y recorridos por tarea

La plataforma ofrece dos entradas al mismo espacio de trabajo:

- **Menú superior por capacidad** (dentro de un encargo): tres categorías —Integración de fuentes,
  Análisis, Gestión del encargo—; cada desplegable muestra el nombre y la descripción de sus
  módulos. El cursor previsualiza; clic, Enter o Espacio abren y cierran; Escape cierra y devuelve
  el foco; clic o foco fuera cierran. Los módulos no construidos aparecen deshabilitados.
- **Recorridos guiados por tarea** (resumen del encargo y `…/recorridos`): Integrar un expediente,
  Analizar documentos existentes, Analizar comunicaciones, Investigar una entidad y Cerrar el
  análisis. Cada uno tiene cuatro etapas con indicador (número, texto y estado: hecha, pendiente o
  de consulta), botón al módulo donde se hace, «Anterior» y «Siguiente», y la guía «¿Qué sigue?».
  El estado de cada etapa sale de conteos reales del encargo (`lib/avance.ts`), nunca de contenido.
  Las etapas no son obligatorias ni ordenadas: se puede empezar con información parcial.
- **Catálogo único** (`packages/modelo/src/catalogo-modulos.ts`): nombres, descripciones, rutas,
  categorías y recorridos. Lo comparten el menú, la barra lateral, la barra de navegación y los
  recorridos.
- **Barra de navegación:** Regresar, Subir un nivel y la ruta de dónde estás.

Reglas de experiencia para toda pantalla nueva: etiquetas siempre visibles (el ejemplo va como
texto de ayuda); lo capturado se conserva si hay un error; estados de carga, vacío, error y éxito
junto a la acción; el estado nunca se comunica solo con color; todo se opera con teclado; una
propuesta de la IA o una coincidencia sin revisar se distingue siempre de lo validado por una
persona.

### 1.2 Fuera de alcance

La plataforma integra y cruza la evidencia que entra a una auditoría; **no consulta información de
personas en fuentes externas**. No se construyen búsquedas de personas (nacional, internacional,
fiscal, por teléfono o correo), localización de actas del registro civil o de constancias fiscales,
ni reconocimiento facial. Cuando el auditor obtiene uno de esos documentos por el canal oficial, lo
ingresa como documento con su fuente (regla 1) y la plataforma lo cruza con lo demás. Las únicas
fuentes de consulta previstas son las de la tarea 11 (otros expedientes de la organización y la
lista 69-B publicada por el SAT). Tampoco se editan los originales (regla 2): el Analizador produce
síntesis y notas del auditor, no modifica documentos.

## 2. Modelo de datos

Toda tabla de dominio lleva `id uuid pk`, `organizacion_id`, `creado_en`, `creado_por`, y `encargo_id`
cuando pertenece a un encargo. No se repiten abajo.

**Organización y acceso**

| Tabla | Columnas |
|---|---|
| `organizacion` | `nombre` |
| `miembro` | `usuario_id → auth.users`, `rol` (`admin`, `auditor`, `lector`, `verificador`); único por organización y usuario |
| `encargo` | `ia_proveedores`, `nombre`, `tipo_auditoria`, `umbral_confianza numeric default 0.85`, `periodo_inicio`, `periodo_fin`, `estado` |

**Expediente y registros**

| Tabla | Columnas |
|---|---|
| `expediente` | `numero_control` (nulo si no se conoce), `identificador` (único por encargo; se genera `EXP-AAAA-NNNN` si falta), `descripcion` |
| `categoria_documental` | `nombre`, `orden` |
| `tipo_documento` | `clave`, `nombre`, `categoria_id`, `campos_esperados jsonb` |
| `documento_origen` | `expediente_id`, `sha256`, `storage_path`, `nombre_archivo`, `mime`, `tamano`, `folio`, `fuente`, `recibido_por`, `recibido_en`, `original_id` (si es derivado); único (`encargo_id`, `sha256`) |
| `registro` | `expediente_id`, `tipo_documento_id`, `origen` (`documento`, `captura`, `importacion`), `documento_id` (nulo en capturas), `fuente`, `fecha_documento`, `estado_validacion` (`pendiente`, `validado`, `corregido`, `rechazado`), `estado_extraccion`, `resumen` |
| `extraccion` | `registro_id`, `campo`, `valor_crudo text`, `valor_normalizado jsonb`, `confianza numeric` (nulo si es manual), `ubicacion jsonb` (página, hoja, fila, celda), `metodo` (`ia`, `manual`, `importacion`), `estado`, `validado_por`, `validado_en`, `valor_original jsonb` (solo en corregidas: lo que leyó la IA) |

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
| `hallazgo`, `hallazgo_alerta`, `hallazgo_sintesis` | `redaccion`, `firmado_por`, `firmado_en` (firmado = inmutable) |
| `sintesis` | `alcance_tipo` (`expediente`, `entidad`), `alcance_id`, `registros uuid[]` (validados del alcance), `estado` (`generando`, `en_espera`, `error`, `borrador`, `aprobada`, `descartada`), `motivo`, `proveedor`, `modelo`, `generada_en`, `aprobada_por`, `aprobada_en` |
| `afirmacion` | `sintesis_id`, `version` (`ia`, `borrador`, `aprobada`), `orden`, `texto`, `registros uuid[]` (al menos uno) |
| `fuente_consulta` | `nombre`, `tipo` (`interna`, `externa`), `conector`, `config jsonb`, `activa` |
| `resultado_consulta` | `encargo_id`, `entidad_id`, `fuente_id`, `huella`, `coincidencia` (`exacta`, `propuesta`), `datos jsonb`, `consultado_en`, `estado` (`pendiente`, `confirmada`, `descartada`), `revisado_por`, `revisado_en`, `motivo`, `registro_id` (si se incorporó) |
| `carga_fuente` | `fuente_id`, `nombre_archivo`, `formato` (`csv`, `xlsx`), `sha256`, `filas_esperadas`, `filas`, `estado` (`en_proceso`, `vigente`, `reemplazada`), `storage_path` (reservado), `vigente_desde` |
| `lista_69b` | `carga_id`, `rfc`, `nombre`, `nombre_normalizado`, `situacion` (`presunto`, `desvirtuado`, `definitivo`, `sentencia_favorable`, `otro`), `datos jsonb` |
| `plantilla_importacion` | `nombre`, `firma_hojas jsonb`, `mapeo jsonb` |
| `trabajo` | `tipo`, `payload jsonb`, `estado` (`pendiente`, `en_proceso`, `hecho`, `error`), `intentos`, `error`, `bloqueado_hasta` |
| `bitacora` | `actor`, `accion`, `objeto_tipo`, `objeto_id`, `detalle jsonb`, `en` |

| `visita_campo` | `encargo_id`, `entidad_id`, `verificador_id`, `estado` (`asignada`, `verificada`, `cancelada`), `nivel`, `puntaje` (de la red), `domicilios text[]` y `documentos jsonb` (prellenado), `instrucciones`, `motivo`; una sola visita asignada por entidad |
| `cedula_campo` | `id` (generado en el teléfono), `visita_id` (única), `registro_id` (origen `campo`), `respuestas jsonb` (5 preguntas: `si`, `no`, `no_verificable`), `domicilio_observado`, `observaciones`, `latitud`, `longitud`, `precision_m`, `capturada_en`, `recibida_en`, `autor` |
| `evidencia_campo` | `id` (generado en el teléfono), `visita_id`, `cedula_id`, `ruta`, `sha256`, `bytes` (≤ 15 MB), `mime` (JPG, PNG, WEBP, HEIC), coordenadas, `capturada_en`, `recibida_en`, `autor` |
| `aviso_aceptacion` | `usuario_id`, `aviso` (`campo_confidencialidad`), `version`, `aceptado_en` |

`registro.origen` admite `campo` (cédula de verificación); como la captura, exige `fuente`.

## 3. Roles y RLS

- `admin`: todo dentro de su organización, incluida la configuración.
- `auditor`: crea y valida registros, genera redes, resuelve alertas, firma hallazgos.
- `lector`: solo lectura.
- `verificador`: verificador de campo (celular personal). No ve encargos, registros ni entidades:
  solo las visitas que se le asignan, por funciones (`campo_mis_visitas`), y únicamente después de
  aceptar el aviso de confidencialidad. `es_miembro` y `mis_organizaciones` sin roles lo excluyen.

Las políticas comparan `organizacion_id = any ((select privado.mis_organizaciones(roles))::uuid[])`:
la lista de organizaciones activas del usuario (con el rol pedido) se calcula **una vez por consulta**,
no por fila (migración 21; antes `es_miembro` por fila hacía inviable el expediente con 50,000
registros). `privado.aplicar_rls` crea así las políticas de las tablas nuevas. `es_miembro` sigue
disponible para las funciones. `bitacora`: solo INSERT y SELECT. Registro por invitación; el alta
pública queda desactivada.

**Funciones con privilegios:** ninguna función `security definer` vive en `public` (esquema expuesto
por la API). El cuerpo va en `privado` y en `public` queda una envoltura `security invoker` con la
misma firma. `anon` solo ejecuta `registrar_acceso_fallido`.

**Escritura solo por funciones:** `vinculo`, `evento`, `evento_participante`, `registro_entidad` y
`alias_entidad` no admiten UPDATE. `entidad`, `extraccion` y `fusion_propuesta` solo se modifican
dentro de funciones de la plataforma (`/rpc/…`). Un disparador rechaza el PATCH directo a la API
usando `request.path`. Detalle en `docs/INFORME_ENDURECIMIENTO.md`.

### 3.1 Usuarios, accesos y control de cambios

Pantalla `/usuarios` (solo `admin`), con tres secciones:

- **Usuarios:** alta por **invitación por correo** (el usuario define su contraseña desde el enlace,
  en `/acceso/contrasena`) o con **contraseña temporal** (la define el administrador; no se guarda
  ni se registra). Si el correo ya tiene cuenta, solo se le da acceso a la organización. Cambio de
  rol, baja y reactivación.
- **Bitácora de acceso:** inicios y cierres de sesión e intentos fallidos, con IP y navegador
  (`bitacora`, `objeto_tipo = 'sesion'`, acciones `sesion.inicio`, `sesion.cierre`, `sesion.fallo`).
  A lo más 10 intentos fallidos por usuario y hora.
- **Control de cambios:** `usuario.alta`, `usuario.rol` (con `antes` y `despues`), `usuario.baja` y
  `usuario.reactivacion`, escritos por disparador en `miembro`: no dependen de la pantalla.

Reglas en la base (migración 17):

- **La baja es lógica** (`miembro.activo = false`); los miembros no se borran. `es_miembro` y
  `mis_organizaciones` exigen miembro activo, así que la baja corta todas las políticas a la vez.
- **Siempre queda un administrador activo** y **nadie cambia su propio rol ni se da de baja**.
- La bitácora guarda IDs, roles, IP y navegador; los correos se resuelven al leer
  (`usuarios_organizacion`, `bitacora_usuarios`, solo `admin`).
- **Service role:** crear cuentas necesita la API de administración de Auth. Es el segundo uso
  autorizado de la service role key (`lib/usuarios-admin.ts`, solo desde `acciones/usuarios.ts` y
  después de verificar que quien pide es `admin`). La membresía se inserta con el cliente del
  administrador: RLS decide y la bitácora registra.

Decisiones de implementación (tarea 01):

- **Catálogos por organización, sin `encargo_id`:** `categoria_documental`, `tipo_documento`,
  `regla_calificacion`, `fuente_consulta` y `plantilla_importacion`. Solo `admin` los escribe.
  `trabajo.encargo_id` y `bitacora.encargo_id` son opcionales.
- **Integridad entre organizaciones en la base:** las referencias usan claves foráneas compuestas
  (`organizacion_id, encargo_id` → `encargo`; `encargo_id, x_id` → tabla del encargo), así que no se
  puede ligar un objeto a un encargo de otra organización.
- **Disparadores que usan el esquema `privado`:** van como `security definer`, porque los usuarios no
  tienen permiso de ejecución en ese esquema. RLS sigue decidiendo quién escribe la tabla.
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

### 6.1 Expediente documental

Una sola tabla de registros, en la página de cada expediente (`…/expedientes/[exp]`) y para todo el
encargo (`…/registros`, donde también viven los registros sin expediente y la vista por entidad).

- **Columnas:** registro (resumen, folio `R-` + 8 caracteres del ID, origen, hoja y fila si viene de
  Excel), expediente, tipo y categoría, fecha (la del documento o, si falta, la del primer evento
  que generó), involucrados con su rol, RFC y CURP válidos, referencias (números de contrato,
  factura, cuenta, folio o expediente y el número del evento), montos con moneda, fuente o archivo
  con su SHA-256, estado de validación y calificación.
- **Calificación de un registro:** el nivel más alto de sus entidades en la última red generada
  del encargo (con el ajuste manual si lo hay) y cuántas alertas abiertas lo citan. Sin red,
  «sin calificar».
- **Filtros, búsqueda y orden en la base** (`expediente_registros`, security invoker: RLS decide):
  expediente (o `sin`), entidad (o `sin`), categoría (o `sin`), estado (`validados`, `pendiente`,
  `rechazado`), origen, fechas y texto. La búsqueda no distingue acentos ni mayúsculas y exige
  todos los términos en el resumen, archivo, fuente, involucrados, identificadores, referencias o
  cualquier dato validado. Por defecto se ven todos los registros, con su estado.
- **Cuatro vistas** sobre los mismos datos: por expediente; por entidad (sus registros en todos los
  expedientes del encargo); por categoría (agrupada); línea de tiempo (por mes, de lo más antiguo
  a lo más reciente, lo que no tiene fecha al final).
- **Árbol lateral** expediente → entidad → categoría (`expediente_arbol`), con los mismos filtros de
  texto, estado, origen y fechas. Un registro con dos entidades cuenta en ambas; cada nivel trae su
  propio conteo, igual al total de la tabla al elegir ese nodo.
- **Detalle del registro:** además de datos y ubicación de origen, los vínculos y eventos que generó
  (por su evidencia) y su bitácora y la de su documento (`bitacora_registro`, con el correo de
  quien actuó).
- **Exportar CSV** (admin y auditor) la vista actual con sus filtros, hasta 10,000 filas. Una celda
  que empieza con `=`, `+`, `-` o `@` sale como texto (`'`) para que una hoja de cálculo no la
  ejecute. Queda en bitácora (`registro.exportacion`: vista, IDs de los filtros, si hubo búsqueda
  y filas); si la bitácora falla no se entrega el archivo.

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
- Formato de envío (verificado en la documentación de cada proveedor al implementar): el archivo va
  completo en base64. Anthropic: bloque `document` para PDF y bloque `image` para PNG, JPG y WEBP,
  con respuesta forzada por herramienta. OpenAI (Responses API): `input_file` con `file_data` para
  PDF e `input_image` para imágenes, con salida estructurada estricta. Límite de 20 MB por archivo;
  TIFF, Excel y correos no se leen con IA y quedan para captura manual.
- **Qué se pide:** por cada campo (comunes + `campos_esperados`) `valor`, `confianza` y `pagina`; la
  moneda; y la lista de involucrados con tipo, rol, RFC, CURP, confianza y página.
- **Qué se guarda** (`guardar_extraccion_ia`): una extracción `ia` por campo con dato y una por
  involucrado. Queda `validado` (automática) si la confianza alcanza el umbral y el valor se pudo
  normalizar; un RFC o CURP con formato inválido, o una fecha o monto ilegible, siempre va a la cola.
  La extracción no crea entidades ni eventos: eso ocurre al validar el registro.
- **Estados:** si ningún proveedor está permitido el registro queda `en_espera` con el motivo en
  `extraccion_nota` (no es un fallo) y vuelve a la cola al encender la IA del encargo o con
  «Reintentar lectura». Tras tres intentos fallidos queda `error`, disponible para captura manual.
- **Pruebas:** con `IA_SIMULADA=1` la respuesta sale de una línea de guion dentro del archivo de
  prueba; ningún proveedor recibe nada. Se ignora en producción.

### 7.1 Administrador de uso de IA

- **Proveedores:** `anthropic` y `openai`. Cada encargo declara en `encargo.ia_proveedores` a cuáles
  puede enviar documentos; vacío (valor inicial, incluso si el insert pide otra cosa) significa IA
  apagada en ese encargo. Solo un administrador lo cambia y queda en bitácora (`encargo.ia`).
- **Compuerta:** antes de cada llamada el procesador consulta `ia_permitida(encargo, proveedor)`:
  interruptor de la organización, proveedor permitido en el encargo, tope diario y tope mensual de
  tokens (día y mes en hora de México) y llave del proveedor presente. Si no pasa, no se llama y se
  registra como `bloqueada`.
- **Consumo:** `uso_ia`, una fila por llamada (proveedor, modelo, función, tokens de entrada y salida,
  resultado, código de error, duración, trabajo y registro). Nunca contenido. Append-only; la escribe
  el procesador y solo la leen los administradores.
- **Configuración:** `configuracion_ia` (interruptor y topes por organización; sin fila rigen
  2,000,000 diarios y 30,000,000 mensuales) y `precio_ia` (USD por millón de tokens de entrada y
  salida por modelo, que captura el administrador para estimar el costo).
- **Pantalla `/ia`** (solo administradores): estado, consumo de hoy y del mes contra los topes, costo
  estimado, desglose por modelo, encargo y función, errores y bloqueos recientes, estado de las llaves
  (sin mostrarlas) y los controles.
- **Respaldo:** Anthropic es el proveedor principal y OpenAI el de respaldo. Se cambia al respaldo
  solo cuando el principal llegó a su límite: la plataforma lo bloquea (tope propio en
  `tope_proveedor_ia`, no permitido en el encargo, sin llave o sin modelo) o el proveedor rechaza
  por cuota, saturación, crédito o credencial (429, 529, 402, 401, 403). Un fallo de otro tipo no
  cambia de proveedor: el trabajo se reintenta más tarde.

### 7.2 Validación

- **Cola** (`…/validacion`): documentos con `estado_extraccion = hecha` y
  `estado_validacion = pendiente`. Todo documento leído por la IA pasa por la cola, también cuando
  todos sus datos superaron el umbral: en ese caso llegan aceptados y basta confirmar. Las lecturas
  del documento asociado a una captura no entran a la cola (sirven para R11).
- **Pantalla** (`…/validacion/[registro]`): el original a la izquierda y el formulario de registro
  único (§6) a la derecha, con lo que propuso la IA. Cada dato muestra su confianza, su página y si
  está por revisar; enfocarlo lleva el documento a esa página. Atajos: Ctrl/⌘+Enter valida y pasa al
  siguiente; Alt+↓ y Alt+↑ recorren los datos por revisar.
- **Decisión por campo:** dejarlo igual lo **acepta** (`validado`); cambiarlo lo **corrige**
  (`corregido`: el valor nuevo queda en la extracción y lo que leyó la IA en
  `extraccion.valor_original`); vaciarlo o quitarlo lo **rechaza** (`rechazado`). Lo que agrega el
  auditor entra como extracción `manual`. La decisión la calcula el servidor comparando lo
  confirmado con lo leído (`construirValidacion`), no el navegador. Toda lectura recibe una decisión.
- **Decisión por registro:** validar (`validar_registro`) o rechazar con motivo
  (`rechazar_registro`). El registro queda `validado` si no hubo cambios, `corregido` si los hubo.
- **Materialización:** solo al validar se crean entidades, evento y evidencias
  (`privado.materializar_registro`, misma resolución que la captura manual). La evidencia de cada
  entidad apunta a la extracción que la sostiene. Un registro rechazado no crea nada.
- **Reglas:** después de validar se ejecutan las reglas del encargo. Todo queda en bitácora
  (`registro.validacion`, `registro.rechazo`).
- **R11:** en una captura con documento asociado, lo que la IA leyó del documento se compara campo
  por campo con lo capturado (montos con su moneda; textos sin distinguir mayúsculas, acentos ni
  puntuación). Una alerta por cada diferencia. Se ejecuta al terminar la lectura. Los involucrados
  no se comparan.

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
| R10 | Proveedor en lista 69-B del SAT como presunto (alta) o definitivo (crítica) |
| R11 | Captura manual que difiere del documento asociado después |
| R12 | Verificación en campo: un «no» en la cédula (domicilio o inmueble inexistente, proveedor no establecido, sin actividad, nadie confirma) |

- **Ejecución:** al terminar cada importación y a demanda desde `…/alertas`. Solo leen registros
  validados. Las 12 reglas están activas. R10 cuenta la
  coincidencia exacta por RFC y la propuesta por nombre solo si un auditor la confirmó; desvirtuado y
  sentencia favorable no alertan.
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
- **Ficha enriquecida:** detalle en §11.1.
- La búsqueda en otros expedientes nunca cruza organizaciones.

### 11.1 Fuentes de consulta

- **Fuentes por organización.** Toda organización nace con dos: «Otros expedientes» (interna,
  conector `otros_expedientes`) y «Lista 69-B del SAT» (externa, conector `lista_69b`). Un conector
  por organización.
- **Conector:** `ConectorFuente { conector, enviaDatos, aplica(entidad), buscar(entidad) }` en
  `apps/web/src/lib/fuentes/`. Por RFC o CURP la coincidencia es `exacta`; por nombre normalizado,
  `propuesta`. Cada resultado guarda fuente, hora de consulta y una `huella` (volver a consultar
  actualiza, no duplica).
- **Lista 69-B.** Se consulta sobre una copia local: ningún dato sale de la plataforma. Un `admin` la
  carga en `…/configuracion`: el navegador lee el CSV o Excel del SAT (UTF-8 o Windows-1252, `,` o `;`),
  muestra filas válidas, inválidas con su número y repetidas, y la envía por lotes; el servidor valida
  cada fila. Se guarda la huella SHA-256 del archivo; el original todavía no se sube
  (`carga_fuente.storage_path` queda reservado para hacerlo). La carga nueva queda `vigente` al
  cerrarse y la anterior pasa a `reemplazada`; si falla a medio camino, la anterior sigue vigente.
  Toda carga va a bitácora (`fuente.carga`).
- **Consulta:** trabajo `consulta_fuentes` (una entidad desde su ficha o todo el encargo desde la red,
  en lotes de 150). Roles `admin` y `auditor`. Al terminar se ejecutan las reglas.
- **Revisión:** el resultado solo cambia de `pendiente` a `confirmada` o `descartada` (con motivo de
  al menos 5 caracteres), con quién y cuándo. Lo encontrado no se edita. Todo va a bitácora.
- **Incorporación:** un resultado externo confirmado puede incorporarse una sola vez como registro
  (`origen = captura`, tipo `otro`, fuente = «<fuente> (consultada el …)», la entidad como titular).
- **Fuentes que envían datos fuera** (plantilla `api_ejemplo`, ninguna activa): solo se consultan
  para los encargos listados en `config.encargos_permitidos`; la llave vive en variables de entorno.

## 12. Exportaciones

Todo sale de la **generación más reciente** de la red (`packages/i2-export`, funciones puras; la ruta
es `…/red/exportar/<archivo>`). Botón «Exportar» en Red de vínculos y en cada expediente. Roles
`admin` y `auditor` (permiso `red.exportar`).

- **Alcance:** la red completa del encargo, o con `?expediente=<id>` solo las entidades de la red que
  aparecen en registros de ese expediente (por su entidad canónica) y los vínculos, eventos y
  alertas entre ellas.
- **i2 Analyst's Notebook:** `entidades.csv` (ID, nombre, tipo, tipo i2 sugerido, RFC, CURP,
  teléfono, riesgo declarado, nivel, puntaje, criterios), `vinculos.csv` (vínculos declarados) y
  `eventos.csv` (transferencias, llamadas y contratos como vínculos con fecha y monto; de un evento
  con más de dos participantes salen los dos primeros por rol). UTF-8 con BOM; las celdas que
  empiezan con `=`, `+`, `-`, `@` se neutralizan. `especificacion-i2.txt` explica la importación
  (columnas, tipos, íconos y orden) y lista cada CSV con sus filas y SHA-256.
- **GraphML:** `red.graphml` estándar (Gephi, yEd, Cytoscape); vínculos con `clase = vinculo` y
  eventos con `clase = evento`.
- **PDF de reporte:** `reporte.pdf` con pdf-lib en servidor (sin navegador headless) y la plantilla
  del prototipo: portada, resumen con indicadores, dibujo de la red (disposición por fuerzas
  determinista; hasta 400 entidades de mayor puntaje), entidades con nivel y criterios, alertas. Al
  pie de cada página: folio, fecha, autor y SHA-256 de los datos exportados. Esos datos (JSON
  canónico: listas ordenadas por ID y llaves ordenadas) van **adjuntos al PDF como `datos.json`**,
  así cualquiera recalcula el hash.
- **Folio:** identificador del expediente (o `RED`) + 8 caracteres aleatorios, p. ej.
  `EXP-2026-0001-7F3A2B1C`. Va en el nombre del archivo.
- **Bitácora:** `red.exportacion` con archivo, folio, expediente, conteos y SHA-256 (sin nombres ni
  montos). Si la bitácora no se puede escribir, no se entrega el archivo.

## 15. Analizador y hallazgos

- **Alcance:** un expediente (botón «Analizar» del expediente) o una entidad (botón «Analizar esta
  entidad» de su ficha; incluye las entidades fusionadas en ella). Solo aparecen y solo pueden
  entrar registros `validado` o `corregido` del alcance, hasta 300. El auditor elige cuáles entran.
- **Generación:** trabajo `sintesis` en segundo plano. Cada llamada pasa por `iaPermitida` y queda
  en `uso_ia` con función `sintesis`. Usa la misma política de respaldo que la extracción
  (`llamarConRespaldo`). Si la IA está bloqueada, la síntesis queda `en_espera` con su motivo; tras
  tres fallos del proveedor queda en `error`. Ambas se pueden reintentar.
- **Lo que ve el modelo:** por registro, una referencia corta (R1, R2…, nunca el ID), tipo, fecha,
  fuente, expediente, resumen, datos validados e involucrados. Todo va como JSON dentro de
  `<registros>`, con un prompt de sistema que declara que ese contenido es dato y no instrucciones
  (regla 8). Tope: unos 160,000 caracteres.
- **Validación de la salida** (`interpretarSintesis`):
  - Cada referencia se traduce a su ID.
  - Las citas inexistentes se descartan, y la afirmación que se queda sin citas no se guarda.
  - La base vuelve a verificar con un disparador que cada cita sea un registro validado del alcance.
  - Así, un documento que da órdenes no puede meter afirmaciones sin sustento ni citas ajenas,
    aunque el modelo obedezca. La prueba simula un modelo obediente.
- **Versiones:**
  - `ia`: la escribe solo el procesador y es inmutable.
  - `borrador`: la edita el auditor, que puede cambiar texto y citas, eliminar o agregar
    afirmaciones, y reducir el alcance. Quitar un registro del alcance quita sus citas, y las
    afirmaciones sin cita desaparecen (`acotarAfirmaciones`).
  - `aprobada`: se escribe al aprobar, con autor y fecha, y es inmutable.
  - El alcance solo se reduce. Para ampliarlo, se genera otra síntesis.
- **Bitácora:** `sintesis.alta`, `sintesis.borrador` (generada), `sintesis.alcance`,
  `sintesis.aprobada`, `sintesis.descartada`, `sintesis.en_espera`, `sintesis.error`.
- **Citas:** cada una abre el registro y, desde ahí, la página, hoja, fila o celda de origen.
- **Hallazgos:**
  - Los redacta un auditor; el texto de la síntesis no se copia.
  - Una síntesis aprobada se adjunta a un hallazgo sin firmar, o se crea uno nuevo desde ella
    (`crear_hallazgo`).
  - Firmar fija `firmado_por` y `firmado_en`; desde ahí el hallazgo no cambia.
  - Bitácora: `hallazgo.alta`, `hallazgo.cambio` y `hallazgo.sintesis`.
  - Nada crea hallazgos automáticamente.
- **Roles:** `admin` y `auditor` generan, editan, aprueban, redactan y firman; `lector` consulta.

## 16. Verificación en campo

Solo confirma la **existencia** del proveedor en su domicilio; no es una inspección del bien o del
servicio.

- **Programa de trabajo (`…/verificacion`):** propone las entidades `persona_moral` o
  `persona_fisica` de nivel crítico o alto en la red más reciente sin visita abierta (los críticos
  vienen marcados). El auditor elige, asigna a un auditor o verificador activo
  (`verificadores_organizacion`) y escribe instrucciones. `crear_visitas` prellena los domicilios
  (entidades `domicilio` vinculadas y el dato `domicilio` validado) y hasta 20 documentos validados
  con su monto. Cancelar exige motivo.
- **App (`/campo`):** PWA para el celular personal del verificador.
  - Primero, el **aviso de confidencialidad y protección de datos** (`AVISO_CONFIDENCIALIDAD`,
    versión en `privado.version_aviso_campo()`); sin aceptarlo no se ven documentos ni se puede
    subir nada. Cambiar el texto exige subir la versión: todos lo vuelven a aceptar.
  - El **aviso de privacidad simplificado** (`AVISO_PRIVACIDAD_SITIO`) se muestra a quien atiende,
    con el nombre de la organización como responsable. Pendiente de revisión jurídica (§14).
  - Cédula con 5 preguntas (`PREGUNTAS_CAMPO`), domicilio observado, observaciones y de 1 a 10 fotos
    con hora, ubicación y SHA-256 calculado en el teléfono.
- **Sin señal:** las visitas se descargan a IndexedDB y caducan a las **24 h** sin volver a
  descargarse. La cédula y sus fotos quedan en el teléfono hasta enviarse; pasadas 24 h se advierte.
  El envío es automático al volver la conexión (evento `online` y reintento cada minuto). Al enviarse
  se borran del teléfono; «Borrar datos de este teléfono» y «Salir» borran todo, incluida la caché del
  service worker. El service worker (`/sw.js`) solo guarda la página `/campo` (sin datos) y los
  estáticos; nunca respuestas de la API, de Supabase ni fotos.
- **Envío:** cada foto sube directo al bucket privado `campo`
  (`{organizacion}/{encargo}/{visita}/{evidencia}.{ext}`, 15 MB, solo imágenes, sin UPDATE ni
  DELETE). `POST /api/campo/evidencia` la descarga, recalcula el SHA-256, revisa los primeros bytes y
  llama a `campo_registrar_evidencia`. `POST /api/campo/cedula` llama a `campo_guardar_cedula`, que
  crea el registro de origen `campo` (validado por quien verificó, fuente «Verificación en campo ·
  visita …»), lo liga a la entidad (rol `verificado`), cierra la visita y encola las reglas. Todo es
  idempotente por los IDs generados en el teléfono.
- **Alertas:** R12, una por cada «no», con la cédula como evidencia. Severidad: crítica para
  domicilio, inmueble y proveedor; alta para actividad; media para confirmación. «No se pudo
  verificar» no alerta. El hallazgo lo decide el auditor.
- **Bitácora:** `campo.visita`, `campo.visita_cambio`, `campo.aviso`, `campo.evidencia`,
  `campo.cedula`.

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
- Verificación en campo (R12): 3 entidades críticas (Atlantic Trade Panama, Golden Gate Ltd Suiza,
  Inversiones Aurora BVI) y 8 altas de tipo persona se proponen para visita.

## 14. Decisiones pendientes con el cliente

Cada una tiene un valor provisional para no detener el desarrollo.

| Decisión | Valor provisional | Dónde se cambia |
|---|---|---|
| Catálogo de categorías y tipos de documento | Tabla de §6 | `…/configuracion` |
| Regla para generar identificadores de expediente | `EXP-AAAA-NNNN` | Función SQL |
| Pesos y umbrales de la calificación | Tabla de §9 | `regla_calificacion` |
| Inventario de bases de datos para la ficha | Otros expedientes + lista 69-B (CSV o Excel) | `fuente_consulta` (§11.1) |
| Umbral de confianza de la IA | 0.85 | `encargo.umbral_confianza` |
| Texto del aviso de confidencialidad y del aviso de privacidad en sitio (revisión jurídica) | Borrador de §16 | `packages/modelo/src/campo.ts` + `privado.version_aviso_campo()` |
| Ventana sin señal de la app de campo | 24 h | `HORAS_MAXIMAS_SIN_ENVIAR` |
