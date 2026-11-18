import { puede, formatoNumero } from "@sigma/modelo";
import { DESCRIPCION_CRITERIO, diferencias, type Nivel } from "@sigma/red";
import Link from "next/link";
import { z } from "zod";
import { resolverFusionAccion } from "@/acciones/red";
import { EstadoVacio } from "@/components/estados";
import { FormularioAjuste, FormularioGenerar } from "@/components/red/formularios";
import { MenuExportar } from "@/components/exportar/menu";
import { BotonConsultarFuentes } from "@/components/fuentes/consultar";
import { EnlaceBoton, Panel, Titulo } from "@/components/ui";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { cargarGeneracion, type CalificacionGuardada } from "@/lib/red-datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

const NIVEL: Record<Nivel, { texto: string; clase: string }> = {
  critico: { texto: "Crítico", clase: "border-peligro text-peligro" },
  alto: { texto: "Alto", clase: "border-oro text-oro" },
  medio: { texto: "Medio", clase: "border-azul-medio text-azul-claro" },
  bajo: { texto: "Bajo", clase: "border-linea-2 text-tenue" },
};

function Nivel({ c }: { c: CalificacionGuardada }) {
  const efectivo = c.ajuste_nivel ?? c.nivel;
  return (
    <span className="flex flex-col gap-0.5">
      <span
        className={`inline-block w-fit rounded border px-1.5 py-0.5 text-xs ${NIVEL[efectivo].clase}`}
      >
        {NIVEL[efectivo].texto} · {formatoNumero(c.puntaje)}
      </span>
      {c.ajuste_nivel ? (
        <span className="text-[11px] text-tenue">
          Ajustado desde {NIVEL[c.nivel].texto}: {c.ajuste_motivo}
        </span>
      ) : null}
    </span>
  );
}

function Criterios({ c }: { c: CalificacionGuardada }) {
  if (!c.criterios.length)
    return <span className="text-xs text-tenue-2">Sin criterios activados</span>;
  return (
    <ul className="text-xs text-tenue">
      {c.criterios.map((x, i) => (
        <li key={i}>
          <span className="text-texto">+{x.aporte}</span>{" "}
          {DESCRIPCION_CRITERIO[x.criterio] ?? x.criterio}: {x.detalle}
        </li>
      ))}
    </ul>
  );
}

const resumenSchema = z
  .object({
    indicadores: z
      .object({
        nodos: z.number(),
        vinculos: z.number(),
        eventos: z.number(),
        fantasma_offshore: z.number(),
        por_nivel: z.record(z.string(), z.number()),
      })
      .partial()
      .catch({}),
    todas: z.boolean().optional(),
  })
  .catch({ indicadores: {} });

/** La consulta de fuentes corre después de responder. */
export const maxDuration = 300;

