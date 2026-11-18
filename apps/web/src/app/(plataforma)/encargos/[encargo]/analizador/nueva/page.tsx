import { puede } from "@sigma/modelo";
import { notFound } from "next/navigation";
import { z } from "zod";
import { NuevaSintesis } from "@/components/analizador/nueva";
import { EstadoVacio, SinPermiso } from "@/components/estados";
import { EnlaceBoton, Panel, Titulo } from "@/components/ui";
import { MAX_REGISTROS_ALCANCE, nombreAlcance, registrosDelAlcance } from "@/lib/analizador-datos";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

export default async function NuevaSintesisPagina({
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
  const expediente = z.uuid().safeParse(sp.expediente);
  const entidad = z.uuid().safeParse(sp.entidad);
  const alcance = expediente.success
    ? { tipo: "expediente" as const, id: expediente.data }
    : entidad.success
      ? { tipo: "entidad" as const, id: entidad.data }
      : null;
  if (!alcance) notFound();
  const supabase = await clienteServidor();
  const nombre = await nombreAlcance(supabase, encargo.id, alcance.tipo, alcance.id);
  if (!nombre) notFound();
  const titulo = `Nueva síntesis · ${alcance.tipo === "expediente" ? "expediente" : "entidad"} ${nombre}`;
  if (!puede(activa.rol, "sintesis.generar")) {
    return (
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <Titulo>{titulo}</Titulo>
        <SinPermiso texto="Tu rol puede consultar síntesis, pero no generarlas." />
      </main>
    );
  }
  const { registros, total, sinValidar } = await registrosDelAlcance(
    supabase,
    encargo.id,
    alcance.tipo,
    alcance.id,
  );

  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Titulo
        accion={
          <EnlaceBoton href={`/encargos/${encargo.id}/analizador`} variante="secundario">
            Volver al Analizador
          </EnlaceBoton>
        }
      >
        {titulo}
      </Titulo>
      <div className="flex max-w-4xl flex-col gap-4">
        {sinValidar ? (
          <p role="status" className="text-sm text-tenue" data-testid="sin-validar">
            {sinValidar} registro(s) sin validar no aparecen: valídalos primero para que puedan
            entrar.
          </p>
        ) : null}
        {total > MAX_REGISTROS_ALCANCE ? (
          <p role="status" className="text-sm text-oro">
            El alcance tiene {total} registros validados; se muestran los primeros{" "}
            {MAX_REGISTROS_ALCANCE} por fecha. Para cubrir el resto, genera otra síntesis.
          </p>
        ) : null}
        {registros.length === 0 ? (
          <EstadoVacio
            titulo="Sin registros validados en este alcance."
            descripcion="La síntesis solo trabaja con registros validados por un auditor o leídos con confianza suficiente."
          />
        ) : (
          <Panel>
            <NuevaSintesis
              encargoId={encargo.id}
              alcanceTipo={alcance.tipo}
              alcanceId={alcance.id}
              registros={registros.map((r) => ({
                id: r.id,
                etiqueta: [
                  formatoFecha(r.fecha),
                  r.tipo ?? "Sin tipo",
                  r.resumen ?? "",
                  r.expediente ?? "",
                ]
                  .filter(Boolean)
                  .join(" · "),
              }))}
            />
          </Panel>
        )}
      </div>
    </main>
  );
}
