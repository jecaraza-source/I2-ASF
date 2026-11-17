# Operación — despliegue, respaldo y restauración

Complementa `docs/SETUP.md`. Producción: Vercel `i2-sigma-asf` + Supabase `jgzvgowvkeblzaaxkqta`.

## 1. Lista de verificación de despliegue

### Antes de fusionar un PR

- [ ] CI en verde: `lint`, `typecheck`, `test`, pruebas de base (`supabase test db`) y e2e (incluye
      carga y accesibilidad).
- [ ] Si trae migración: es **compatible con el código anterior** (primero agregar, después quitar).
      La base cambia unos segundos antes que la app.
- [ ] Si trae migración: se probó con `supabase db reset` y no reescribe datos sin respaldo previo
      (ver §2.3).
- [ ] La vista previa de Vercel abre y el flujo tocado funciona.
- [ ] `docs/ESPECIFICACION.md` actualizado si cambió el modelo.

### Al fusionar

- [ ] El flujo `migraciones` (Supabase `db push`) termina en verde. Si falla, **no** reintentar a mano:
      revisar el registro, corregir en un PR nuevo.
- [ ] El despliegue de producción en Vercel queda `READY`.
- [ ] Asesores de Supabase (Security y Performance) sin advertencias nuevas.
- [ ] Prueba de humo en producción: ingresar, abrir un encargo, el expediente y la red.

### Configuración que debe existir (una vez)

| Dónde | Qué | Estado |
|---|---|---|
| Supabase → Auth → URL Configuration | Site URL `https://i2-sigma-asf.vercel.app`; Redirect URL `…/acceso/contrasena` | Pendiente de confirmar |
| Supabase → Auth → SMTP | Resend con dominio verificado | Pendiente de confirmar |
| Supabase → Auth → Password security | Protección de contraseñas filtradas; mínimo 10 caracteres con letras y números | Pendiente (requiere Pro) |
| Supabase → Database → Backups | Plan con respaldos diarios (Pro) y, si el contrato lo pide, PITR | Pendiente de decidir |
| Vercel → Environment Variables (Production) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT` | `OPENAI_*` pendientes de confirmar |
| Vercel | `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` **sin** prefijo `NEXT_PUBLIC_` | Verificar |
| GitHub → Secrets | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` | Listo |

### Revertir un despliegue

- **App:** en Vercel, *Deployments* → el último despliegue bueno → *Promote to Production*. No toca
  la base.
- **Base:** las migraciones no se revierten en producción. Se corrige con una migración nueva que
  deshaga el cambio. Si hubo pérdida de datos, ver §2.3.

## 2. Respaldo y restauración de la base

### 2.1 Qué se respalda y dónde

| Qué | Cómo | Retención |
|---|---|---|
| Base completa (datos, RLS, funciones) | Respaldo diario automático de Supabase (plan Pro) | 7 días (Pro), 14 (Team), 30 (Enterprise) |
| Cualquier minuto de los últimos días | PITR (complemento de Supabase) | Según el complemento |
| Esquema | `supabase/migrations/` en Git | Permanente |
| Archivos originales | Bucket privado `originales` (sin UPDATE ni DELETE) | Permanente; **no** entra en el respaldo de la base |
| Respaldo propio fuera de Supabase | `pg_dump` mensual (§2.2) | Lo que defina el cliente |

En el plan Free no hay respaldos descargables: para trabajar con un cliente real usa Pro como mínimo.

### 2.2 Respaldo manual (`pg_dump`)

Desde una máquina con `psql` 17 y la cadena de conexión *Session pooler* del panel
(*Connect → Session pooler*); la contraseña nunca se escribe en archivos del repositorio.

```bash
export PGURL='postgresql://postgres.<ref>:<contraseña>@aws-0-<región>.pooler.supabase.com:5432/postgres'
fecha=$(date +%Y%m%d)
pg_dump "$PGURL" --format=custom --no-owner --no-privileges \
  --schema=public --schema=privado --file "sigma-$fecha.dump"
# Usuarios de Auth (correos y metadatos; sin contraseñas en claro):
pg_dump "$PGURL" --format=custom --data-only --table=auth.users --file "sigma-auth-$fecha.dump"
sha256sum sigma-*-"$fecha".dump sigma-"$fecha".dump > "sigma-$fecha.sha256"
```

Guarda los `.dump` y su `.sha256` cifrados (contienen RFC, nombres y montos) en el almacenamiento
que autorice el cliente. Nunca en el repositorio ni en un chat.

Archivos originales: `supabase storage cp -r ss:///originales ./originales-$fecha --experimental`
(con la CLI enlazada al proyecto), y su lista de SHA-256 se compara contra `documento_origen.sha256`.

### 2.3 Restauración

1. **Elegir el punto:** respaldo diario (panel → *Database → Backups → Restore*) o un minuto exacto
   con PITR. La restauración **reemplaza** la base del proyecto: avisa a los usuarios y detén el cron
   (Vercel → *Settings → Cron Jobs → Disable*).
2. **Ensayo primero:** restaura en un proyecto de Supabase nuevo (*Restore to new project*, o
   `pg_restore` del dump propio) y verifica ahí antes de tocar producción:
   ```bash
   pg_restore --dbname "$PGURL_NUEVO" --no-owner --no-privileges --clean --if-exists sigma-AAAAMMDD.dump
   ```
3. **Verificar:**
   - `select count(*) from public.registro;` y demás conteos contra el último reporte conocido.
   - `select max(en) from public.bitacora;` coincide con el punto elegido.
   - Las migraciones aplicadas (`supabase_migrations.schema_migrations`) son las de `main`.
   - Asesores de seguridad sin advertencias nuevas.
   - Un PDF exportado antes del incidente: su `datos.json` adjunto vuelve a dar el mismo SHA-256 (§12).
4. **Reanudar:** reactivar el cron, prueba de humo (§1) y registro del incidente: qué se perdió entre
   el punto restaurado y el incidente, y cómo se recapturó.

### 2.4 Simulacro

Una vez por trimestre: restaurar el último respaldo en un proyecto aparte, correr la verificación de
§2.3 y anotar fecha, duración y resultado en este archivo.

| Fecha | Respaldo usado | Duración | Resultado | Quién |
|---|---|---|---|---|
| — | — | — | Pendiente el primero | — |
