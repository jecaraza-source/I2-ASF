import { PROVEEDORES_IA, puede, type ProveedorIA, formatoNumero } from "@sigma/modelo";
import Link from "next/link";
import { SinPermiso } from "@/components/estados";
import { FormularioCategoria, FormularioTipoDocumento } from "@/components/formularios/catalogo";
import { CargaLista69b } from "@/components/fuentes/carga-lista";
import { FormularioIAEncargo } from "@/components/ia/formularios";
import { FormularioReglas } from "@/components/red/formularios";
import { Panel, Titulo } from "@/components/ui";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { cargarReglas, valoresDeReglas } from "@/lib/red-datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

export default async function Configuracion({ params }: { params: Promise<{ encargo: string }> }) {
  const { encargo: id } = await params;
  const encargo = await obtenerEncargo(id);
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "catalogo.editar")) {
    return (
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <Titulo>Configuración</Titulo>
        <SinPermiso texto="Solo un administrador de la organización configura el catálogo documental." />
      </main>
    );
  }

  const supabase = await clienteServidor();
  const [{ data: categorias }, { data: tipos }] = await Promise.all([
    supabase
      .from("categoria_documental")
      .select("id, nombre, orden")
      .eq("organizacion_id", activa.organizacionId)
      .order("orden")
      .order("nombre"),
    supabase
      .from("tipo_documento")
      .select("id, clave, nombre, categoria_id")
      .eq("organizacion_id", activa.organizacionId)
      .order("nombre"),
  ]);
  const reglas = await cargarReglas(supabase, activa.organizacionId);
  const [{ data: fuentes }, { data: cargas }] = await Promise.all([
    supabase
      .from("fuente_consulta")
      .select("id, nombre, tipo, conector, activa")
      .eq("organizacion_id", activa.organizacionId)
      .order("nombre"),
    supabase
      .from("carga_fuente")
      .select(
        "id, fuente_id, nombre_archivo, formato, sha256, filas, estado, vigente_desde, creado_en",
      )
      .eq("organizacion_id", activa.organizacionId)
      .neq("estado", "en_proceso")
      .order("creado_en", { ascending: false })
      .limit(10),
  ]);
  const { data: iaEncargo } = await supabase
    .from("encargo")
    .select("ia_proveedores")
    .eq("id", encargo.id)
    .maybeSingle();
  const cats = categorias ?? [];
  const nombreCategoria = new Map(cats.map((c) => [c.id, c.nombre]));
  const base = `/encargos/${encargo.id}/configuracion`;

  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Titulo>Configuración</Titulo>
      <p className="-mt-3 mb-6 text-sm text-tenue">
        El catálogo documental es de la organización: aplica a todos sus encargos.
      </p>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <h2 className="mb-4 text-base font-semibold text-texto">Categorías</h2>
          <ul className="mb-6 divide-y divide-linea text-sm" aria-label="Categorías documentales">
            {cats.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <span className="text-texto">
                  <span className="mr-2 text-tenue-2">{c.orden}</span>
                  {c.nombre}
                </span>
                <Link
                  href={`${base}/categorias/${c.id}`}
                  className="text-xs text-azul-claro hover:underline"
                >
                  Editar
                </Link>
              </li>
            ))}
          </ul>
          <FormularioCategoria encargoId={encargo.id} />
        </Panel>
        <Panel>
          <h2 className="mb-4 text-base font-semibold text-texto">Tipos de documento</h2>
          <ul className="mb-6 divide-y divide-linea text-sm" aria-label="Tipos de documento">
            {(tipos ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2">
                <span className="text-texto">
                  {t.nombre} <span className="font-mono text-xs text-tenue-2">{t.clave}</span>
                  <span className="ml-2 text-xs text-tenue">
                    {nombreCategoria.get(t.categoria_id)}
                  </span>
                </span>
                <Link
                  href={`${base}/tipos/${t.id}`}
                  className="text-xs text-azul-claro hover:underline"
                >
                  Editar
                </Link>
              </li>
            ))}
          </ul>
          <FormularioTipoDocumento encargoId={encargo.id} categorias={cats} />
        </Panel>
        <Panel>
          <h2 className="mb-1 text-base font-semibold text-texto" id="ia">
            IA en este encargo
          </h2>
          <p className="mb-3 text-xs text-tenue">
            Proveedores a los que este encargo puede enviar documentos para leerlos. Sin marcas, la
            IA está apagada aquí. El consumo y los topes están en{" "}
            <Link href="/ia" className="text-azul-claro underline hover:text-texto">
              Uso de IA
            </Link>
            .
          </p>
          <FormularioIAEncargo
            encargoId={encargo.id}
            nombre={encargo.nombre}
            proveedores={(iaEncargo?.ia_proveedores ?? []).filter((p): p is ProveedorIA =>
              (PROVEEDORES_IA as readonly string[]).includes(p),
            )}
          />
        </Panel>
        <Panel>
          <h2 className="mb-1 text-base font-semibold text-texto" id="fuentes">
            Fuentes de consulta
          </h2>
          <p className="mb-4 text-xs text-tenue">
            Lo que se consulta desde la ficha de cada entidad. Son de la organización.
          </p>
          <ul className="flex flex-col gap-4" aria-label="Fuentes de consulta">
            {(fuentes ?? []).map((f) => {
              const historial = (cargas ?? []).filter((c) => c.fuente_id === f.id);
              const vigente = historial.find((c) => c.estado === "vigente");
              return (
                <li
                  key={f.id}
                  className="flex flex-col gap-2 border-t border-linea pt-3 first:border-t-0 first:pt-0"
                >
                  <p className="text-sm text-texto">
                    {f.nombre}{" "}
                    <span className="text-xs text-tenue">
                      · {f.tipo === "interna" ? "interna" : "externa (copia local)"} ·{" "}
                      {f.activa ? "activa" : "inactiva"}
                    </span>
                  </p>
                  {f.conector === "lista_69b" ? (
                    <>
                      <p className="text-xs text-tenue" data-testid="lista-vigente">
                        {vigente
                          ? `Vigente: ${vigente.nombre_archivo} · ${formatoNumero(vigente.filas)} contribuyentes · cargada el ${formatoFecha(vigente.vigente_desde)} · SHA-256 ${vigente.sha256.slice(0, 12)}…`
                          : "Aún no hay lista cargada: las consultas no encuentran nada en esta fuente."}
                      </p>
                      {historial.length > 1 ? (
                        <details className="text-xs text-tenue">
                          <summary className="cursor-pointer">Cargas anteriores</summary>
                          <ul className="mt-1 flex flex-col gap-0.5">
                            {historial
                              .filter((c) => c.estado !== "vigente")
                              .map((c) => (
                                <li key={c.id}>
                                  {c.nombre_archivo} · {formatoNumero(c.filas)} ·{" "}
                                  {formatoFecha(c.creado_en)} · SHA-256 {c.sha256.slice(0, 12)}…
                                </li>
                              ))}
                          </ul>
                        </details>
                      ) : null}
                      {puede(activa.rol, "fuente.cargar") ? (
                        <CargaLista69b fuenteId={f.id} />
                      ) : (
                        <p className="text-xs text-tenue-2">
                          Solo un administrador carga la lista.
                        </p>
                      )}
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel>
          <h2 className="mb-4 text-base font-semibold text-texto" id="reglas">
            Reglas de calificación de la red
          </h2>
          <FormularioReglas valores={valoresDeReglas(reglas.reglas)} version={reglas.version} />
        </Panel>
      </div>
    </main>
  );
}
