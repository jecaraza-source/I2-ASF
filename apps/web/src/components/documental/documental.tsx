import {
  ESTADOS_DOCUMENTAL,
  NOMBRE_ORIGEN,
  NOMBRE_VISTA,
  ORIGENES_DOCUMENTAL,
  POR_PAGINA_DOCUMENTAL,
  VISTAS_DOCUMENTAL,
  hrefDocumental,
  ordenEfectivo,
  puede,
  type FiltrosDocumental,
  type OrdenDocumental,
  type Rol,
  formatoMonto,
  formatoNumero,
} from "@sigma/modelo";
import type { Nivel } from "@sigma/red";
import Link from "next/link";
import { EstadoVacio, SinPermiso } from "@/components/estados";
import { COLOR_NIVEL, NOMBRE_NIVEL } from "@/components/red/presentacion";
import { Etiqueta } from "@/components/ui";
import { formatoFecha } from "@/lib/datos";
import {
  leerArbol,
  leerRegistros,
  type FilaDocumental,
  type NodoExpediente,
} from "@/lib/documental-datos";
import { clienteServidor } from "@/lib/supabase/servidor";

const NOMBRE_ESTADO: Record<string, string> = {
  validados: "Validados",
  validado: "Validado",
  corregido: "Corregido",
  pendiente: "Pendiente",
  rechazado: "Rechazado",
};
const NOMBRE_ROL: Record<string, string> = {
  proveedor: "proveedor",
  dependencia: "dependencia",
  representante_legal: "representante",
  apoderado: "apoderado",
  socio: "socio",
  funcionario: "funcionario",
  notario: "notario",
  ordenante: "ordenante",
  beneficiario: "beneficiario",
  titular: "titular",
};
const NIVELES = new Set<string>(["critico", "alto", "medio", "bajo"]);
const MESES = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
const moneda = (monto: string, codigo: string) => formatoMonto(monto, codigo);

const claseControl =
  "rounded-md border border-linea-2 bg-fondo-2 px-2 py-1.5 text-sm text-texto focus:border-oro focus:outline-none";

/**
 * Expediente documental (§6.1): una sola tabla de registros con cuatro vistas, árbol lateral y
 * exportación. Todo el estado vive en la URL; filtros, orden y búsqueda corren en la base.
 *
 * `expedienteFijo`: en la página de un expediente, su tabla se limita a él (salvo en la vista por
 * entidad, que sigue a la entidad por todo el encargo).
 */
