import { leerParametrosTabla, puede, rangoDePagina } from "@sigma/modelo";
import Link from "next/link";
import { TablaDatos, type Columna } from "@/components/tabla-datos";
import { EnlaceBoton, Titulo } from "@/components/ui";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

const COLUMNAS = ["identificador", "numero_control", "creado_en"] as const;
type Orden = (typeof COLUMNAS)[number];
type Fila = {
  id: string;
  identificador: string;
  numero_control: string | null;
  descripcion: string | null;
  creado_en: string;
};

export default async function Expedientes({
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
    ordenPorDefecto: "identificador",
  });

  const supabase = await clienteServidor();
  let consulta = supabase
    .from("expediente")
    .select("id, identificador, numero_control, descripcion, creado_en", { count: "exact" })
    .eq("encargo_id", encargo.id);
  if (parametros.q) {
    const q = parametros.q;
    consulta = consulta.or(
      `identificador.ilike.%${q}%,numero_control.ilike.%${q}%,descripcion.ilike.%${q}%`,
    );
  }
  const [desde, hasta] = rangoDePagina(parametros);
  const { data, count, error } = await consulta
    .order(parametros.orden, { ascending: parametros.dir === "asc" })
    .order("id")
    .range(desde, hasta);
  if (error) throw new Error("No se pudieron leer los expedientes");

  const base = `/encargos/${encargo.id}/expedientes`;
  const nuevo = puede(activa.rol, "expediente.crear") ? (
    <EnlaceBoton href={`${base}/nuevo`}>Nuevo expediente</EnlaceBoton>
  ) : null;

  const columnas: Columna<Fila, Orden>[] = [
    {
      clave: "identificador",
      titulo: "Identificador",
      orden: "identificador",
      celda: (f) => (
        <Link
          href={`${base}/${f.id}`}
          className="font-mono font-medium text-azul-claro hover:underline"
        >
          {f.identificador}
        </Link>
      ),
    },
    {
      clave: "control",
      titulo: "Número de control",
      orden: "numero_control",
      celda: (f) => f.numero_control ?? "—",
    },
    {
      clave: "descripcion",
      titulo: "Descripción",
      celda: (f) => <span className="line-clamp-1 text-tenue">{f.descripcion ?? "—"}</span>,
    },
    { clave: "alta", titulo: "Alta", orden: "creado_en", celda: (f) => formatoFecha(f.creado_en) },
  ];

  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Titulo accion={nuevo}>Expedientes</Titulo>
      <TablaDatos
        filas={data ?? []}
        total={count ?? 0}
        columnas={columnas}
        parametros={parametros}
        ruta={base}
        llave={(f) => f.id}
        etiqueta="Expedientes del encargo"
        placeholderBusqueda="Identificador, control o descripción"
        vacio={{
          titulo: "Este encargo aún no tiene expedientes.",
          descripcion: "Los expedientes agrupan los registros por número de control.",
          accion: nuevo,
        }}
      />
    </main>
  );
}
