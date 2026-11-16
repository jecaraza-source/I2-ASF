import { leerParametrosTabla, puede, rangoDePagina } from "@sigma/modelo";
import Link from "next/link";
import { TablaDatos, type Columna } from "@/components/tabla-datos";
import { EnlaceBoton, Etiqueta, Titulo } from "@/components/ui";
import { formatoFecha } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

export const metadata = { title: "Encargos — SIGMA" };

const COLUMNAS = ["nombre", "tipo_auditoria", "periodo_inicio", "estado", "creado_en"] as const;
type Orden = (typeof COLUMNAS)[number];
type Fila = {
  id: string;
  nombre: string;
  tipo_auditoria: string | null;
  periodo_inicio: string | null;
  periodo_fin: string | null;
  estado: string;
};

export default async function Encargos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { activa } = await requerirOrganizacion();
  const parametros = leerParametrosTabla(await searchParams, {
    columnas: COLUMNAS,
    ordenPorDefecto: "creado_en",
    dirPorDefecto: "desc",
  });

  const supabase = await clienteServidor();
  let consulta = supabase
    .from("encargo")
    .select("id, nombre, tipo_auditoria, periodo_inicio, periodo_fin, estado", { count: "exact" })
    .eq("organizacion_id", activa.organizacionId);
  if (parametros.q)
    consulta = consulta.or(`nombre.ilike.%${parametros.q}%,tipo_auditoria.ilike.%${parametros.q}%`);
  const [desde, hasta] = rangoDePagina(parametros);
  const { data, count, error } = await consulta
    .order(parametros.orden, { ascending: parametros.dir === "asc" })
    .order("id")
    .range(desde, hasta);
  if (error) throw new Error("No se pudieron leer los encargos");

  const puedeCrear = puede(activa.rol, "encargo.crear");
  const nuevo = puedeCrear ? <EnlaceBoton href="/encargos/nuevo">Nuevo encargo</EnlaceBoton> : null;

  const columnas: Columna<Fila, Orden>[] = [
    {
      clave: "nombre",
      titulo: "Encargo",
      orden: "nombre",
      celda: (f) => (
        <Link href={`/encargos/${f.id}`} className="font-medium text-azul-claro hover:underline">
          {f.nombre}
        </Link>
      ),
    },
    {
      clave: "tipo",
      titulo: "Tipo",
      orden: "tipo_auditoria",
      celda: (f) => f.tipo_auditoria ?? "—",
    },
    {
      clave: "periodo",
      titulo: "Periodo",
      orden: "periodo_inicio",
      celda: (f) => `${formatoFecha(f.periodo_inicio)} – ${formatoFecha(f.periodo_fin)}`,
    },
    {
      clave: "estado",
      titulo: "Estado",
      orden: "estado",
      celda: (f) => <Etiqueta tono={f.estado === "activo" ? "ok" : "neutro"}>{f.estado}</Etiqueta>,
    },
  ];

  return (
    <main className="flex-1 px-8 py-8">
      <Titulo accion={nuevo}>Encargos</Titulo>
      <TablaDatos
        filas={data ?? []}
        total={count ?? 0}
        columnas={columnas}
        parametros={parametros}
        ruta="/encargos"
        llave={(f) => f.id}
        etiqueta="Encargos de la organización"
        placeholderBusqueda="Buscar por nombre o tipo"
        vacio={{
          titulo: "Aún no hay encargos.",
          descripcion: puedeCrear
            ? "Crea el primero para empezar a integrar fuentes."
            : "Cuando un auditor cree uno, aparecerá aquí.",
          accion: nuevo,
        }}
      />
    </main>
  );
}
