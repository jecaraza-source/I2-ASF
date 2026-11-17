import { puede } from "@sigma/modelo";
import { TarjetasRecorridos } from "@/components/recorridos";
import { EnlaceBoton, Panel, Titulo } from "@/components/ui";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

export default async function ResumenEncargo({ params }: { params: Promise<{ encargo: string }> }) {
  const { encargo: id } = await params;
  const encargo = await obtenerEncargo(id);
  const { activa } = await requerirOrganizacion();
  const supabase = await clienteServidor();
  const { count } = await supabase
    .from("expediente")
    .select("id", { count: "exact", head: true })
    .eq("encargo_id", encargo.id);

  return (
    <main className="flex-1 px-8 py-8">
      <Titulo
        accion={
          puede(activa.rol, "encargo.editar") ? (
            <EnlaceBoton variante="secundario" href={`/encargos/${encargo.id}/editar`}>
              Editar encargo
            </EnlaceBoton>
          ) : null
        }
      >
        {encargo.nombre}
      </Titulo>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel>
          <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
            <dt className="text-tenue">Tipo de auditoría</dt>
            <dd className="text-texto">{encargo.tipo_auditoria ?? "—"}</dd>
            <dt className="text-tenue">Periodo</dt>
            <dd className="text-texto">
              {formatoFecha(encargo.periodo_inicio)} – {formatoFecha(encargo.periodo_fin)}
            </dd>
            <dt className="text-tenue">Estado</dt>
            <dd className="text-texto">{encargo.estado}</dd>
            <dt className="text-tenue">Umbral de confianza</dt>
            <dd className="text-texto">{encargo.umbral_confianza}</dd>
          </dl>
        </Panel>
        <Panel>
          <p className="text-sm text-tenue">Expedientes</p>
          <p className="mt-1 text-3xl font-semibold text-texto">{count ?? 0}</p>
          <EnlaceBoton
            variante="secundario"
            href={`/encargos/${encargo.id}/expedientes`}
            className="mt-4"
          >
            Ver expedientes
          </EnlaceBoton>
        </Panel>
      </div>
      <section aria-label="Por dónde empezar" className="mt-8">
        <h2 className="mb-1 text-base font-semibold text-texto">¿Qué quieres hacer?</h2>
        <p className="mb-4 text-sm text-tenue">
          Empieza por una tarea y sigue sus etapas, o entra directo a un módulo desde el menú.
        </p>
        <TarjetasRecorridos encargoId={encargo.id} />
      </section>
    </main>
  );
}
