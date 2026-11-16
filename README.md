# Plataforma SIGMA

Plataforma de integración de fuentes para auditoría: recibe documentos y datos, los convierte en
registros trazables (IA + validación humana), los ordena en expedientes, genera y califica la red de
vínculos y detecta inconsistencias entre fuentes.

## Documentación

| Archivo                                            | Contenido                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                           | Reglas no negociables, stack, convenciones y protocolo de trabajo     |
| [`docs/ESPECIFICACION.md`](docs/ESPECIFICACION.md) | Modelo de datos, módulos, reglas y fixtures (fuente de verdad)        |
| [`docs/PROMPTS.md`](docs/PROMPTS.md)               | Tareas en orden: una tarea = una rama = un PR                         |
| [`docs/SETUP.md`](docs/SETUP.md)                   | GitHub, Supabase, Vercel, variables de entorno e integración continua |

## Estructura

```
apps/web/              Next.js (App Router): UI, server actions, route handlers
packages/modelo/       Tipos de la base + esquemas zod
packages/importador/   Lectura de Excel y normalización
packages/red/          Resolución de entidades, generación y calificación de la red
packages/reglas/       Reglas de validación cruzada R01–R11
packages/i2-export/    Exportación a Analyst's Notebook y GraphML
supabase/              Configuración, migraciones y seed
fixtures/              Excel de ejemplo con valores esperados
legacy/                Prototipo HTML (solo referencia visual)
```

## Arranque local

Requisitos: Node 22+, pnpm 10, Docker.

```bash
pnpm install
cp .env.example apps/web/.env.local   # llénalo con lo que imprime `pnpm exec supabase status`
pnpm exec supabase start              # stack local de Supabase
pnpm dev                              # http://localhost:3000
```

## Comandos

| Comando                       | Qué hace                                                 |
| ----------------------------- | -------------------------------------------------------- |
| `pnpm dev`                    | Servidor de desarrollo de `apps/web`                     |
| `pnpm build`                  | Build de producción de `apps/web`                        |
| `pnpm lint`                   | ESLint en todo el monorepo                               |
| `pnpm typecheck`              | TypeScript en todo el monorepo                           |
| `pnpm test`                   | Pruebas unitarias (vitest) de `packages/*`               |
| `pnpm test:e2e`               | Pruebas de flujo (Playwright) de `apps/web`              |
| `pnpm tipos`                  | Regenera `packages/modelo/src/db.ts` desde la base local |
| `pnpm exec supabase db reset` | Aplica migraciones y seed en local                       |

Producción solo cambia al fusionar a `main` (ver `docs/SETUP.md` §5).
