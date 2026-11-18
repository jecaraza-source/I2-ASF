import { NOMBRE_PROVEEDOR_IA, puede, formatoNumero, formatoPorcentaje } from "@sigma/modelo";
import Link from "next/link";
import { EstadoVacio } from "@/components/estados";
import { EnlaceBoton, Etiqueta, Titulo } from "@/components/ui";
import { obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { colaValidacion } from "@/lib/validacion-datos";

export const metadata = { title: "Validación — SIGMA" };

const fecha = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export default async function PaginaValidacion({
  params,
  searchParams,
}: {
  params: Promise<{ encargo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { encargo: id } = await params;
  const encargo = await obtenerEncargo(id);
  const { activa } = await requerirOrganizacion();
  const supabase = await clienteServidor();
  const cola = await colaValidacion(supabase, encargo.id);
  const base = `/encargos/${encargo.id}`;
  const puedeValidar = puede(activa.rol, "registro.validar");
  const listo = (await searchParams).listo === "1";
  const proveedores: Record<string, string> = NOMBRE_PROVEEDOR_IA;

  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Titulo
        accion={
          puedeValidar && cola[0] ? (
            <EnlaceBoton href={`${base}/validacion/${cola[0].id}`}>Empezar a validar</EnlaceBoton>
          ) : null
        }
      >
        Validación
      </Titulo>
      <p className="-mt-3 mb-6 max-w-3xl text-sm text-tenue">
        Documentos que la IA ya leyó. Lo que propone no alimenta entidades, vínculos ni alertas
        hasta que una persona lo valida. Umbral de confianza del encargo:{" "}
        {formatoPorcentaje(encargo.umbral_confianza)}.
      </p>
      {listo ? (
        <p role="status" className="mb-4 rounded-md border border-ok/60 px-3 py-2 text-sm text-ok">
          Listo.{" "}
          {cola.length
            ? `Quedan ${formatoNumero(cola.length)} en la cola.`
            : "No queda nada por validar."}
        </p>
      ) : null}
      {!cola.length ? (
        <EstadoVacio
          titulo="No hay documentos por validar."
          descripcion="Aquí aparecen los documentos conforme la IA termina de leerlos (Ingreso de documentos)."
        />
      ) : (
        <section
          aria-label="Cola de validación"
          className="overflow-x-auto rounded-lg border border-linea"
        >
          <table className="w-full text-left text-sm">
            <thead className="bg-panel-2 text-xs tracking-wide text-tenue uppercase">
              <tr>
                {["Documento", "Tipo", "Leído por", "Datos", "Ingresado"].map((t) => (
                  <th key={t} scope="col" className="px-4 py-2">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {cola.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="px-4 py-3 font-normal">
                    {puedeValidar ? (
                      <Link
                        href={`${base}/validacion/${r.id}`}
                        className="text-azul-claro underline"
                      >
                        {r.archivo}
                      </Link>
                    ) : (
                      <span className="text-texto">{r.archivo}</span>
                    )}
                  </th>
                  <td className="px-4 py-3 text-texto">{r.tipo}</td>
                  <td className="px-4 py-3 text-tenue">
                    {(r.proveedor && proveedores[r.proveedor]) ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.porRevisar ? (
                      <Etiqueta tono="oro">
                        {formatoNumero(r.porRevisar)} de {formatoNumero(r.total)} por revisar
                      </Etiqueta>
                    ) : (
                      <Etiqueta tono="ok">{formatoNumero(r.total)} sobre el umbral</Etiqueta>
                    )}
                  </td>
                  <td className="px-4 py-3 text-tenue">{fecha.format(new Date(r.creadoEn))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {!puedeValidar ? (
        <p className="mt-4 text-sm text-tenue">Tu rol permite consultar la cola, no validar.</p>
      ) : null}
    </main>
  );
}
