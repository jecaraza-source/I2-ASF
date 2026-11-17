import { puede } from "@sigma/modelo";
import Link from "next/link";
import { EstadoVacio } from "@/components/estados";
import { Etiqueta, Panel, Titulo } from "@/components/ui";
import { listarSintesis, NOMBRE_ESTADO_SINTESIS } from "@/lib/analizador-datos";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

export default async function Analizador({ params }: { params: Promise<{ encargo: string }> }) {
  const { encargo: id } = await params;
  const encargo = await obtenerEncargo(id);
  const { activa } = await requerirOrganizacion();
  const supabase = await clienteServidor();
  const [sintesis, { data: expedientes }] = await Promise.all([
    listarSintesis(supabase, encargo.id),
    supabase
      .from("expediente")
      .select("id, identificador")
      .eq("encargo_id", encargo.id)
      .order("identificador"),
  ]);
  const base = `/encargos/${encargo.id}/analizador`;
  const puedeGenerar = puede(activa.rol, "sintesis.generar");

  return (
    <main className="flex-1 px-8 py-8">
      <Titulo>Analizador</Titulo>
      <p className="-mt-3 mb-6 max-w-3xl text-sm text-tenue">
        Síntesis de un expediente o de una entidad a partir de registros validados. La IA propone;
        cada afirmación cita los registros que la sostienen y el auditor la revisa y aprueba. Una
        síntesis nunca crea hallazgos: se adjunta a uno que redacta y firma un auditor.
      </p>
      <div className="flex max-w-5xl flex-col gap-6">
        {puedeGenerar ? (
          <Panel>
            <h2 className="mb-3 text-base font-semibold text-texto">Nueva síntesis</h2>
            {expedientes?.length ? (
              <form
                action={`${base}/nueva`}
                method="get"
                className="flex flex-wrap items-end gap-3"
              >
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="expediente-analizar" className="text-sm text-texto">
                    Expediente a analizar
                  </label>
                  <select
                    id="expediente-analizar"
                    name="expediente"
                    className="rounded-md border border-linea-2 bg-fondo-2 px-3 py-2 text-sm text-texto"
                  >
                    {expedientes.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.identificador}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="rounded-md border border-linea-2 px-3.5 py-2 text-sm text-texto hover:border-oro"
                >
                  Elegir registros
                </button>
              </form>
            ) : (
              <p className="text-sm text-tenue">El encargo aún no tiene expedientes.</p>
            )}
            <p className="mt-3 text-xs text-tenue">
              Para analizar una entidad, ábrela (desde la red o un registro) y usa «Analizar esta
              entidad».
            </p>
          </Panel>
        ) : null}

        {sintesis.length === 0 ? (
          <EstadoVacio
            titulo="Aún no hay síntesis."
            descripcion="Elige un expediente o una entidad con registros validados para generar la primera."
          />
        ) : (
          <table className="w-full text-sm" aria-label="Síntesis del encargo">
            <thead>
              <tr className="border-b border-linea text-left text-xs text-tenue">
                <th className="py-2 pr-3 font-normal">Alcance</th>
                <th className="py-2 pr-3 font-normal">Estado</th>
                <th className="py-2 pr-3 font-normal">Registros</th>
                <th className="py-2 font-normal">Creada</th>
              </tr>
            </thead>
            <tbody>
              {sintesis.map((s) => (
                <tr key={s.id} className="border-b border-linea">
                  <td className="py-2 pr-3">
                    <Link href={`${base}/${s.id}`} className="text-texto hover:text-oro">
                      {s.alcance_tipo === "expediente" ? "Expediente" : "Entidad"} {s.nombre}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">
                    <Etiqueta
                      tono={
                        s.estado === "aprobada" ? "ok" : s.estado === "borrador" ? "oro" : "neutro"
                      }
                    >
                      {NOMBRE_ESTADO_SINTESIS[s.estado] ?? s.estado}
                    </Etiqueta>
                  </td>
                  <td className="py-2 pr-3 text-tenue">{s.registros.length}</td>
                  <td className="py-2 text-tenue">{formatoFecha(s.creado_en)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
