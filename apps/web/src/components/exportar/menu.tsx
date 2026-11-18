const OPCIONES = [
  { archivo: "reporte.pdf", texto: "Reporte PDF" },
  { archivo: "entidades.csv", texto: "Entidades (CSV para i2)" },
  { archivo: "vinculos.csv", texto: "Vínculos (CSV para i2)" },
  { archivo: "eventos.csv", texto: "Eventos (CSV para i2)" },
  { archivo: "especificacion-i2.txt", texto: "Especificación de importación para i2" },
  { archivo: "red.graphml", texto: "GraphML (Gephi, yEd, Cytoscape)" },
] as const;

/**
 * Menú de exportaciones de la red más reciente. Son descargas directas (no navegación): cada una
 * pasa por el route handler, que escribe la bitácora antes de entregar el archivo.
 */
export function MenuExportar({
  encargoId,
  expedienteId,
  nota,
}: {
  encargoId: string;
  expedienteId?: string;
  nota: string;
}) {
  const consulta = expedienteId ? `?expediente=${expedienteId}` : "";
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-linea-2 px-3.5 py-2 text-sm text-texto hover:border-oro [&::-webkit-details-marker]:hidden">
        Exportar ▾
      </summary>
      <div
        role="group"
        aria-label="Exportaciones"
        className="absolute right-0 z-30 mt-1 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-0.5 rounded-md border border-linea-2 bg-panel p-2 shadow-lg"
      >
        <p className="px-2 pb-1 text-xs text-tenue">{nota}</p>
        {OPCIONES.map((o) => (
          <a
            key={o.archivo}
            href={`/encargos/${encargoId}/red/exportar/${o.archivo}${consulta}`}
            download
            className="rounded px-2 py-1.5 text-sm text-texto hover:bg-panel-2 hover:text-oro"
          >
            {o.texto}
          </a>
        ))}
        <p className="px-2 pt-1 text-[11px] text-tenue-2">
          Cada exportación queda en bitácora con su folio y SHA-256.
        </p>
      </div>
    </details>
  );
}