export async function Documental({
  encargoId,
  rol,
  filtros: entrada,
  expedienteFijo,
}: {
  encargoId: string;
  rol: Rol;
  filtros: FiltrosDocumental;
  expedienteFijo?: string;
}) {
  const base = `/encargos/${encargoId}`;
  const filtros: FiltrosDocumental = expedienteFijo
    ? { ...entrada, expediente: expedienteFijo }
    : entrada;
  // La página propia: la del expediente si lo hay; si no, la del encargo completo.
  const ruta = expedienteFijo ? `${base}/expedientes/${expedienteFijo}` : `${base}/registros`;
  const rutaDe = (expediente: string | null) =>
    expediente && expediente !== "sin" ? `${base}/expedientes/${expediente}` : `${base}/registros`;
  /** Enlace a otro punto del árbol: cada expediente tiene su página. */
  const nodo = (expediente: string | null, cambios: { entidad?: string; categoria?: string }) => {
    const destino = rutaDe(expediente);
    const sinExp = destino === `${base}/registros`;
    return hrefDocumental(
      destino,
      {
        ...filtros,
        vista: filtros.vista === "entidad" ? "expediente" : filtros.vista,
        entidad: undefined,
        categoria: undefined,
        expediente: undefined,
        pagina: 1,
      },
      { expediente: sinExp && expediente === null ? "sin" : undefined, ...cambios },
    );
  };

  const supabase = await clienteServidor();
  const [registros, arbol] = await Promise.all([
    filtros.vista === "entidad" && !filtros.entidad
      ? Promise.resolve(null)
      : leerRegistros(supabase, encargoId, filtros),
    leerArbol(supabase, encargoId, filtros),
  ]);
  if (registros?.ok === false || arbol === null) {
    return <SinPermiso texto="No se pudieron leer los registros. Intenta de nuevo." />;
  }

  const { orden, dir } = ordenEfectivo(filtros);
  const total = registros?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_DOCUMENTAL));
  const hayFiltros = Boolean(
    filtros.q || filtros.estado || filtros.origen || filtros.desde || filtros.hasta,
  );
  const exportar = hrefDocumental(`${base}/registros/exportar`, filtros, {
    expediente: filtros.vista === "entidad" ? undefined : filtros.expediente,
  });
  const entidadElegida = filtros.entidad
    ? arbol.flatMap((e) => e.entidades).find((e) => e.id === filtros.entidad)
    : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <Arbol
        arbol={arbol}
        filtros={filtros}
        expedienteActual={
          filtros.vista === "entidad" ? undefined : (filtros.expediente ?? undefined)
        }
        nodo={nodo}
      />

      <div className="flex min-w-0 flex-col gap-4">
        <nav aria-label="Vistas" className="flex flex-wrap gap-2">
          {VISTAS_DOCUMENTAL.map((v) => (
            <Link
              key={v}
              href={
                v === "entidad"
                  ? hrefDocumental(`${base}/registros`, filtros, {
                      vista: v,
                      expediente: undefined,
                      categoria: undefined,
                      orden: undefined,
                      dir: undefined,
                    })
                  : hrefDocumental(ruta, filtros, { vista: v, orden: undefined, dir: undefined })
              }
              aria-current={filtros.vista === v ? "page" : undefined}
              className="rounded-md border border-linea-2 px-3 py-1.5 text-sm text-texto hover:border-oro aria-[current=page]:border-oro aria-[current=page]:text-oro"
            >
              {NOMBRE_VISTA[v]}
            </Link>
          ))}
        </nav>

        <form
          method="get"
          action={ruta}
          aria-label="Filtros"
          className="flex flex-wrap items-end gap-3"
        >
          {(["vista", "entidad", "categoria"] as const).map((k) =>
            filtros[k] && !(k === "vista" && filtros.vista === "expediente") ? (
              <input key={k} type="hidden" name={k} value={String(filtros[k])} />
            ) : null,
          )}
          {!expedienteFijo && filtros.expediente && filtros.vista !== "entidad" ? (
            <input type="hidden" name="expediente" value={filtros.expediente} />
          ) : null}
          {filtros.orden ? <input type="hidden" name="orden" value={filtros.orden} /> : null}
          {filtros.dir ? <input type="hidden" name="dir" value={filtros.dir} /> : null}
          <label className="flex flex-col gap-1 text-xs text-tenue">
            Buscar
            <input
              type="search"
              name="q"
              defaultValue={filtros.q}
              placeholder="Nombre, RFC, contrato, monto…"
              className={`${claseControl} w-64`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-tenue">
            Estado
            <select name="estado" defaultValue={filtros.estado ?? ""} className={claseControl}>
              <option value="">Todos</option>
              {ESTADOS_DOCUMENTAL.map((e) => (
                <option key={e} value={e}>
                  {NOMBRE_ESTADO[e]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-tenue">
            Origen
            <select name="origen" defaultValue={filtros.origen ?? ""} className={claseControl}>
              <option value="">Todos</option>
              {ORIGENES_DOCUMENTAL.map((o) => (
                <option key={o} value={o}>
                  {NOMBRE_ORIGEN[o]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-tenue">
            Desde
            <input type="date" name="desde" defaultValue={filtros.desde} className={claseControl} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-tenue">
            Hasta
            <input type="date" name="hasta" defaultValue={filtros.hasta} className={claseControl} />
          </label>
          <button
            type="submit"
            className="rounded-md border border-linea-2 px-3 py-1.5 text-sm text-texto hover:border-oro"
          >
            Filtrar
          </button>
          {hayFiltros ? (
            <Link
              href={hrefDocumental(ruta, filtros, {
                q: undefined,
                estado: undefined,
                origen: undefined,
                desde: undefined,
                hasta: undefined,
              })}
              className="pb-1.5 text-sm text-tenue underline hover:text-texto"
            >
              Quitar filtros
            </Link>
          ) : null}
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-tenue" data-testid="resumen-documental">
            {filtros.vista === "entidad" && !filtros.entidad
              ? "Elige una entidad para ver sus registros en todos los expedientes."
              : `${formatoNumero(total)} registro(s)`}
            {entidadElegida ? (
              <>
                {" "}
                de <span className="text-texto">{entidadElegida.nombre}</span>
              </>
            ) : null}
            {filtros.categoria ? (
              <>
                {" · "}
                <Link
                  href={hrefDocumental(ruta, filtros, { categoria: undefined })}
                  className="text-azul-claro underline"
                >
                  quitar categoría
                </Link>
              </>
            ) : null}
            {filtros.entidad && filtros.vista !== "entidad" ? (
              <>
                {" · "}
                <Link
                  href={hrefDocumental(ruta, filtros, { entidad: undefined })}
                  className="text-azul-claro underline"
                >
                  quitar entidad
                </Link>
                {" · "}
                <Link
                  href={hrefDocumental(`${base}/registros`, filtros, {
                    vista: "entidad",
                    expediente: undefined,
                    categoria: undefined,
                  })}
                  className="text-azul-claro underline"
                >
                  ver en todos los expedientes
                </Link>
              </>
            ) : null}
          </p>
          {puede(rol, "registro.exportar") && total > 0 ? (
            <a
              href={exportar}
              download
              className="rounded-md border border-linea-2 px-3 py-1.5 text-sm text-texto hover:border-oro"
            >
              Exportar CSV
            </a>
          ) : null}
        </div>

        {filtros.vista === "entidad" && !filtros.entidad ? (
          <ElegirEntidad
            arbol={arbol}
            href={(id) => hrefDocumental(`${base}/registros`, filtros, { entidad: id })}
          />
        ) : !registros?.filas.length ? (
          <EstadoVacio
            titulo={
              hayFiltros ? "Nada coincide con los filtros." : "No hay registros aquí todavía."
            }
            descripcion={
              hayFiltros
                ? "Prueba con otro término o quita los filtros."
                : "Ingresa documentos, importa un Excel o captura un registro."
            }
          />
        ) : (
          <Tabla
            filas={registros.filas}
            base={base}
            vista={filtros.vista}
            ordenActual={orden}
            dir={dir}
            ordenable={filtros.vista === "expediente" || filtros.vista === "entidad"}
            hrefOrden={(o, d) => hrefDocumental(ruta, filtros, { orden: o, dir: d })}
            hrefEntidad={(id) =>
              hrefDocumental(`${base}/registros`, filtros, {
                vista: "entidad",
                entidad: id,
                expediente: undefined,
                categoria: undefined,
              })
            }
          />
        )}

        {total > POR_PAGINA_DOCUMENTAL ? (
          <nav
            aria-label="Paginación"
            className="flex flex-wrap items-center justify-end gap-3 text-sm text-tenue"
          >
            {filtros.pagina > 1 ? (
              <Link
                href={hrefDocumental(ruta, filtros, { pagina: filtros.pagina - 1 })}
                className="hover:text-texto"
              >
                ← Anterior
              </Link>
            ) : null}
            <span>
              Página {formatoNumero(Math.min(filtros.pagina, paginas))} de {formatoNumero(paginas)}
            </span>
            {filtros.pagina < paginas ? (
              <Link
                href={hrefDocumental(ruta, filtros, { pagina: filtros.pagina + 1 })}
                className="hover:text-texto"
              >
                Siguiente →
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </div>
  );
}

function Arbol({
  arbol,
  filtros,
  expedienteActual,
  nodo,
}: {
  arbol: NodoExpediente[];
  filtros: FiltrosDocumental;
  expedienteActual: string | undefined;
  nodo: (expediente: string | null, cambios: { entidad?: string; categoria?: string }) => string;
}) {
  const clave = (id: string | null) => id ?? "sin";
  const MAX_ENTIDADES = 40;
  return (
    <nav
      aria-label="Árbol del encargo"
      className="self-start rounded-lg border border-linea bg-panel p-3 text-sm lg:sticky lg:top-4"
    >
      <p className="mb-2 text-[10px] tracking-[2px] text-oro uppercase">
        Expediente → entidad → categoría
      </p>
      {!arbol.length ? (
        <p className="text-xs text-tenue">Sin registros con estos filtros.</p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {arbol.map((x) => {
          const abierto = expedienteActual === clave(x.id);
          const esActual = abierto && !filtros.entidad && !filtros.categoria;
          return (
            <li key={clave(x.id)}>
              <Link
                href={nodo(x.id, {})}
                aria-current={esActual ? "page" : undefined}
                className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-texto hover:bg-panel-2 aria-[current=page]:text-oro"
              >
                <span className={`truncate ${x.id ? "font-mono text-xs" : "italic"}`}>
                  {x.nombre}
                </span>
                <span
                  className="text-xs text-tenue"
                  aria-label={`${formatoNumero(x.registros)} registros`}
                >
                  {formatoNumero(x.registros)}
                </span>
              </Link>
              {abierto ? (
                <ul className="ml-2 border-l border-linea pl-2">
                  {x.entidades.slice(0, MAX_ENTIDADES).map((e) => {
                    const entAbierta = abierto && filtros.entidad === clave(e.id);
                    return (
                      <li key={clave(e.id)}>
                        <Link
                          href={nodo(x.id, { entidad: clave(e.id) })}
                          aria-current={entAbierta && !filtros.categoria ? "page" : undefined}
                          className="flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-xs text-texto hover:bg-panel-2 aria-[current=page]:text-oro"
                        >
                          <span className={`truncate ${e.id ? "" : "italic text-tenue"}`}>
                            {e.nombre}
                          </span>
                          <span className="text-tenue">{formatoNumero(e.registros)}</span>
                        </Link>
                        {entAbierta ? (
                          <ul className="ml-2 border-l border-linea pl-2">
                            {e.categorias.map((c) => (
                              <li key={clave(c.id)}>
                                <Link
                                  href={nodo(x.id, {
                                    entidad: clave(e.id),
                                    categoria: clave(c.id),
                                  })}
                                  aria-current={
                                    entAbierta && filtros.categoria === clave(c.id)
                                      ? "page"
                                      : undefined
                                  }
                                  className="flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-xs text-tenue hover:bg-panel-2 hover:text-texto aria-[current=page]:text-oro"
                                >
                                  <span className="truncate">{c.nombre}</span>
                                  <span>{formatoNumero(c.registros)}</span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                  {x.entidades.length > MAX_ENTIDADES ? (
                    <li className="px-1.5 py-0.5 text-xs text-tenue-2">
                      y {x.entidades.length - MAX_ENTIDADES} entidad(es) más: búscalas arriba.
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ElegirEntidad({ arbol, href }: { arbol: NodoExpediente[]; href: (id: string) => string }) {
  // Un registro pertenece a un solo expediente: el total de la entidad es la suma de sus nodos.
  const totales = new Map<string, { nombre: string; registros: number; expedientes: number }>();
  for (const x of arbol) {
    for (const e of x.entidades) {
      if (!e.id) continue;
      const t = totales.get(e.id) ?? { nombre: e.nombre, registros: 0, expedientes: 0 };
      t.registros += e.registros;
      t.expedientes += 1;
      totales.set(e.id, t);
    }
  }
  const lista = [...totales.entries()].sort((a, b) => b[1].registros - a[1].registros);
  if (!lista.length) return <EstadoVacio titulo="No hay entidades con estos filtros." />;
  return (
    <ul aria-label="Entidades del encargo" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {lista.map(([id, t]) => (
        <li key={id}>
          <Link
            href={href(id)}
            className="flex items-center justify-between gap-3 rounded-lg border border-linea bg-panel px-3 py-2 text-sm hover:border-oro"
          >
            <span className="truncate text-texto">{t.nombre}</span>
            <span className="shrink-0 text-xs text-tenue">
              {formatoNumero(t.registros)} reg. · {formatoNumero(t.expedientes)} exp.
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const COLUMNAS: { clave: string; titulo: string; orden?: OrdenDocumental }[] = [
  { clave: "registro", titulo: "Registro", orden: "resumen" },
  { clave: "expediente", titulo: "Expediente" },
  { clave: "tipo", titulo: "Tipo y categoría", orden: "tipo" },
  { clave: "fecha", titulo: "Fecha", orden: "fecha" },
  { clave: "involucrados", titulo: "Involucrados" },
  { clave: "identificadores", titulo: "Identificadores" },
  { clave: "referencias", titulo: "Referencias" },
  { clave: "montos", titulo: "Montos" },
  { clave: "fuente", titulo: "Fuente y huella" },
  { clave: "estado", titulo: "Validación", orden: "estado" },
  { clave: "calificacion", titulo: "Calificación", orden: "calificacion" },
];

function Tabla({
  filas,
  base,
  vista,
  ordenActual,
  dir,
  ordenable,
  hrefOrden,
  hrefEntidad,
}: {
  filas: FilaDocumental[];
  base: string;
  vista: FiltrosDocumental["vista"];
  ordenActual: OrdenDocumental;
  dir: "asc" | "desc";
  ordenable: boolean;
  hrefOrden: (orden: OrdenDocumental, dir: "asc" | "desc") => string;
  hrefEntidad: (id: string) => string;
}) {
  // Categoría y línea de tiempo agrupan las filas (la base ya las entrega en ese orden).
  const grupo = (f: FilaDocumental) =>
    vista === "categoria"
      ? (f.categoria ?? "Sin categoría")
      : vista === "tiempo"
        ? f.fecha
          ? MESES.format(new Date(`${f.fecha.slice(0, 7)}-01T00:00:00Z`))
          : "Sin fecha"
        : null;
  const grupos: { titulo: string | null; filas: FilaDocumental[] }[] = [];
  for (const f of filas) {
    const t = grupo(f);
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.titulo === t) ultimo.filas.push(f);
    else grupos.push({ titulo: t, filas: [f] });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-linea">
      <table className="w-full text-left text-sm" aria-label="Registros">
        <thead className="bg-panel-2 text-xs tracking-wide text-tenue uppercase">
          <tr>
            {COLUMNAS.map((c) => {
              const activa = ordenable && c.orden === ordenActual;
              return (
                <th
                  key={c.clave}
                  scope="col"
                  aria-sort={activa ? (dir === "asc" ? "ascending" : "descending") : undefined}
                  className="px-3 py-2.5 font-medium whitespace-nowrap"
                >
                  {ordenable && c.orden ? (
                    <Link
                      href={hrefOrden(c.orden, activa && dir === "desc" ? "asc" : "desc")}
                      className="inline-flex items-center gap-1 hover:text-texto"
                    >
                      {c.titulo}
                      <span aria-hidden className={activa ? "text-oro" : "text-tenue-2"}>
                        {activa ? (dir === "asc" ? "▲" : "▼") : "↕"}
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
        {grupos.map((g, i) => (
          <tbody key={`${g.titulo ?? "todos"}-${i}`}>
            {g.titulo ? (
              <tr className="border-t border-linea-2 bg-fondo-2">
                <th
                  scope="rowgroup"
                  colSpan={COLUMNAS.length}
                  className="px-3 py-2 text-xs font-semibold tracking-wide text-oro uppercase"
                >
                  {g.titulo} <span className="font-normal text-tenue">· {g.filas.length}</span>
                </th>
              </tr>
            ) : null}
            {g.filas.map((f) => (
              <Fila key={f.registro_id} f={f} base={base} hrefEntidad={hrefEntidad} />
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function Fila({
  f,
  base,
  hrefEntidad,
}: {
  f: FilaDocumental;
  base: string;
  hrefEntidad: (id: string) => string;
}) {
  const nivel = f.nivel && NIVELES.has(f.nivel) ? (f.nivel as Nivel) : null;
  return (
    <tr className="border-t border-linea align-top hover:bg-panel/60">
      <th scope="row" className="max-w-64 px-3 py-2.5 font-normal">
        <Link
          href={`${base}/registros/${f.registro_id}`}
          className="line-clamp-2 text-azul-claro hover:underline"
        >
          {f.resumen ?? "Registro"}
        </Link>
        <span className="mt-0.5 block font-mono text-[10px] text-tenue-2">
          R-{f.registro_id.slice(0, 8).toUpperCase()} ·{" "}
          {NOMBRE_ORIGEN[f.origen as keyof typeof NOMBRE_ORIGEN] ?? f.origen}
          {f.hoja ? ` · ${f.hoja}${f.fila ? `, fila ${f.fila}` : ""}` : ""}
        </span>
      </th>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {f.expediente_id ? (
          <Link
            href={`${base}/expedientes/${f.expediente_id}`}
            className="font-mono text-xs text-azul-claro hover:underline"
          >
            {f.expediente}
          </Link>
        ) : (
          <span className="text-xs text-tenue italic">Sin expediente</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className="block text-texto">
          {f.tipo ?? (f.hoja ? "Hoja de Excel" : "Sin tipo")}
        </span>
        <span className="block text-xs text-tenue">{f.categoria ?? "Sin categoría"}</span>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-texto">{formatoFecha(f.fecha)}</td>
      <td className="min-w-48 px-3 py-2.5">
        {f.involucrados.length ? (
          <ul className="flex flex-col gap-0.5">
            {f.involucrados.slice(0, 4).map((i) => (
              <li key={`${i.entidad_id}-${i.rol}`} className="text-xs">
                <Link
                  href={hrefEntidad(i.entidad_id)}
                  className="text-texto hover:text-oro hover:underline"
                >
                  {i.nombre}
                </Link>{" "}
                <span className="text-tenue">· {NOMBRE_ROL[i.rol] ?? i.rol.toLowerCase()}</span>
              </li>
            ))}
            {f.involucrados.length > 4 ? (
              <li className="text-xs text-tenue">y {f.involucrados.length - 4} más</li>
            ) : null}
          </ul>
        ) : (
          <span className="text-xs text-tenue">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-texto">
        {f.identificadores.length
          ? f.identificadores.map((x) => (
              <span key={`${x.tipo}-${x.valor}`} className="block">
                <span className="text-tenue">{x.tipo.toUpperCase()}</span> {x.valor}
              </span>
            ))
          : "—"}
      </td>
      <td className="px-3 py-2.5 font-mono text-xs text-texto">
        {f.referencias.length
          ? f.referencias.map((r) => (
              <span key={r} className="block">
                {r}
              </span>
            ))
          : "—"}
      </td>
      <td className="px-3 py-2.5 text-right text-xs whitespace-nowrap text-texto tabular-nums">
        {f.montos.length
          ? f.montos.slice(0, 3).map((m) => (
              <span key={`${m.monto}-${m.moneda}`} className="block">
                {moneda(m.monto, m.moneda)}
              </span>
            ))
          : "—"}
      </td>
      <td className="max-w-56 px-3 py-2.5 text-xs">
        {f.documento_id && f.archivo ? (
          <Link
            href={`${base}/documentos/${f.documento_id}`}
            className="line-clamp-1 text-azul-claro hover:underline"
          >
            {f.archivo}
          </Link>
        ) : (
          <span className="line-clamp-1 text-texto">{f.fuente ?? "—"}</span>
        )}
        {f.sha256 ? (
          <span className="block font-mono text-[10px] text-tenue-2" title={`SHA-256 ${f.sha256}`}>
            SHA-256 {f.sha256.slice(0, 12)}…
          </span>
        ) : f.origen === "captura" ? (
          <span className="block text-[10px] text-tenue-2">Sin soporte documental</span>
        ) : null}
      </td>
      <td className="px-3 py-2.5">
        <Etiqueta
          tono={
            f.estado_validacion === "pendiente"
              ? "oro"
              : f.estado_validacion === "rechazado"
                ? "neutro"
                : "ok"
          }
        >
          {NOMBRE_ESTADO[f.estado_validacion] ?? f.estado_validacion}
        </Etiqueta>
      </td>
      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
        {nivel ? (
          <span className="inline-flex items-center gap-1.5 text-texto">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-full"
              style={{ background: COLOR_NIVEL[nivel] }}
            />
            {NOMBRE_NIVEL[nivel]}
          </span>
        ) : (
          <span className="text-tenue">Sin calificar</span>
        )}
        {f.alertas ? (
          <span className="block text-peligro">{f.alertas} alerta(s) abierta(s)</span>
        ) : null}
      </td>
    </tr>
  );
}
