# Informe de endurecimiento (tarea 13)

Fecha: 17/11/2026. Alcance: base de datos de producción (solo lectura), código de `main` y la suite
de CI. Cambios en la rama `feat/13-endurecimiento`, migración `20261117000021_endurecimiento.sql`.

**Resumen:** hallazgos críticos abiertos: 0. Hallazgos altos abiertos: 0. Queda una advertencia de
Supabase que solo se cierra desde el panel: *Leaked password protection*, que requiere plan Pro.

## Hallazgos y correcciones

| # | Severidad | Hallazgo | Corrección | Estado |
|---|---|---|---|---|
| 1 | Crítica (rendimiento) | El expediente documental con 50,000 registros no respondía: más de 10 min por consulta. Había dos causas. Faltaban índices por `registro_id` en `extraccion` y `evidencia`, y la RLS evaluaba la membresía en cada fila de cada subconsulta. | Índices nuevos. Las políticas usan `organizacion_id = any ((select privado.mis_organizaciones(...))::uuid[])`, que se calcula una vez por consulta. El expediente primero filtra y pagina con lo mínimo (`privado.expediente_filas`) y arma el detalle solo de la página. Corre como dueño después de verificar la membresía del encargo. | Corregido: 0.8–2.5 s por consulta con 50,000 registros, por debajo del límite de 8 s de Supabase (ver «Prueba de carga») |
| 2 | Alta | Por la API, un auditor podía modificar directamente entidades, vínculos, eventos, participantes, menciones, alias, extracciones y propuestas de fusión. Esos cambios no pasaban por la bitácora (reglas 1 y 3). | Vínculos, eventos, participantes, menciones y alias: sin permiso de UPDATE, porque nada los modifica. Entidad, extracción y fusión: un disparador rechaza el PATCH directo y solo acepta cambios dentro de funciones de la plataforma (`/rpc/…`). | Corregido (pgTAP `16_endurecimiento`) |
| 3 | Media | Nueve funciones SECURITY DEFINER expuestas en la API. Una de ellas, `registrar_acceso_fallido`, se podía llamar sin sesión (asesores 0028 y 0029). | El cuerpo pasa a `privado` y en `public` queda una envoltura SECURITY INVOKER con la misma firma. `anon` solo ejecuta el registro de accesos fallidos, que ya tenía tope de 10 por hora por usuario. | Corregido |
| 4 | Media (rendimiento) | La vista de la red con 5,000 entidades: el diseño por fuerzas (cose) crece con el cuadrado de las entidades y congelaba el navegador. Las lecturas por lotes iban una tras otra. | Arriba de 1,500 entidades visibles se dibuja en rejilla empaquetada, con aviso. Lotes en paralelo (6 a la vez). | Corregido (e2e `carga.spec.ts`) |
| 5 | Media | Contraste insuficiente: texto secundario `#5d6779` (2.8:1) y rojo de error `#c65a4a` (3.8:1) sobre paneles. | `#808a9c` (4.6:1) y `#e2705f` (5.2:1). | Corregido |
| 6 | Media | Sin enlace para saltar al contenido ni estilo de foco visible para teclado. | Enlace «Saltar al contenido» y `:focus-visible` dorado. | Corregido (e2e `accesibilidad.spec.ts`) |
| 7 | Media | Sin página de «no encontrado» ni de error global: Next mostraba su pantalla genérica en inglés. | `not-found.tsx` (mismo mensaje si no existe o si es de otra organización) y `global-error.tsx`. | Corregido (e2e `estados.spec.ts`) |
| 8 | Baja | El procesador de trabajos registraba `e.message`, que puede traer texto de un servicio externo (regla 7). | Solo registra el tipo de error. | Corregido |
| 9 | Baja | El asesor de rendimiento reportó 2 llaves foráneas sin índice: `lista_69b` y `organizacion.creado_por`. | Índices nuevos. | Corregido |
| 10 | Baja | Permisos sobrantes: DELETE sobre `organizacion` (sin política) y escritura sobre la vista `importacion_resumen`. | Revocados. | Corregido |
| 11 | Media | *Leaked password protection* desactivado en Auth. | Es un ajuste del panel y requiere plan Pro. | **Abierto: lo cierra el administrador del proyecto** |
| 12 | Info | 93 índices «sin uso» (el asesor mide con muy poco tráfico) y conexiones de Auth en número fijo. | No se eliminan: sirven a las llaves foráneas y a las consultas de RLS. Revisar con tráfico real. | Aceptado |

## Auditoría de RLS, tabla por tabla

Todas las tablas de `public` tienen RLS activo. Todas las políticas filtran por `organizacion_id` de la
membresía activa del usuario; la escritura queda limitada por rol.

