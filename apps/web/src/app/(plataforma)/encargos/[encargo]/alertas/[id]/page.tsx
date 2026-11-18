import { puede } from "@sigma/modelo";
import { NOMBRE_REGLA } from "@sigma/reglas";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { FormularioResolver } from "@/components/alertas/formularios";
import {
  CLASE_SEVERIDAD,
  NOMBRE_ESTADO,
  NOMBRE_SEVERIDAD,
} from "@/components/alertas/presentacion";
import { Panel, Titulo } from "@/components/ui";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { detalleAlertaSchema } from "@/lib/reglas-datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

export default async function Alerta({
  params,
}: {
  params: Promise<{ encargo: string; id: string }>;
}) {
  const { encargo: encargoId, id } = await params;
  const encargo = await obtenerEncargo(encargoId);
  if (!z.uuid().safeParse(id).success) notFound();
  const { activa } = await requerirOrganizacion();
  const supabase = await clienteServidor();
  const { data: a } = await supabase
    .from("alerta")
    .select(
      "id, regla, severidad, estado, vigente, detalle, creado_en, resolucion_motivo, resuelta_en",
    )
    .eq("encargo_id", encargo.id)
    .eq("id", id)
    .maybeSingle();
  if (!a) notFound();
  const d = detalleAlertaSchema.parse(a.detalle);
  const ids = d.entidades.filter((x) => z.uuid().safeParse(x).success);
  const [{ data: entidades }, { data: registros }] = await Promise.all([
    ids.length
      ? supabase.from("entidad").select("id, nombre").eq("encargo_id", encargo.id).in("id", ids)
      : Promise.resolve({ data: [] }),
    supabase
      .from("registro")
      .select("id, resumen, fuente, documento_origen(nombre_archivo)")
      .eq("encargo_id", encargo.id)
      .in(
        "id",
        [...new Set(d.evidencias.map((e) => e.registro_id))].filter(
          (x) => z.uuid().safeParse(x).success,
        ),
      ),
  ]);
  const registro = new Map((registros ?? []).map((r) => [r.id, r]));
  const base = `/encargos/${encargo.id}`;
  const dosColumnas = d.evidencias.length === 2;

  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Titulo>{d.titulo}</Titulo>
      <div className="-mt-3 mb-6 flex flex-wrap items-center gap-2 text-sm text-tenue">
        <span
          className={`rounded border px-1.5 py-0.5 text-xs ${CLASE_SEVERIDAD[a.severidad] ?? ""}`}
        >
          {NOMBRE_SEVERIDAD[a.severidad] ?? a.severidad}
        </span>
        <span>
          {a.regla} · {NOMBRE_REGLA[a.regla] ?? "Regla"}
        </span>
        <span>· {NOMBRE_ESTADO[a.estado] ?? a.estado}</span>
        <span>· detectada el {formatoFecha(a.creado_en)}</span>
        {!a.vigente ? <span>· ya no se reproduce con los datos actuales</span> : null}
      </div>

      <div className="flex max-w-5xl flex-col gap-6">
        <p className="text-sm text-texto">{d.descripcion}</p>

        <section
          aria-label="Evidencias"
          className={`grid gap-4 ${dosColumnas ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"}`}
        >
          {d.evidencias.map((e, i) => {
            const r = registro.get(e.registro_id);
            return (
              <article
                key={i}
                className="flex flex-col gap-2 rounded-lg border border-linea bg-panel p-4"
              >
                <h2 className="text-xs tracking-wide text-oro uppercase">{e.etiqueta}</h2>
                <p className="text-xl font-semibold break-words text-texto">{e.valor}</p>
                <p className="font-mono text-xs text-tenue">{e.ubicacion ?? "Sin ubicación"}</p>
                {r ? (
                  <p className="text-xs text-tenue">
                    {r.documento_origen?.nombre_archivo ?? r.fuente ?? "Registro"}
                  </p>
                ) : null}
                <Link
                  href={`${base}/registros/${e.registro_id}${e.extraccion_id ? `#x-${e.extraccion_id}` : ""}`}
                  className="mt-auto text-sm text-azul-claro hover:underline"
                >
                  Ver en el origen{r?.resumen ? `: ${r.resumen}` : ""}
                </Link>
              </article>
            );
          })}
        </section>

        {(entidades ?? []).length ? (
          <Panel>
            <h2 className="mb-2 text-base font-semibold text-texto">Entidades señaladas</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {(entidades ?? []).map((e) => (
                <li key={e.id}>
                  <Link
                    href={`${base}/entidades/${e.id}`}
                    className="text-azul-claro hover:underline"
                  >
                    {e.nombre}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <Panel>
          <h2 className="mb-3 text-base font-semibold text-texto">Resolución</h2>
          {a.estado !== "abierta" ? (
            <p className="text-sm text-texto" data-testid="resolucion">
              {NOMBRE_ESTADO[a.estado]} el {formatoFecha(a.resuelta_en)}. Motivo:{" "}
              {a.resolucion_motivo}
            </p>
          ) : puede(activa.rol, "alerta.resolver") ? (
            <FormularioResolver encargoId={encargo.id} alertaId={a.id} />
          ) : (
            <p className="text-sm text-tenue">Abierta. Tu rol no permite resolver alertas.</p>
          )}
        </Panel>

        <Link href={`${base}/alertas`} className="text-sm text-azul-claro hover:underline">
          Todas las alertas
        </Link>
      </div>
    </main>
  );
}
