import { puede } from "@sigma/modelo";
import Link from "next/link";
import { SinPermiso } from "@/components/estados";
import { FormularioCategoria, FormularioTipoDocumento } from "@/components/formularios/catalogo";
import { FormularioReglas } from "@/components/red/formularios";
import { Panel, Titulo } from "@/components/ui";
import { obtenerEncargo } from "@/lib/datos";
import { cargarReglas, valoresDeReglas } from "@/lib/red-datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

export default async function Configuracion({ params }: { params: Promise<{ encargo: string }> }) {
  const { encargo: id } = await params;
  const encargo = await obtenerEncargo(id);
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "catalogo.editar")) {
    return (
      <main className="flex-1 px-8 py-8">
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
  const cats = categorias ?? [];
  const nombreCategoria = new Map(cats.map((c) => [c.id, c.nombre]));
  const base = `/encargos/${encargo.id}/configuracion`;

  return (
    <main className="flex-1 px-8 py-8">
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
          <h2 className="mb-4 text-base font-semibold text-texto" id="reglas">
            Reglas de calificación de la red
          </h2>
          <FormularioReglas valores={valoresDeReglas(reglas.reglas)} version={reglas.version} />
        </Panel>
      </div>
    </main>
  );
}
