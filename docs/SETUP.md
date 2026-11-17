# Configuración — GitHub, Supabase y Vercel

Se hace una sola vez, antes de la tarea 00.

## 1. Herramientas locales

Node LTS, pnpm, Docker (para `supabase start`), Supabase CLI, GitHub CLI (`gh`), Vercel CLI y Claude Code.

## 2. GitHub

1. Crea el repositorio **privado** `I2-ASF` y clónalo.
2. Copia a la raíz `CLAUDE.md` y la carpeta `docs/`. Copia los tres Excel a `fixtures/` y el HTML a `legacy/`.
3. Protege `main`: PR obligatorio, check `ci` en verde, sin push directo.
4. Secretos del repositorio (Settings → Secrets → Actions):

| Secreto | Valor |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Token personal de Supabase |
| `SUPABASE_PROJECT_REF` | Referencia del proyecto de producción |
| `SUPABASE_DB_PASSWORD` | Contraseña de la base de producción |

Los fixtures son datos de ejemplo. Datos reales de un cliente nunca entran al repositorio.

## 3. Supabase

| Entorno | Qué es | Uso |
|---|---|---|
| Local | `supabase start` | Desarrollo y pruebas |
| `sigma-staging` | Proyecto remoto | Vistas previas de Vercel |
| `sigma-prod` | Proyecto remoto | Producción |

Si empiezas con un solo proyecto remoto, úsalo como producción y trabaja las vistas previas contra local.

En cada proyecto remoto:
1. Región más cercana a los usuarios. Guarda la contraseña de la base en un gestor de secretos.
2. Authentication: proveedor de correo activo, **alta pública desactivada** (acceso por invitación).
   Agrega las URLs de Vercel (producción y vistas previas) a las URLs de redirección.
3. No crees tablas, buckets ni políticas a mano: todo llega por migraciones.

### 3.1 Acceso de usuarios (invitaciones)

Para que el alta de usuarios funcione en producción, en Supabase → Authentication:

1. **URL Configuration → Site URL:** la URL pública de la plataforma (p. ej.
   `https://i2-sigma-asf.vercel.app`).
2. **URL Configuration → Redirect URLs:** agrega `https://<dominio>/acceso/contrasena`. Sin esto,
   el enlace de la invitación no regresa a la pantalla donde el usuario define su contraseña.
3. **Sign In / Providers:** el alta pública (`Allow new users to sign up`) queda desactivada; las
   cuentas solo se crean desde la pantalla de Usuarios.
4. **Correo:** el servicio integrado de Supabase envía muy pocos correos por hora y es solo para
   pruebas. Para invitar con regularidad configura un SMTP propio (Authentication → Emails → SMTP
   Settings). Mientras tanto, el alta con contraseña temporal no depende del correo.

## 4. Vercel

1. Importa el repositorio. **Root Directory:** `apps/web`. Framework: Next.js.
2. Variables de entorno (ver tabla). Producción apunta a `sigma-prod`; Preview, a `sigma-staging`.
3. Protección de despliegues activada para las vistas previas.
4. Cron: lo define `apps/web/vercel.json` y llama a `/api/trabajos/procesar` cada 5 minutos (requiere
   plan Pro; en Hobby Vercel solo acepta crons diarios). Vercel manda `Authorization: Bearer $CRON_SECRET`;
   sin `CRON_SECRET` o sin `SUPABASE_SERVICE_ROLE_KEY` el procesador responde 503 y no hace nada.

| Variable | Dónde | Notas |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente y servidor | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente y servidor | Clave pública; la protección real es RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo servidor** | Procesador de trabajos y alta de cuentas de usuario (ESPECIFICACION §3.1) |
| `ANTHROPIC_API_KEY` | Solo servidor | Extracción con IA |
| `ANTHROPIC_MODEL` | Solo servidor | Modelo a usar; se cambia sin tocar código |
| `OPENAI_API_KEY` | Solo servidor | Opcional. Proveedor de respaldo cuando Anthropic llega a su límite; solo en encargos que lo permitan |
| `OPENAI_MODEL` | Solo servidor | Modelo de OpenAI a usar; sin él, el respaldo no se usa |
| `OPENAI_REASONING_EFFORT` | Solo servidor | Opcional. Esfuerzo de razonamiento de OpenAI (`low`, `medium`, `high`…); sin valor rige el del modelo |
| `IA_SIMULADA` | Solo pruebas | `1` en local y CI: la extracción no llama a ningún proveedor. Se ignora en producción |
| `CRON_SECRET` | Solo servidor | Autoriza la llamada del cron |

Para desarrollo local: copia `.env.example` a `apps/web/.env.local` y llénalo con los valores que
imprime `supabase status`. `.env.local` nunca se sube.

## 5. Integración continua

Dos flujos en `.github/workflows/` (los crea la tarea 00):

| Flujo | Se dispara | Hace |
|---|---|---|
| `ci.yml` | Cada PR | `pnpm install`, `lint`, `typecheck`, `test`; levanta Supabase local y corre `supabase db reset` para validar migraciones |
| `migraciones.yml` | Push a `main` que toque `supabase/migrations/` | `supabase link` + `supabase db push` contra producción |

**Producción solo cambia por este flujo.** Nadie aplica migraciones a producción a mano, ni por CLI ni
por MCP. Vercel despliega solo: vista previa por PR, producción al fusionar.

Orden al fusionar: la migración debe ser compatible con el código anterior (primero agregar, después
quitar), porque base y despliegue no cambian en el mismo instante.

## 6. Flujo de trabajo por tarea

```
git switch -c feat/NN-nombre      # una rama por tarea de docs/PROMPTS.md
claude                            # pega el prompt de la tarea
# Claude Code propone plan → implementa → corre pruebas → abre PR
gh pr view --web                  # revisa el diff y la vista previa de Vercel
# fusiona → migración a producción + despliegue
```

## 7. Claude Code

- Lee `CLAUDE.md` automáticamente. No repitas su contenido en los prompts.
- Los conectores MCP de Supabase y Vercel son útiles para **leer** (tablas, logs, asesores de
  seguridad, estado de despliegues). Apúntalos a staging; para producción, solo lectura.
- Empieza cada tarea en una sesión nueva. Si una sesión se alarga, pídele un resumen de estado,
  ciérrala y continúa en otra con el prompt de continuidad de `docs/PROMPTS.md`.

## 8. Verificación antes de la tarea 00

- [ ] `gh repo view` muestra el repositorio privado y `main` protegida.
- [ ] `supabase start` levanta el stack local.
- [ ] El proyecto de Vercel está ligado al repositorio con Root Directory `apps/web`.
- [ ] Las seis variables están cargadas en Vercel para Production y Preview.
- [ ] Los tres secretos están en GitHub.
- [ ] `CLAUDE.md`, `docs/`, `fixtures/` y `legacy/` están en la raíz.
