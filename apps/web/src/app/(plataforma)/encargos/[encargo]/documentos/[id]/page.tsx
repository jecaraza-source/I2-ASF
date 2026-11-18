import { tipoPorMime } from "@sigma/modelo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Panel, Titulo } from "@/components/ui";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

/** Segundos de vida del enlace firmado al original (§4: corta duración). */
const VIGENCIA = 60;

export default async function Documento({
  params,
}: {
  params: Promise<{ encargo: string; id: string }>;
}) {
  const { encargo: encargoId, id } = await params;
  const encargo = await obtenerEncargo(encargoId);
  if (!z.uuid().safeParse(id).success) notFound();
  const { activa, usuario } = await requerirOrganizacion();
  const supabase = await clienteServidor();
  const { data: d } = await supabase
    .from("documento_origen")
    .select(
      "id, nombre_archivo, mime, tamano, sha256, storage_path, fuente, recibido_en, expediente(identificador)",
    )
    .eq("encargo_id", encargo.id)
    .eq("id", id)
    .maybeSingle();
  if (!d) notFound();

  const almacen = supabase.storage.from("originales");
  const [{ data: registros }, ver, descargar] = await Promise.all([
    supabase
      .from("registro")
      .select("id, resumen, origen, estado_validacion")
      .eq("encargo_id", encargo.id)
      .eq("documento_id", d.id)
      .order("creado_en")
      .limit(20),
    almacen.createSignedUrl(d.storage_path, VIGENCIA),
    almacen.createSignedUrl(d.storage_path, VIGENCIA, { download: d.nombre_archivo }),
    // Regla 3: consultar un original es una acción sobre evidencia.
    supabase.from("bitacora").insert({
      organizacion_id: activa.organizacionId,
      encargo_id: encargo.id,
      actor: usuario.id,
      accion: "documento.consulta",
      objeto_tipo: "documento_origen",
      objeto_id: d.id,
    }),
  ]);
  const tipo = tipoPorMime(d.mime);
  const url = ver.data?.signedUrl;
  const base = `/encargos/${encargo.id}`;

  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Titulo>{d.nombre_archivo}</Titulo>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Original" className="min-w-0">
          {!url ? (
            <Panel>
              <p role="alert" className="text-sm text-texto">
                No se pudo generar el enlace al original. Intenta de nuevo.
              </p>
            </Panel>
          ) : tipo?.vista_previa && tipo.clase === "pdf" ? (
            // El original es hostil: se muestra desde el dominio del almacenamiento, no del nuestro.
            <iframe
              src={url}
              title={`Original: ${d.nombre_archivo}`}
              className="h-[75vh] w-full rounded-lg border border-linea bg-white"
            />
          ) : tipo?.vista_previa ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada de corta duración; no se optimiza ni se cachea.
            <img
              src={url}
              alt={`Original: ${d.nombre_archivo}`}
              className="max-h-[75vh] max-w-full rounded-lg border border-linea"
            />
          ) : (
            <Panel>
              <p className="text-sm text-tenue">
                Este tipo de archivo no tiene vista previa. Descárgalo para abrirlo.
              </p>
            </Panel>
          )}
          <p className="mt-2 text-xs text-tenue">
            El enlace al original vence en {VIGENCIA} segundos.{" "}
            <Link href={`${base}/documentos/${d.id}`} className="text-azul-claro hover:underline">
              Renovar
            </Link>
          </p>
        </section>

        <aside className="flex flex-col gap-4">
          <Panel>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-tenue">Expediente</dt>
              <dd className="text-texto">{d.expediente?.identificador ?? "—"}</dd>
              <dt className="text-tenue">Fuente</dt>
              <dd className="text-texto">{d.fuente ?? "—"}</dd>
              <dt className="text-tenue">Recibido</dt>
              <dd className="text-texto">{formatoFecha(d.recibido_en)}</dd>
              <dt className="text-tenue">Tamaño</dt>
              <dd className="text-texto">
                {d.tamano === null ? "—" : `${Math.max(1, Math.round(d.tamano / 1024))} KB`}
              </dd>
              <dt className="text-tenue">SHA-256</dt>
              <dd className="font-mono text-xs break-all text-texto">{d.sha256}</dd>
            </dl>
            {descargar.data?.signedUrl ? (
              <a
                href={descargar.data.signedUrl}
                className="mt-4 inline-block rounded-md border border-linea-2 px-3 py-1.5 text-sm text-texto hover:border-oro"
              >
                Descargar original
              </a>
            ) : null}
          </Panel>
          <Panel>
            <h2 className="mb-2 text-sm font-semibold text-texto">Registros de este documento</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {(registros ?? []).map((r) => (
                <li key={r.id}>
                  <Link
                    href={`${base}/registros/${r.id}`}
                    className="text-azul-claro hover:underline"
                  >
                    {r.resumen ?? "Registro"}
                  </Link>{" "}
                  <span className="text-xs text-tenue">{r.estado_validacion}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </main>
  );
}