export default async function Red({
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
  const supabase = await clienteServidor();

  const [{ data: generaciones }, { data: entidades }, { data: fusiones }] = await Promise.all([
    supabase
      .from("red_generada")
      .select("id, generada_en, alcance, version_reglas, semillas, resumen")
      .eq("encargo_id", encargo.id)
      .order("generada_en", { ascending: false })
      .limit(50),
    supabase
      .from("entidad")
      .select("id, nombre, tipo, fusionada_en")
      .eq("encargo_id", encargo.id)
      .order("nombre")
      .limit(5000),
    supabase
      .from("fusion_propuesta")
      .select("id, entidad_a, entidad_b, motivo")
      .eq("encargo_id", encargo.id)
      .eq("estado", "propuesta")
      .order("creado_en")
      .limit(200),
  ]);

  const nombre = new Map((entidades ?? []).map((e) => [e.id, e.nombre]));
  const lista = generaciones ?? [];
  const pedida = typeof sp.gen === "string" ? sp.gen : undefined;
  const indice = Math.max(0, pedida ? lista.findIndex((g) => g.id === pedida) : 0);
  const actual = lista[indice];
  const anterior = lista[indice + 1];

  const gen = actual ? await cargarGeneracion(supabase, actual.id) : null;
  const previa = anterior ? await cargarGeneracion(supabase, anterior.id) : null;
  const vinculosIds = gen?.vinculos ?? [];
  const { data: vinculos } = vinculosIds.length
    ? await supabase
        .from("vinculo")
        .select("id, origen_id, destino_id, tipo, fuerza")
        .in("id", vinculosIds.slice(0, 1000))
    : { data: [] };
  const vinculoPorId = new Map((vinculos ?? []).map((v) => [v.id, v]));
  const describirVinculo = (vid: string) => {
    const v = vinculoPorId.get(vid);
    return v
      ? `${nombre.get(v.origen_id) ?? "?"} → ${nombre.get(v.destino_id) ?? "?"} (${v.tipo})`
      : vid;
  };

  const dif =
    gen && previa
      ? diferencias(
          {
            nodos: previa.nodos.map((n) => n.entidad_id),
            vinculos: previa.vinculos,
            calificaciones: previa.calificaciones,
          },
          {
            nodos: gen.nodos.map((n) => n.entidad_id),
            vinculos: gen.vinculos,
            calificaciones: gen.calificaciones,
          },
        )
      : null;
  const resumen = actual ? resumenSchema.parse(actual.resumen) : null;
  const distancia = new Map((gen?.nodos ?? []).map((n) => [n.entidad_id, n.distancia]));
  const entidadesCalificadas = (gen?.calificaciones ?? [])
    .filter((c) => c.objeto_tipo === "entidad")
    .sort(
      (a, b) =>
        b.puntaje - a.puntaje ||
        (nombre.get(a.objeto_id) ?? "").localeCompare(nombre.get(b.objeto_id) ?? ""),
    );
  const vinculosCalificados = (gen?.calificaciones ?? [])
    .filter((c) => c.objeto_tipo === "vinculo")
    .sort((a, b) => b.puntaje - a.puntaje);
  const puedeGenerar = puede(activa.rol, "red.generar");
  const puedeAjustar = puede(activa.rol, "red.ajustar");
  const puedeFusionar = puede(activa.rol, "fusion.resolver");
  const base = `/encargos/${encargo.id}/red`;

  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Titulo
        accion={
          <div className="flex flex-wrap items-start gap-3">
            {puede(activa.rol, "fuente.consultar") ? (
              <BotonConsultarFuentes
                encargoId={encargo.id}
                texto="Consultar fuentes de todas las entidades"
              />
            ) : null}
            {lista.length && puede(activa.rol, "red.exportar") ? (
              <MenuExportar
                encargoId={encargo.id}
                nota={`Generación más reciente, del ${formatoFecha(lista[0]!.generada_en)}.`}
              />
            ) : null}
            {actual ? <EnlaceBoton href={`${base}/vista`}>Explorar la red</EnlaceBoton> : null}
          </div>
        }
      >
        Red de vínculos
      </Titulo>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {puedeGenerar ? (
            <Panel>
              <h2 className="mb-4 text-base font-semibold text-texto">
                {actual ? "Regenerar" : "Generar"} la red
              </h2>
              <FormularioGenerar
                encargoId={encargo.id}
                entidades={(entidades ?? [])
                  .filter((e) => !e.fusionada_en)
                  .map((e) => ({ id: e.id, nombre: e.nombre, tipo: e.tipo }))}
              />
            </Panel>
          ) : null}

          {!actual || !gen ? (
            <EstadoVacio
              titulo="Aún no hay redes generadas."
              descripcion="Elige las entidades de partida y hasta dónde llega la red para reunir las entidades, sus vínculos declarados y eventos, y calificarlas."
            />
          ) : (
            <>
              <section aria-label="Generación" className="flex flex-col gap-4">
                <p className="text-sm text-tenue">
                  Generación del {formatoFecha(actual.generada_en)} ·{" "}
                  {resumen?.todas
                    ? "todas las entidades"
                    : `${formatoNumero(actual.semillas.length)} entidad(es) de partida, ${actual.alcance === 1 ? "relaciones directas" : "hasta segundo grado"}`}{" "}
                  · reglas versión {actual.version_reglas}
                </p>
                <dl
                  aria-label="Indicadores"
                  className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
                >
                  {(
                    [
                      ["Entidades", resumen?.indicadores.nodos ?? gen.nodos.length],
                      ["Vínculos declarados", resumen?.indicadores.vinculos ?? gen.vinculos.length],
                      ["Eventos", resumen?.indicadores.eventos ?? 0],
                      ["Fantasma u offshore", resumen?.indicadores.fantasma_offshore ?? 0],
                      ["Riesgo crítico", resumen?.indicadores.por_nivel?.critico ?? 0],
                      ["Riesgo alto", resumen?.indicadores.por_nivel?.alto ?? 0],
                    ] as const
                  ).map(([t, n]) => (
                    <div
                      key={t}
                      className="rounded-lg border border-linea bg-panel px-4 py-3"
                      data-testid={`indicador-${t}`}
                    >
                      <dt className="text-xs text-tenue">{t}</dt>
                      <dd className="text-2xl font-semibold text-texto">{formatoNumero(n)}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              {dif ? (
                <Panel>
                  <h2 className="mb-3 text-base font-semibold text-texto" id="diferencias">
                    Cambios contra la generación anterior
                  </h2>
                  {dif.nodos_agregados.length +
                    dif.nodos_quitados.length +
                    dif.vinculos_agregados.length +
                    dif.vinculos_quitados.length +
                    dif.subieron.length +
                    dif.bajaron.length ===
                  0 ? (
                    <p className="text-sm text-tenue">Sin cambios.</p>
                  ) : (
                    <div
                      className="grid gap-4 text-sm md:grid-cols-2"
                      aria-labelledby="diferencias"
                    >
                      {(
                        [
                          ["Nodos agregados", dif.nodos_agregados.map((n) => nombre.get(n) ?? n)],
                          ["Nodos quitados", dif.nodos_quitados.map((n) => nombre.get(n) ?? n)],
                          ["Vínculos agregados", dif.vinculos_agregados.map(describirVinculo)],
                          ["Vínculos quitados", dif.vinculos_quitados.map(describirVinculo)],
                          [
                            "Calificaciones que subieron",
                            dif.subieron.map(
                              (c) =>
                                `${c.objeto_tipo === "entidad" ? nombre.get(c.objeto_id) : describirVinculo(c.objeto_id)}: ${c.antes.puntaje} → ${c.despues.puntaje}`,
                            ),
                          ],
                          [
                            "Calificaciones que bajaron",
                            dif.bajaron.map(
                              (c) =>
                                `${c.objeto_tipo === "entidad" ? nombre.get(c.objeto_id) : describirVinculo(c.objeto_id)}: ${c.antes.puntaje} → ${c.despues.puntaje}`,
                            ),
                          ],
                        ] as const
                      )
                        .filter(([, items]) => items.length)
                        .map(([titulo, items]) => (
                          <div key={titulo} data-testid={`cambio-${titulo}`}>
                            <h3 className="mb-1 text-xs tracking-wide text-oro uppercase">
                              {titulo} ({formatoNumero(items.length)})
                            </h3>
                            <ul className="max-h-48 overflow-y-auto text-xs text-tenue">
                              {items.map((t, i) => (
                                <li key={i}>{t}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                    </div>
                  )}
                </Panel>
              ) : null}

              <section
                aria-label="Entidades calificadas"
                className="overflow-x-auto rounded-lg border border-linea"
              >
                <table className="tabla-tarjetas w-full text-left text-sm">
                  <caption className="px-4 py-2 text-left text-sm font-semibold text-texto">
                    Entidades
                  </caption>
                  <thead className="bg-panel-2 text-xs tracking-wide text-tenue uppercase">
                    <tr>
                      <th scope="col" className="px-4 py-2">
                        Entidad
                      </th>
                      <th scope="col" className="px-4 py-2">
                        Distancia
                      </th>
                      <th scope="col" className="px-4 py-2">
                        Riesgo
                      </th>
                      <th scope="col" className="px-4 py-2">
                        Criterios
                      </th>
                      {puedeAjustar ? (
                        <th scope="col" className="px-4 py-2">
                          Ajuste
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {entidadesCalificadas.map((c) => (
                      <tr key={c.id} className="border-t border-linea align-top">
                        <td className="px-4 py-2 text-texto">
                          {nombre.get(c.objeto_id) ?? c.objeto_id}
                        </td>
                        <td data-etiqueta="Distancia" className="px-4 py-2 text-tenue">
                          {distancia.get(c.objeto_id) ?? "—"}
                        </td>
                        <td data-etiqueta="Riesgo" className="px-4 py-2">
                          <Nivel c={c} />
                        </td>
                        <td data-etiqueta="Criterios" className="px-4 py-2">
                          <Criterios c={c} />
                        </td>
                        {puedeAjustar ? (
                          <td data-etiqueta="Ajuste" className="px-4 py-2">
                            <FormularioAjuste
                              calificacionId={c.id}
                              nivelActual={c.ajuste_nivel ?? c.nivel}
                            />
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section
                aria-label="Vínculos calificados"
                className="overflow-x-auto rounded-lg border border-linea"
              >
                <table className="tabla-tarjetas w-full text-left text-sm">
                  <caption className="px-4 py-2 text-left text-sm font-semibold text-texto">
                    Vínculos declarados
                  </caption>
                  <thead className="bg-panel-2 text-xs tracking-wide text-tenue uppercase">
                    <tr>
                      <th scope="col" className="px-4 py-2">
                        Vínculo
                      </th>
                      <th scope="col" className="px-4 py-2">
                        Fuerza
                      </th>
                      <th scope="col" className="px-4 py-2">
                        Riesgo
                      </th>
                      <th scope="col" className="px-4 py-2">
                        Criterios
                      </th>
                      {puedeAjustar ? (
                        <th scope="col" className="px-4 py-2">
                          Ajuste
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {vinculosCalificados.map((c) => (
                      <tr key={c.id} className="border-t border-linea align-top">
                        <td className="px-4 py-2 text-texto">{describirVinculo(c.objeto_id)}</td>
                        <td data-etiqueta="Fuerza" className="px-4 py-2 text-tenue">
                          {vinculoPorId.get(c.objeto_id)?.fuerza ?? "—"}
                        </td>
                        <td data-etiqueta="Riesgo" className="px-4 py-2">
                          <Nivel c={c} />
                        </td>
                        <td data-etiqueta="Criterios" className="px-4 py-2">
                          <Criterios c={c} />
                        </td>
                        {puedeAjustar ? (
                          <td data-etiqueta="Ajuste" className="px-4 py-2">
                            <FormularioAjuste
                              calificacionId={c.id}
                              nivelActual={c.ajuste_nivel ?? c.nivel}
                            />
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <Panel>
            <h2 className="mb-3 text-base font-semibold text-texto">Historial</h2>
            {lista.length === 0 ? (
              <p className="text-sm text-tenue">Sin generaciones.</p>
            ) : (
              <ol className="flex flex-col gap-1 text-sm" aria-label="Generaciones">
                {lista.map((g, i) => {
                  const r = resumenSchema.parse(g.resumen);
                  return (
                    <li key={g.id}>
                      <Link
                        href={`${base}?gen=${g.id}`}
                        aria-current={g.id === actual?.id ? "true" : undefined}
                        className={`block rounded px-2 py-1 hover:bg-panel-2 ${g.id === actual?.id ? "text-oro" : "text-texto"}`}
                      >
                        #{lista.length - i} · {formatoFecha(g.generada_en)} ·{" "}
                        {r.indicadores.nodos ?? "?"} nodos · v{g.version_reglas}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>

          <Panel>
            <h2 id="fusiones" className="mb-3 text-base font-semibold text-texto">
              Fusiones propuestas
            </h2>
            {(fusiones ?? []).length === 0 ? (
              <p className="text-sm text-tenue">No hay fusiones pendientes.</p>
            ) : (
              <ul className="flex flex-col gap-3 text-sm" aria-labelledby="fusiones">
                {(fusiones ?? []).map((f) => (
                  <li key={f.id} className="rounded border border-linea p-3">
                    <p className="text-texto">{nombre.get(f.entidad_a)}</p>
                    <p className="text-texto">≈ {nombre.get(f.entidad_b)}</p>
                    <p className="mt-1 text-xs text-tenue">{f.motivo}</p>
                    {puedeFusionar ? (
                      <div className="mt-2 flex gap-2">
                        {(["1", "0"] as const).map((v) => (
                          <form key={v} action={resolverFusionAccion}>
                            <input type="hidden" name="encargo_id" value={encargo.id} />
                            <input type="hidden" name="fusion_id" value={f.id} />
                            <input type="hidden" name="aceptar" value={v} />
                            <button
                              type="submit"
                              className={`rounded border px-2 py-0.5 text-xs ${v === "1" ? "border-oro text-oro" : "border-linea-2 text-tenue"}`}
                            >
                              {v === "1" ? "Fusionar" : "Son distintas"}
                            </button>
                          </form>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </main>
  );
}
