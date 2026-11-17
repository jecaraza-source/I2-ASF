import { puede } from "@sigma/modelo";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BotonReintentar,
  Cita,
  EditorSintesis,
  EsperandoSintesis,
  type RegistroCita,
} from "@/components/analizador/editor";
import { AdjuntarAHallazgo, NuevoHallazgo } from "@/components/hallazgos/formularios";
import { Etiqueta, EnlaceBoton, Panel, Titulo } from "@/components/ui";
import {
  cargarSintesis,
  MOTIVO_SINTESIS,
  NOMBRE_ESTADO_SINTESIS,
  type AfirmacionVista,
} from "@/lib/analizador-datos";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

/** La generación corre después de responder. */
export const maxDuration = 300;

const fechaHora = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function Afirmaciones({
  lista,
  encargoId,
  registros,
  etiqueta,
}: {
  lista: AfirmacionVista[];
  encargoId: string;
  registros: Map<string, RegistroCita>;
  etiqueta: string;
}) {
  return (
    <ol aria-label={etiqueta} className="flex flex-col gap-3">
      {lista.map((a) => (
        <li key={a.orden} className="flex flex-col gap-1.5 text-sm text-texto">
          <p>
            <span className="mr-2 text-tenue">{a.orden}.</span>
            {a.texto}
          </p>
          <p className="flex flex-wrap gap-1.5 pl-5">
            {a.registros.map((rid) => {
              const r = registros.get(rid);
              return r ? <Cita key={rid} encargoId={encargoId} registro={r} /> : null;
            })}
          </p>
        </li>
      ))}
    </ol>
  );
}

