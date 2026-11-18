import { puede } from "@sigma/modelo";
import Link from "next/link";
import { CancelarVisita, ProgramaVisitas } from "@/components/campo/programa";
import { EstadoVacio } from "@/components/estados";
import { Etiqueta, Panel, Titulo } from "@/components/ui";
import { listarVerificadores, listarVisitas, proponerVisitas } from "@/lib/campo-datos";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

const ESTADO = {
  asignada: { texto: "Asignada", tono: "oro" },
  verificada: { texto: "Verificada", tono: "ok" },
  cancelada: { texto: "Cancelada", tono: "neutro" },
} as const;
const RESPUESTA: Record<string, string> = {
  si: "Sí",
  no: "No",
  no_verificable: "No se pudo verificar",
};

export default async function Verificacion({ params }: { params: Promise<{ encargo: string }> }) {
  const { encargo: id } = await params;
  const encargo = await obtenerEncargo(id);
  const { activa } = await requerirOrganizacion();
  const supabase = await clienteServidor();
  const programa = puede(activa.rol, "campo.programar");
  const [verificadores, { red, propuestas }] = await Promise.all([
    programa ? listarVerificadores(supabase, activa.organizacionId) : Promise.resolve([]),
    programa
      ? proponerVisitas(supabase, encargo.id)
      : Promise.resolve({ red: null, propuestas: [] }),
  ]);
  const visitas = await listarVisitas(supabase, encargo.id, verificadores);

  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Titulo>Verificación en campo</Titulo>
      <p className="-mt-3 mb-6 max-w-3xl text-sm text-tenue">
        Confirma que el proveedor existe en su domicilio. El auditor o un verificador contesta la
        cédula desde su celular, aun sin señal, con fotos fechadas y ubicadas. Cada «no» genera una
        alerta R12; el hallazgo lo decide el auditor. App de campo:{" "}
        <Link href="/campo" className="text-oro underline">
          /campo
        </Link>
        .
      </p>
      <div className="flex max-w-4xl flex-col gap-6">
        {programa ? (
          <Panel>
            <h2 className="mb-1 text-base font-semibold text-texto">Programa de trabajo</h2>
            {!red ? (
              <p className="text-sm text-tenue">
                Genera la red primero: la propuesta sale de los proveedores críticos y altos.{" "}
                <Link href={`/encargos/${encargo.id}/red`} className="text-oro underline">
                  Ir a la red
                </Link>
              </p>
            ) : propuestas.length === 0 ? (
              <p className="text-sm text-tenue">
                La red del {formatoFecha(red.generada_en)} no tiene proveedores críticos o altos sin
                visita abierta.
              </p>
            ) : (
              <>
                <p className="mb-4 text-sm text-tenue">
                  Proveedores crítico o alto en la red del {formatoFecha(red.generada_en)}. La
                  cédula sale prellenada con su domicilio y sus documentos validados.
                </p>
                <ProgramaVisitas
                  encargoId={encargo.id}
                  propuestas={propuestas}
                  verificadores={verificadores}
                />
              </>
            )}
          </Panel>
        ) : null}

        <section aria-labelledby="titulo-visitas">
          <h2 id="titulo-visitas" className="mb-3 text-base font-semibold text-texto">
            Visitas
          </h2>
          {visitas.length === 0 ? (
            <EstadoVacio
              titulo="Aún no hay visitas."
              descripcion="Asígnalas desde el programa de trabajo."
            />
          ) : (
            <ul aria-label="Visitas del encargo" className="flex flex-col gap-3">
              {visitas.map((v) => (
                <li key={v.id} className="rounded-md border border-linea bg-panel px-4 py-3">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-texto">
                    <Link
                      href={`/encargos/${encargo.id}/entidades/${v.entidad_id}`}
                      className="font-medium hover:text-oro"
                    >
                      {v.entidad}
                    </Link>
                    <Etiqueta tono={ESTADO[v.estado as keyof typeof ESTADO]?.tono ?? "neutro"}>
                      {ESTADO[v.estado as keyof typeof ESTADO]?.texto ?? v.estado}
                    </Etiqueta>
                  </p>
                  <p className="mt-1 text-xs text-tenue">
                    {v.verificador} · asignada {formatoFecha(v.creado_en)}
                    {v.domicilios[0] ? ` · ${v.domicilios[0]}` : ""}
                  </p>
                  {v.motivo ? <p className="mt-1 text-xs text-tenue">Motivo: {v.motivo}</p> : null}
                  {v.cedula ? (
                    <div className="mt-3 border-t border-linea pt-3 text-sm">
                      <p className="mb-2 text-xs text-tenue">
                        Capturada {formatoFecha(v.cedula.capturada_en)} · recibida{" "}
                        {formatoFecha(v.cedula.recibida_en)}
                        {v.cedula.ubicacion
                          ? ` · ubicación ${v.cedula.ubicacion.latitud.toFixed(5)}, ${v.cedula.ubicacion.longitud.toFixed(5)}`
                          : " · sin ubicación"}{" "}
                        ·{" "}
                        <Link
                          href={`/encargos/${encargo.id}/registros/${v.cedula.registro_id}`}
                          className="text-oro underline"
                        >
                          registro
                        </Link>
                      </p>
                      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                        {v.cedula.respuestas.map((r) => (
                          <div key={r.clave} className="contents">
                            <dt className="text-texto">{r.pregunta}</dt>
                            <dd className={r.respuesta === "no" ? "text-peligro" : "text-tenue"}>
                              {RESPUESTA[r.respuesta] ?? r.respuesta}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      {v.cedula.domicilio_observado ? (
                        <p className="mt-2 text-xs text-tenue">
                          Domicilio observado: {v.cedula.domicilio_observado}
                        </p>
                      ) : null}
                      {v.cedula.observaciones ? (
                        <p className="mt-1 text-xs whitespace-pre-wrap text-tenue">
                          {v.cedula.observaciones}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {v.fotos.length > 0 ? (
                    <ul
                      aria-label={`Fotos de ${v.entidad}`}
                      className="mt-3 grid grid-cols-4 gap-2"
                    >
                      {v.fotos.map((f, i) => (
                        <li key={f.id} className="text-[10px] text-tenue">
                          {f.url ? (
                            <a href={f.url} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal */}
                              <img
                                src={f.url}
                                alt={`Foto ${i + 1} de ${v.entidad}`}
                                className="aspect-square w-full rounded object-cover"
                              />
                            </a>
                          ) : null}
                          <span className="block font-mono" title={f.sha256}>
                            SHA-256 {f.sha256.slice(0, 12)}…
                          </span>
                          {f.ubicacion ? "Con ubicación" : "Sin ubicación"}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {programa && v.estado === "asignada" ? <CancelarVisita visitaId={v.id} /> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
