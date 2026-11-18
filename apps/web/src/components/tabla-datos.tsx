import Link from "next/link";
import type { ReactNode } from "react";
import {
  POR_PAGINA_OPCIONES,
  totalPaginas,
  type ParametrosTabla,
  formatoNumero,
} from "@sigma/modelo";
import { EstadoVacio } from "@/components/estados";

export type Columna<F, C extends string> = {
  clave: string;
  titulo: string;
  /** Columna de la base por la que se ordena; si falta, no es ordenable. */
  orden?: C;
  celda: (fila: F) => ReactNode;
  className?: string;
};

/**
 * Tabla con orden, filtro y paginación en servidor. El estado vive en la URL
 * (?q, ?orden, ?dir, ?pagina, ?por), así se comparte y funciona el botón atrás.
 */
export function TablaDatos<F, C extends string>({
  filas,
  total,
  columnas,
  parametros,
  ruta,
  llave,
  etiqueta,
  placeholderBusqueda = "Buscar…",
  vacio,
}: {
  filas: F[];
  total: number;
  columnas: Columna<F, C>[];
  parametros: ParametrosTabla<C>;
  ruta: string;
  llave: (fila: F) => string;
  etiqueta: string;
  placeholderBusqueda?: string;
  vacio: { titulo: string; descripcion?: string; accion?: ReactNode };
}) {
  const paginas = totalPaginas(total, parametros.porPagina);
  const href = (
    cambios: Partial<Record<"pagina" | "orden" | "dir" | "q" | "por", string | number>>,
  ) => {
    const p = new URLSearchParams();
    const valores = {
      q: parametros.q,
      orden: parametros.orden,
      dir: parametros.dir,
      pagina: parametros.pagina,
      por: parametros.porPagina,
      ...cambios,
    };
    for (const [k, v] of Object.entries(valores)) {
      if (v !== "" && v !== undefined) p.set(k, String(v));
    }
    return `${ruta}?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <form action={ruta} method="get" role="search" className="flex flex-wrap items-center gap-2">
        <label htmlFor="q" className="sr-only">
          Buscar en {etiqueta}
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={parametros.q}
          placeholder={placeholderBusqueda}
          className="w-64 rounded-md border border-linea-2 bg-fondo-2 px-3 py-1.5 text-sm text-texto placeholder:text-tenue-2 focus:border-oro focus:outline-none"
        />
        <input type="hidden" name="orden" value={parametros.orden} />
        <input type="hidden" name="dir" value={parametros.dir} />
        <input type="hidden" name="por" value={parametros.porPagina} />
        <button
          type="submit"
          className="rounded-md border border-linea-2 px-3 py-1.5 text-sm text-texto hover:border-oro"
        >
          Filtrar
        </button>
        {parametros.q ? (
          <Link
            href={href({ q: "", pagina: 1 })}
            className="text-sm text-tenue underline hover:text-texto"
          >
            Quitar filtro
          </Link>
        ) : null}
      </form>

      {filas.length === 0 ? (
        <EstadoVacio
          titulo={parametros.q ? "Nada coincide con la búsqueda." : vacio.titulo}
          descripcion={
            parametros.q ? "Prueba con otro término o quita el filtro." : vacio.descripcion
          }
          accion={parametros.q ? undefined : vacio.accion}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-linea">
          <table
            className={`w-full text-left text-sm ${columnas.length > 3 ? "tabla-tarjetas" : ""}`}
          >
            <caption className="sr-only">{etiqueta}</caption>
            <thead className="bg-panel-2 text-xs tracking-wide text-tenue uppercase">
              <tr>
                {columnas.map((c) => {
                  const activa = c.orden !== undefined && c.orden === parametros.orden;
                  const siguienteDir = activa && parametros.dir === "asc" ? "desc" : "asc";
                  return (
                    <th
                      key={c.clave}
                      scope="col"
                      aria-sort={
                        activa ? (parametros.dir === "asc" ? "ascending" : "descending") : undefined
                      }
                      className={`px-4 py-2.5 font-medium ${c.className ?? ""}`}
                    >
                      {c.orden ? (
                        <Link
                          href={href({ orden: c.orden, dir: siguienteDir, pagina: 1 })}
                          className="inline-flex items-center gap-1 hover:text-texto"
                        >
                          {c.titulo}
                          <span aria-hidden="true" className={activa ? "text-oro" : "text-tenue-2"}>
                            {activa ? (parametros.dir === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </Link>
                      ) : (
                        c.titulo
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={llave(f)} className="border-t border-linea hover:bg-panel/60">
                  {columnas.map((c, i) => (
                    <td
                      key={c.clave}
                      data-etiqueta={i > 0 ? c.titulo : undefined}
                      className={`px-4 py-2.5 text-texto ${c.className ?? ""}`}
                    >
                      {c.celda(f)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav
        aria-label="Paginación"
        className="flex flex-wrap items-center justify-between gap-3 text-sm text-tenue"
      >
        <span>
          {total === 0
            ? "0 resultados"
            : `${formatoNumero((parametros.pagina - 1) * parametros.porPagina + 1)}–${formatoNumero(
                Math.min(parametros.pagina * parametros.porPagina, total),
              )} de ${formatoNumero(total)}`}
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            Por página:
            {POR_PAGINA_OPCIONES.map((n) =>
              n === parametros.porPagina ? (
                <span key={n} className="px-1 text-texto" aria-current="true">
                  {n}
                </span>
              ) : (
                <Link key={n} href={href({ por: n, pagina: 1 })} className="px-1 hover:text-texto">
                  {n}
                </Link>
              ),
            )}
          </span>
          {parametros.pagina > 1 ? (
            <Link href={href({ pagina: parametros.pagina - 1 })} className="hover:text-texto">
              ← Anterior
            </Link>
          ) : null}
          <span>
            Página {formatoNumero(Math.min(parametros.pagina, paginas))} de {formatoNumero(paginas)}
          </span>
          {parametros.pagina < paginas ? (
            <Link href={href({ pagina: parametros.pagina + 1 })} className="hover:text-texto">
              Siguiente →
            </Link>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
