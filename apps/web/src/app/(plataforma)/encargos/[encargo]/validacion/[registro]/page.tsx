import { puede, tipoPorMime } from "@sigma/modelo";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SinPermiso } from "@/components/estados";
import { EnlaceBoton, Panel, Titulo } from "@/components/ui";
import { ValidarRegistro } from "@/components/validacion/validar";
import { obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { colaValidacion, registroPorValidar } from "@/lib/validacion-datos";

export const metadata = { title: "Validar registro — SIGMA" };

/** La validación de un documento toma minutos: el enlace al original dura 15. */
const VIGENCIA = 900;

export default async function PaginaValidarRegistro({
  params,
}: {
  params: Promise<{ encargo: string; registro: string }>;
}) {
  const { encargo: encargoId, registro: registroId } = await params;
  const encargo = await obtenerEncargo(encargoId);
  if (!z.uuid().safeParse(registroId).success) notFound();
  const { activa, usuario } = await requerirOrganizacion();
  const base = `/encargos/${encargo.id}`;
  if (!puede(activa.rol, "registro.validar")) {
    return (
      <main className="flex-1 px-8 py-8">
        <Titulo>Validar registro</Titulo>
        <SinPermiso texto="Tu rol permite consultar la cola de validación, no validar." />
      </main>
    );
  }
  const supabase = await clienteServidor();
  const r = await registroPorValidar(supabase, encargo.id, registroId);
  if (!r) notFound();
  if (!r.enCola) {
    return (
      <main className="flex-1 px-8 py-8">
        <Titulo>Validar registro</Titulo>
        <Panel>
          <p className="text-sm text-texto">
            Este registro ya no está en la cola de validación (estado: {r.estadoValidacion}).
          </p>
          <div className="mt-4 flex gap-3">
            <EnlaceBoton href={`${base}/registros/${r.id}`}>Ver el registro</EnlaceBoton>
            <EnlaceBoton variante="secundario" href={`${base}/validacion`}>
              Volver a la cola
            </EnlaceBoton>
          </div>
        </Panel>
      </main>
    );
  }

  const [cola, { data: expedientes }, { data: entidades }, firmada] = await Promise.all([
    colaValidacion(supabase, encargo.id),
    supabase
      .from("expediente")
      .select("id, identificador")
      .eq("encargo_id", encargo.id)
      .order("identificador"),
    supabase
      .from("entidad")
      .select("nombre, tipo, identificadores")
      .eq("encargo_id", encargo.id)
      .is("fusionada_en", null)
      .in("tipo", ["persona_fisica", "persona_moral", "dependencia"])
      .order("nombre")
      .limit(2000),
    supabase.storage.from("originales").createSignedUrl(r.documento.storage_path, VIGENCIA),
    // Regla 3: consultar un original es una acción sobre evidencia.
    supabase.from("bitacora").insert({
      organizacion_id: activa.organizacionId,
      encargo_id: encargo.id,
      actor: usuario.id,
      accion: "documento.consulta",
      objeto_tipo: "documento_origen",
      objeto_id: r.documento.id,
    }),
  ]);
  const posicion = cola.findIndex((x) => x.id === r.id);
  const siguiente =
    cola.find((x, i) => i > posicion && x.id !== r.id) ?? cola.find((x) => x.id !== r.id);
  const tipo = tipoPorMime(r.documento.mime);

  return (
    <main className="flex-1 px-8 py-8">
      <Titulo
        accion={
          <EnlaceBoton variante="secundario" href={`${base}/validacion`}>
            Volver a la cola
          </EnlaceBoton>
        }
      >
        Validar: {r.tipo.nombre}
      </Titulo>
      <p className="-mt-3 mb-5 text-sm text-tenue">
        {posicion >= 0 ? `Documento ${posicion + 1} de ${cola.length} en la cola.` : null}
      </p>
      <ValidarRegistro
        key={r.id}
        encargoId={encargo.id}
        registroId={r.id}
        siguienteId={siguiente?.id ?? null}
        documento={{
          nombre: r.documento.nombre_archivo,
          url: firmada.data?.signedUrl ?? null,
          clase: !tipo?.vista_previa ? "otro" : tipo.clase === "pdf" ? "pdf" : "imagen",
        }}
        tipo={{
          id: r.tipo.id,
          nombre: r.tipo.nombre,
          categoria: r.tipo.categoria,
          campos: r.tipo.campos,
        }}
        expedientes={(expedientes ?? []).map((x) => ({ id: x.id, nombre: x.identificador }))}
        entidades={(entidades ?? []).map((e) => {
          const rfc = (e.identificadores as Record<string, unknown> | null)?.rfc;
          return { nombre: e.nombre, tipo: e.tipo, rfc: typeof rfc === "string" ? rfc : null };
        })}
        inicial={r.inicial}
        anotaciones={r.anotaciones}
      />
    </main>
  );
}
