import { puede } from "@sigma/modelo";
import { NOMBRE_REGLA, REGLAS } from "@sigma/reglas";
import Link from "next/link";
import { FormularioEjecutarReglas } from "@/components/alertas/formularios";
import {
  CLASE_SEVERIDAD,
  NOMBRE_ESTADO,
  NOMBRE_SEVERIDAD,
  SEVERIDADES,
} from "@/components/alertas/presentacion";
import { EstadoVacio } from "@/components/estados";
import { Panel, Titulo } from "@/components/ui";
import { obtenerEncargo } from "@/lib/datos";
import { leerTodo } from "@/lib/red-datos";
import { detalleAlertaSchema } from "@/lib/reglas-datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

const ESTADOS = ["abierta", "confirmada", "descartada"] as const;

export default async function Alertas({
  params,
  searchParams,
}: {
  params: Promise<{ encargo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { encargo: id } = await params;
  const encargo = await obtenerEncargo(id);
  const { activa } = await requerirOrganizacion();
  const sp = await searchParams;
  const uno = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const filtro = {
    estado: (ESTADOS as readonly string[]).includes(uno("estado")) ? uno("estado") : "abierta",
    severidad: (SEVERIDADES as readonly string[]).includes(uno("severidad"))
      ? uno("severidad")
      : "",
    regla: /^R\d{2}$/.test(uno("regla")) ? uno("regla") : "",
  };

  const supabase = await clienteServidor();
  const todas = await leerTodo((d, h) =>
    supabase
      .from("alerta")
      .select("id, regla, severidad, estado, vigente, detalle, creado_en")
      .eq("encargo_id", encargo.id)
      .order("creado_en", { ascending: false })
      .order("id")
      .range(d, h),
  );
  const delEstado = todas.filter((a) => a.estado === filtro.estado);
  const visibles = delEstado
    .filter(
      (a) =>
        (!filtro.severidad || a.severidad === filtro.severidad) &&
        (!filtro.regla || a.regla === filtro.regla),
    )
    .sort(
      (a, b) =>
        SEVERIDADES.indexOf(a.severidad as (typeof SEVERIDADES)[number]) -
          SEVERIDADES.indexOf(b.severidad as (typeof SEVERIDADES)[number]) ||
        a.regla.localeCompare(b.regla),
    );
  const base = `/encargos/${encargo.id}/alertas`;
  const enlace = (cambios: Partial<typeof filtro>) => {
    const f = { ...filtro, ...cambios };
    const q = new URLSearchParams();
    if (f.estado !== "abierta") q.set("estado", f.estado);
    if (f.severidad) q.set("severidad", f.severidad);
    if (f.regla) q.set("regla", f.regla);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const chip = (activo: boolean) =>
    `rounded border px-2 py-0.5 text-xs ${activo ? "border-oro text-oro" : "border-linea-2 text-tenue hover:text-texto"}`;
  const cuenta = <T extends string>(lista: typeof todas, campo: "severidad" | "regla", v: T) =>
    lista.filter((a) => a[campo] === v).length;

  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Titulo>Alertas</Titulo>
      <p className="-mt-3 mb-6 max-w-3xl text-sm text-tenue">
        Las reglas comparan lo que dicen las fuentes entre sí. Una alerta es una contradicción por
        revisar, no un hallazgo: el auditor la confirma o la descarta con motivo.
      </p>

      {puede(activa.rol, "reglas.ejecutar") ? (
        <Panel className="mb-6">
          <FormularioEjecutarReglas encargoId={encargo.id} />
          <p className="mt-2 text-xs text-tenue">
            También se ejecutan solas al terminar cada importación. Desactivadas:{" "}
            {REGLAS.filter((r) => !r.activa)
              .map((r) => `${r.id} (${r.nota})`)
              .join(" · ")}
          </p>
        </Panel>
      ) : null}

      <nav aria-label="Filtros" className="mb-4 flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-20 text-xs text-tenue">Estado</span>
          {ESTADOS.map((e) => (
            <Link
              key={e}
              href={enlace({ estado: e })}
              className={chip(filtro.estado === e)}
              aria-current={filtro.estado === e ? "true" : undefined}
            >
              {NOMBRE_ESTADO[e]} ({todas.filter((a) => a.estado === e).length})
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-20 text-xs text-tenue">Severidad</span>
          <Link href={enlace({ severidad: "" })} className={chip(!filtro.severidad)}>
            Todas
          </Link>
          {SEVERIDADES.map((s) => (
            <Link key={s} href={enlace({ severidad: s })} className={chip(filtro.severidad === s)}>
              {NOMBRE_SEVERIDAD[s]} ({cuenta(delEstado, "severidad", s)})
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-20 text-xs text-tenue">Regla</span>
          <Link href={enlace({ regla: "" })} className={chip(!filtro.regla)}>
            Todas
          </Link>
          {REGLAS.filter((r) => cuenta(delEstado, "regla", r.id) > 0).map((r) => (
            <Link
              key={r.id}
              href={enlace({ regla: r.id })}
              className={chip(filtro.regla === r.id)}
              title={r.nombre}
            >
              {r.id} ({cuenta(delEstado, "regla", r.id)})
            </Link>
          ))}
        </div>
      </nav>

      {visibles.length === 0 ? (
        <EstadoVacio
          titulo={todas.length ? "No hay alertas con estos filtros." : "Aún no hay alertas."}
          descripcion={
            todas.length
              ? "Cambia el estado, la severidad o la regla."
              : "Importa un archivo o ejecuta las reglas para contrastar las fuentes del encargo."
          }
        />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Alertas">
          {visibles.map((a) => {
            const d = detalleAlertaSchema.parse(a.detalle);
            return (
              <li key={a.id} className="rounded-lg border border-linea bg-panel px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-xs ${CLASE_SEVERIDAD[a.severidad] ?? ""}`}
                  >
                    {NOMBRE_SEVERIDAD[a.severidad] ?? a.severidad}
                  </span>
                  <span className="font-mono text-xs text-tenue" title={NOMBRE_REGLA[a.regla]}>
                    {a.regla}
                  </span>
                  <Link
                    href={`${base}/${a.id}`}
                    className="text-sm text-texto hover:text-oro hover:underline"
                  >
                    {d.titulo}
                  </Link>
                  {!a.vigente ? (
                    <span className="rounded border border-linea-2 px-1.5 py-0.5 text-xs text-tenue">
                      Ya no se reproduce
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-tenue">{d.descripcion}</p>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
