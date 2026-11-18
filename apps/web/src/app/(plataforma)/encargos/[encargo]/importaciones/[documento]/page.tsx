import { formatoBytes, formatoNumero } from "@sigma/modelo";
import { notFound } from "next/navigation";
import { z } from "zod";
import { EnlaceBoton, Panel, Titulo } from "@/components/ui";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { clienteServidor } from "@/lib/supabase/servidor";

const hojasSchema = z
  .array(
    z.object({
      hoja: z.string(),
      estado: z.string(),
      filas_validas: z.number(),
      excluidas: z.number(),
      cifras: z.number(),
    }),
  )
  .catch([]);

export default async function Importacion({
  params,
}: {
  params: Promise<{ encargo: string; documento: string }>;
}) {
  const { encargo: encargoId, documento } = await params;
  if (!z.uuid().safeParse(documento).success) notFound();
  const encargo = await obtenerEncargo(encargoId);
  const supabase = await clienteServidor();
  const [{ data: resumen, error: errorResumen }, { data: carga }] = await Promise.all([
    supabase
      .from("importacion_resumen")
      .select("*")
      .eq("documento_id", documento)
      .eq("encargo_id", encargo.id)
      .maybeSingle(),
    supabase
      .from("bitacora")
      .select("detalle, en")
      .eq("objeto_id", documento)
      .eq("accion", "importacion.carga")
      .maybeSingle(),
  ]);
  if (errorResumen) {
    // Un fallo de lectura no es «no existe»: la importación pudo haberse guardado.
    console.error(`[resumenImportacion] error de base: ${errorResumen.code ?? "desconocido"}`);
    return (
      <main className="flex-1 px-8 py-8">
        <Titulo>Importación</Titulo>
        <Panel className="max-w-2xl">
          <p role="alert" className="text-sm text-texto">
            No se pudo cargar el resumen en este momento. Si acabas de importar, el archivo ya quedó
            guardado: no lo subas otra vez.
          </p>
          <div className="mt-4 flex gap-3">
            <EnlaceBoton href={`/encargos/${encargo.id}/importaciones/${documento}`}>
              Reintentar
            </EnlaceBoton>
            <EnlaceBoton href={`/encargos/${encargo.id}/importaciones`} variante="secundario">
              Ver importaciones
            </EnlaceBoton>
          </div>
        </Panel>
      </main>
    );
  }
  if (!resumen) notFound();
  const detalle = z
    .object({ plantilla: z.string().optional(), hojas: z.unknown() })
    .catch({ hojas: [] })
    .parse(carga?.detalle);
  const hojas = hojasSchema.parse(detalle.hojas);

  const cifras: [string, number | null][] = [
    ["Contratos", resumen.contratos],
    ["Movimientos", resumen.transferencias],
    ["Llamadas", resumen.llamadas],
    ["Vínculos", resumen.vinculos],
    ["Entidades", resumen.entidades],
    ["Cifras declaradas", resumen.cifras],
    ["Registros", resumen.registros],
  ];

  return (
    <main className="flex-1 px-8 py-8">
      <Titulo
        accion={
          <EnlaceBoton variante="secundario" href={`/encargos/${encargo.id}/importaciones`}>
            Todas las importaciones
          </EnlaceBoton>
        }
      >
        {resumen.nombre_archivo}
      </Titulo>
      <dl
        className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7"
        aria-label="Resultado de la importación"
      >
        {cifras.map(([t, n]) => (
          <div
            key={t}
            className="rounded-lg border border-linea bg-panel px-4 py-3"
            data-testid={`conteo-${t}`}
          >
            <dt className="text-xs text-tenue">{t}</dt>
            <dd className="text-2xl font-semibold text-texto">{formatoNumero(n ?? 0)}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <dl className="grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
            <dt className="text-tenue">Plantilla</dt>
            <dd className="text-texto">{detalle.plantilla ?? "—"}</dd>
            <dt className="text-tenue">Importado</dt>
            <dd className="text-texto">{formatoFecha(resumen.recibido_en)}</dd>
            <dt className="text-tenue">Tamaño</dt>
            <dd className="text-texto">{formatoBytes(resumen.tamano ?? 0)}</dd>
            <dt className="text-tenue">SHA-256</dt>
            <dd className="font-mono text-xs break-all text-texto">{resumen.sha256}</dd>
          </dl>
        </Panel>
        <Panel>
          <h2 className="mb-3 text-sm font-semibold text-texto">Hojas</h2>
          <ul className="divide-y divide-linea text-sm">
            {hojas.map((h) => (
              <li key={h.hoja} className="flex justify-between py-1.5">
                <span className="text-texto">{h.hoja}</span>
                <span className="text-xs text-tenue">
                  {h.estado === "no_mapeada"
                    ? "no procesada"
                    : `${formatoNumero(h.filas_validas)} filas · ${formatoNumero(h.excluidas)} excluidas · ${formatoNumero(h.cifras)} cifras`}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </main>
  );
}
