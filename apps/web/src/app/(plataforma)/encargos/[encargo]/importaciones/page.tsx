import { leerParametrosTabla, puede, rangoDePagina } from "@sigma/modelo";
import Link from "next/link";
import { TablaDatos, type Columna } from "@/components/tabla-datos";
import { EnlaceBoton, Titulo } from "@/components/ui";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

const COLUMNAS = ["nombre_archivo", "recibido_en", "registros"] as const;
type Orden = (typeof COLUMNAS)[number];
type Fila = {
  documento_id: string | null;
  nombre_archivo: string | null;
  recibido_en: string | null;
  registros: number | null;
  contratos: number | null;
  transferencias: number | null;
  llamadas: number | null;
  vinculos: number | null;
};

export default async function Importaciones({
  params,
  searchParams,
}: {
  params: Promise<{ encargo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { encargo: id } = await params;
  const encargo = await obtenerEncargo(id);
  const { activa } = await requerirOrganizacion();
  const parametros = leerParametrosTabla(await searchParams, {
    columnas: COLUMNAS,
    ordenPorDefecto: "recibido_en",
    dirPorDefecto: "desc",
  });
  const supabase = await clienteServidor();
  let consulta = supabase
    .from("importacion_resumen")
    .select(
      "documento_id, nombre_archivo, recibido_en, registros, contratos, transferencias, llamadas, vinculos",
      {
        count: "exact",
      },
    )
    .eq("encargo_id", encargo.id);
  if (parametros.q) consulta = consulta.ilike("nombre_archivo", `%${parametros.q}%`);
  const [desde, hasta] = rangoDePagina(parametros);
  const { data, count, error } = await consulta
    .order(parametros.orden, { ascending: parametros.dir === "asc" })
    .range(desde, hasta);
  if (error) throw new Error("No se pudieron leer las importaciones");

  const base = `/encargos/${encargo.id}/importaciones`;
  const nueva = puede(activa.rol, "importacion.crear") ? (
    <EnlaceBoton href={`${base}/nueva`}>Nueva importación</EnlaceBoton>
  ) : null;
  const columnas: Columna<Fila, Orden>[] = [
    {
      clave: "archivo",
      titulo: "Archivo",
      orden: "nombre_archivo",
      celda: (f) => (
        <Link
          href={`${base}/${f.documento_id}`}
          className="font-medium text-azul-claro hover:underline"
        >
          {f.nombre_archivo}
        </Link>
      ),
    },
    {
      clave: "fecha",
      titulo: "Importado",
      orden: "recibido_en",
      celda: (f) => formatoFecha(f.recibido_en),
    },
    { clave: "registros", titulo: "Registros", orden: "registros", celda: (f) => f.registros ?? 0 },
    {
      clave: "detalle",
      titulo: "Contenido",
      celda: (f) => (
        <span className="text-xs text-tenue">
          {f.contratos} contratos · {f.transferencias} movimientos · {f.llamadas} llamadas ·{" "}
          {f.vinculos} vínculos
        </span>
      ),
    },
  ];
  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Titulo accion={nueva}>Importación de Excel</Titulo>
      <TablaDatos
        filas={data ?? []}
        total={count ?? 0}
        columnas={columnas}
        parametros={parametros}
        ruta={base}
        llave={(f) => f.documento_id ?? ""}
        etiqueta="Importaciones del encargo"
        placeholderBusqueda="Nombre del archivo"
        vacio={{
          titulo: "Aún no hay importaciones.",
          descripcion: "Sube un Excel: se reconoce su plantilla o defines el mapeo de columnas.",
          accion: nueva,
        }}
      />
    </main>
  );
}