export default async function SintesisPagina({
  params,
}: {
  params: Promise<{ encargo: string; id: string }>;
}) {
  const { encargo: encargoId, id } = await params;
  const encargo = await obtenerEncargo(encargoId);
  const { activa } = await requerirOrganizacion();
  const supabase = await clienteServidor();
  const s = await cargarSintesis(supabase, encargo.id, id);
  if (!s) notFound();
  const puedeEditar = puede(activa.rol, "sintesis.generar");
  const puedeHallazgo = puede(activa.rol, "hallazgo.editar");

  // Numeración estable: el orden del alcance original (fecha) y luego lo citado fuera de él.
  const orden = [...s.registrosInfo].sort(
    (a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999") || a.id.localeCompare(b.id),
  );
  const registros = new Map<string, RegistroCita>(
    orden.map((r, i) => [
      r.id,
      {
        id: r.id,
        numero: i + 1,
        etiqueta: [formatoFecha(r.fecha), r.tipo ?? "Sin tipo", r.resumen ?? ""]
          .filter(Boolean)
          .join(" · "),
      },
    ]),
  );
  const { data: hallazgosAbiertos } =
    s.estado === "aprobada" && puedeHallazgo
      ? await supabase
          .from("hallazgo")
          .select("id, redaccion")
          .eq("encargo_id", encargo.id)
          .is("firmado_en", null)
          .order("creado_en", { ascending: false })
          .limit(100)
      : { data: [] };
  const titulo = `Síntesis · ${s.alcance_tipo === "expediente" ? "expediente" : "entidad"} ${s.nombre}`;

  return (
    <main className="flex-1 px-8 py-8">
      <Titulo
        accion={
          <EnlaceBoton href={`/encargos/${encargo.id}/analizador`} variante="secundario">
            Volver al Analizador
          </EnlaceBoton>
        }
      >
        {titulo}
      </Titulo>
      <div
        className="-mt-3 mb-6 flex flex-wrap items-center gap-2 text-xs text-tenue"
        data-testid="estado-sintesis"
      >
        <Etiqueta
          tono={s.estado === "aprobada" ? "ok" : s.estado === "borrador" ? "oro" : "neutro"}
        >
          {NOMBRE_ESTADO_SINTESIS[s.estado] ?? s.estado}
        </Etiqueta>
        <span>
          {s.registros.length} registro(s) validado(s) en el alcance
          {s.proveedor ? ` · redactada por IA (${s.proveedor}, ${s.modelo})` : ""}
          {s.generada_en ? ` el ${fechaHora.format(new Date(s.generada_en))}` : ""}
          {s.aprobada_en ? ` · aprobada el ${fechaHora.format(new Date(s.aprobada_en))}` : ""}
        </span>
      </div>

      <div className="flex max-w-4xl flex-col gap-6">
        {s.estado === "generando" ? (
          <Panel>
            <EsperandoSintesis />
          </Panel>
        ) : null}
        {s.estado === "en_espera" || s.estado === "error" ? (
          <Panel className="flex flex-col gap-3">
            <p role="alert" className="text-sm text-texto">
              {s.estado === "en_espera" ? "La síntesis espera: " : "No se pudo generar: "}
              {MOTIVO_SINTESIS[s.motivo ?? ""] ?? "motivo desconocido."}
            </p>
            {puedeEditar ? <BotonReintentar encargoId={encargo.id} sintesisId={s.id} /> : null}
          </Panel>
        ) : null}
        {s.estado === "borrador" && s.motivo === "sin_afirmaciones" ? (
          <p role="status" className="text-sm text-oro">
            {MOTIVO_SINTESIS.sin_afirmaciones} Escribe las afirmaciones o descarta la síntesis.
          </p>
        ) : null}

        {s.estado === "borrador" ? (
          puedeEditar ? (
            <Panel>
              <EditorSintesis
                encargoId={encargo.id}
                sintesisId={s.id}
                inicial={s.borrador.map((a) => ({ texto: a.texto, registros: a.registros }))}
                registros={[...registros.values()]}
                alcanceInicial={orden.map((r) => r.id).filter((rid) => s.registros.includes(rid))}
              />
            </Panel>
          ) : (
            <Panel>
              <h2 className="mb-3 text-base font-semibold text-texto">Borrador (sin aprobar)</h2>
              <Afirmaciones
                lista={s.borrador}
                encargoId={encargo.id}
                registros={registros}
                etiqueta="Borrador"
              />
            </Panel>
          )
        ) : null}

        {s.estado === "aprobada" ? (
          <Panel>
            <h2 className="mb-3 text-base font-semibold text-texto">Síntesis aprobada</h2>
            <Afirmaciones
              lista={s.aprobada}
              encargoId={encargo.id}
              registros={registros}
              etiqueta="Síntesis aprobada"
            />
          </Panel>
        ) : null}

        {s.estado === "descartada" ? (
          <p role="status" className="text-sm text-tenue">
            Descartada. Motivo: {s.motivo}
          </p>
        ) : null}

        {s.ia.length ? (
          <details className="rounded-lg border border-linea bg-panel p-5">
            <summary className="cursor-pointer text-sm text-texto">
              Versión de la IA ({s.ia.length} afirmación(es), sin cambios del auditor)
            </summary>
            <div className="mt-3">
              <Afirmaciones
                lista={s.ia}
                encargoId={encargo.id}
                registros={registros}
                etiqueta="Versión de la IA"
              />
            </div>
          </details>
        ) : null}

        {s.estado === "aprobada" ? (
          <Panel className="flex flex-col gap-4">
            <h2 className="text-base font-semibold text-texto">Hallazgos</h2>
            {s.hallazgos.length ? (
              <ul className="flex flex-col gap-1 text-sm" aria-label="Hallazgos con esta síntesis">
                {s.hallazgos.map((h) => (
                  <li key={h.id}>
                    <Link
                      href={`/encargos/${encargo.id}/hallazgos/${h.id}`}
                      className="text-texto hover:text-oro"
                    >
                      {h.redaccion.slice(0, 120)}
                      {h.redaccion.length > 120 ? "…" : ""}
                    </Link>{" "}
                    <span className="text-xs text-tenue">
                      {h.firmado_en ? "· firmado" : "· sin firmar"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-tenue">Esta síntesis aún no respalda ningún hallazgo.</p>
            )}
            {puedeHallazgo ? (
              <>
                {hallazgosAbiertos?.length ? (
                  <AdjuntarAHallazgo
                    encargoId={encargo.id}
                    sintesisId={s.id}
                    hallazgos={hallazgosAbiertos.map((h) => ({
                      id: h.id,
                      texto: h.redaccion.slice(0, 90),
                    }))}
                  />
                ) : null}
                <NuevoHallazgo encargoId={encargo.id} sintesisId={s.id} />
              </>
            ) : null}
          </Panel>
        ) : null}
      </div>
    </main>
  );
}