| Grupo | Tablas | Lectura | Escritura |
|---|---|---|---|
| Organización y acceso | `organizacion`, `miembro` | miembros | admin; `miembro` con candados (no quitarse el último admin) y bitácora |
| Bitácora | `bitacora` | miembros | INSERT con `actor = auth.uid()`; sin UPDATE ni DELETE (privilegios, RLS y disparador) |
| Catálogo y configuración | `categoria_documental`, `tipo_documento`, `plantilla_importacion`, `regla_calificacion`, `configuracion_ia`, `tope_proveedor_ia`, `precio_ia`, `fuente_consulta` | miembros | admin |
| Encargo | `encargo`, `expediente` | miembros | admin y auditor; IA del encargo solo admin (disparador) |
| Evidencia | `documento_origen`, `registro`, `extraccion`, `evidencia`, `entidad`, `alias_entidad`, `vinculo`, `evento`, `evento_participante`, `registro_entidad` | miembros | INSERT admin y auditor. UPDATE: `registro` (con bitácora); `extraccion` y `entidad` solo por funciones; las demás, ninguno. `documento_origen` y `evidencia`: inmutables |
| Red y reglas | `red_generada`, `red_nodo`, `red_vinculo`, `calificacion`, `alerta`, `fusion_propuesta`, `hallazgo`, `hallazgo_alerta` | miembros | admin y auditor. Las redes son inmutables. Ajustes, resoluciones y fusiones van a bitácora |
| Fuentes | `carga_fuente`, `lista_69b`, `resultado_consulta` | miembros | listas: admin. Resultados: solo service role los crea; los auditores los revisan con candados |
| Operación | `trabajo`, `uso_ia` | miembros; `uso_ia` solo admin | `trabajo`: INSERT admin y auditor; lo procesa service role. `uso_ia`: solo service role |

**Storage:** el bucket `originales` es privado. INSERT solo en la ruta `<organización>/<encargo>/…`
del encargo propio (`privado.puede_subir_original`). SELECT para miembros. No hay políticas de UPDATE
ni de DELETE.

**Pendiente para la tarea que construya hallazgos:** `hallazgo` admite UPDATE de admin y auditor;
cuando exista la pantalla, un hallazgo firmado debe quedar inmutable.

## Búsqueda en el código

| Revisión | Resultado |
|---|---|
| `innerHTML`, `dangerouslySetInnerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, `new Function` | Ninguno en `apps/web/src` ni en `packages/*/src` |
| Llave de servicio | Solo `lib/supabase/servicio.ts` (marcado `server-only`), usado por `lib/trabajos.ts` (procesador) y `lib/usuarios-admin.ts` (alta de cuentas). Los demás módulos importan solo el tipo |
| Datos personales en registros | 31 `console.error`: todos con IDs, códigos de error o nombres de acción. Se corrigió el del procesador (hallazgo 8) |
| IA simulada | `IA_SIMULADA` se ignora cuando `VERCEL_ENV = production` |

## Prueba de carga

Los datos sintéticos están en `supabase/carga/sembrar.sql`; CI los siembra antes de la suite e2e:

- 5,000 entidades y 7,500 vínculos;
- una red generada con calificaciones;
- un expediente con 50,000 registros, 50,000 extracciones y 100,000 menciones.

| Medición (Postgres local, sin red) | Antes | Después |
|---|---|---|
| Expediente: página 1 (50 de 50,000) | > 10 min (se canceló) | 0.95 s |
| Expediente: página 900 | > 10 min | 0.90 s |
| Expediente: filtro por entidad | > 10 min | 0.79 s |
| Expediente: orden por calificación | > 10 min | 1.3 s |
| Expediente: búsqueda de texto | > 10 min | 2.0 s |
| Árbol del expediente | > 10 min | 1.5 s |
| Árbol con búsqueda | > 10 min | 2.5 s |
| Nodos de la red (5,000) | 2 ms | 2 ms |

Los tiempos de navegador quedan en las anotaciones de `e2e/carga.spec.ts` en cada corrida de CI. Los
límites que la prueba exige: vista de la red en menos de 60 s, centrar una entidad en menos de 15 s,
cada página del expediente en menos de 30 s.

**Siguiente mejora, no bloqueante:** una tabla de resumen por registro, con el texto buscable y las
entidades, bajaría la búsqueda y el árbol a menos de 0.5 s.

## Suite e2e de los hitos A y B

| Hito | Flujo | Prueba |
|---|---|---|
| A | Acceso, roles, lector sin escritura | `admin`, `auditor`, `lector`, `usuarios` |
| A | Importar los tres Excel con sus valores esperados | `importacion` |
| A | Generar y calificar la red; diferencias entre generaciones | `red` |
| A | Vista dinámica: centrar, 2 saltos, atrás del navegador, ficha | `vista-red` |
| A | Reglas R02–R04 y resolución de alertas | `alertas` |
| B | Ingreso de documentos con SHA-256 y duplicados | `ingreso` |
| B | Captura manual | `captura` |
| B | Extracción con IA (simulada), respaldo OpenAI y validación | `extraccion`, `uso-ia` |
| B | Expediente documental: árbol, vistas, búsqueda, exportación | `expediente` |
| C | Estados vacíos y no encontrado | `estados` |
| C | Accesibilidad WCAG 2.1 AA en 15 pantallas y navegación con teclado | `accesibilidad` |
| C | Carga: 5,000 entidades y 50,000 registros | `carga` |
| — | Fuentes de consulta y exportaciones | `fuentes`, `exportaciones` |

## Asesores de Supabase

- **Antes:** 3 advertencias de seguridad (9 hallazgos) y 2 de rendimiento con nivel INFO.
- **Después de fusionar:** se vuelven a correr. Esperado: solo *Leaked password protection*, hasta que se active en el panel.

Operación, respaldo y restauración: `docs/OPERACION.md`.
