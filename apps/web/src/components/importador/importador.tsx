"use client";

import { useRef, useState, useTransition } from "react";
import { analizarExcel, confirmarImportacion, type Analisis } from "@/acciones/importaciones";
import { EditorMapeo } from "./editor-mapeo";

const ESTADOS: Record<string, string> = {
  procesada: "Procesada",
  cifras: "Cifras declaradas",
  no_mapeada: "No se procesa",
  error: "Error",
};

const claseControl =
  "w-full rounded-md border border-linea-2 bg-fondo-2 px-3 py-2 text-sm text-texto focus:border-oro focus:outline-none";

/**
 * Flujo de importación: subir → plantilla detectada o mapeo → vista previa → confirmar.
 * El archivo se vuelve a enviar al confirmar: el servidor lo lee, recalcula el
 * hash y carga todo en una transacción.
 */
export function Importador({
  encargoId,
  expedientes,
  puedeGuardarPlantilla,
}: {
  encargoId: string;
  expedientes: { id: string; identificador: string }[];
  puedeGuardarPlantilla: boolean;
}) {
  const formulario = useRef<HTMLFormElement>(null);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [plantillaJson, setPlantillaJson] = useState<string>("");
  const [mapeoManual, setMapeoManual] = useState(false);
  const [nombrePlantilla, setNombrePlantilla] = useState("");
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const datos = (extra: Record<string, string> = {}) => {
    const fd = new FormData(formulario.current ?? undefined);
    fd.set("encargo_id", encargoId);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return fd;
  };

  const analizar = (json = "") =>
    iniciar(async () => {
      setMensaje(null);
      const r = await analizarExcel(datos({ plantilla_json: json }));
      if (!r.ok || !r.analisis) {
        setAnalisis(null);
        setMensaje({ texto: r.mensaje ?? "No se pudo analizar el archivo.", error: true });
        return;
      }
      setAnalisis(r.analisis);
      setPlantillaJson(r.analisis.plantilla?.json ?? "");
      setMapeoManual(!r.analisis.plantilla);
      if (r.mensaje) setMensaje({ texto: r.mensaje, error: false });
    });

  const confirmar = () =>
    iniciar(async () => {
      setMensaje(null);
      const usarJson = analisis?.plantilla && !analisis.plantilla.detectada ? plantillaJson : "";
      const r = await confirmarImportacion(
        datos({ plantilla_json: usarJson, guardar_plantilla: usarJson ? nombrePlantilla : "" }),
      );
      // Si todo sale bien, la acción redirige; aquí solo llegan errores.
      if (r?.mensaje) setMensaje({ texto: r.mensaje, error: true });
    });

  const reiniciar = () => {
    setAnalisis(null);
    setPlantillaJson("");
    setMapeoManual(false);
    setNombrePlantilla("");
    setMensaje(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <form
        ref={formulario}
        onSubmit={(e) => {
          e.preventDefault();
          analizar();
        }}
        className="flex max-w-xl flex-col gap-4 rounded-lg border border-linea bg-panel p-5"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="archivo" className="text-sm text-texto">
            Archivo de Excel (.xlsx) <span className="text-oro">*</span>
          </label>
          <input
            id="archivo"
            name="archivo"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            onChange={reiniciar}
            className="text-sm text-texto file:mr-3 file:rounded-md file:border file:border-linea-2 file:bg-fondo-2 file:px-3 file:py-1.5 file:text-texto"
          />
          <p className="text-xs text-tenue">
            Hasta 4 MB. El original se guarda sin cambios y con su SHA-256.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="expediente_id" className="text-sm text-texto">
            Expediente
          </label>
          <select id="expediente_id" name="expediente_id" className={claseControl} defaultValue="">
            <option value="">Sin expediente</option>
            {expedientes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.identificador}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fuente" className="text-sm text-texto">
            Fuente
          </label>
          <input
            id="fuente"
            name="fuente"
            type="text"
            maxLength={200}
            placeholder="Por ejemplo: entrega de la ASF, oficio 123/2024"
            className={claseControl}
          />
        </div>
        <div>
          <button
            type="submit"
            disabled={pendiente}
            className="rounded-md bg-oro px-4 py-2 text-sm font-medium text-fondo hover:bg-oro-suave disabled:opacity-60"
          >
            {pendiente && !analisis ? "Analizando…" : "Analizar"}
          </button>
        </div>
      </form>

      {mensaje ? (
        <p
          role={mensaje.error ? "alert" : "status"}
          className={`max-w-xl rounded-md border px-3 py-2 text-sm ${
            mensaje.error ? "border-peligro/60 text-peligro" : "border-linea-2 text-tenue"
          }`}
        >
          {mensaje.texto}
        </p>
      ) : null}

      {analisis ? (
        <section aria-label="Vista previa" className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-tenue">
              {analisis.archivo.nombre} · {(analisis.archivo.tamano / 1024).toFixed(0)} KB ·{" "}
              <span className="font-mono text-xs" title="SHA-256">
                {analisis.archivo.sha256.slice(0, 16)}…
              </span>
            </span>
            {analisis.plantilla ? (
              <span
                className="rounded border border-oro-tenue px-2 py-0.5 text-oro"
                data-testid="plantilla"
              >
                {analisis.plantilla.detectada ? "Plantilla detectada" : "Mapeo manual"}:{" "}
                {analisis.plantilla.nombre}
              </span>
            ) : null}
            {analisis.plantilla && !mapeoManual ? (
              <button
                type="button"
                onClick={() => setMapeoManual(true)}
                className="text-xs text-azul-claro underline"
              >
                Ajustar mapeo
              </button>
            ) : null}
          </div>

          {analisis.duplicado ? (
            <p
              role="alert"
              className="max-w-xl rounded-md border border-peligro/60 px-3 py-2 text-sm text-peligro"
            >
              Este archivo ya se importó en este encargo (mismo SHA-256).
            </p>
          ) : null}

          {mapeoManual ? (
            <EditorMapeo
              muestra={analisis.muestra}
              nombreArchivo={analisis.archivo.nombre}
              onAplicar={(json) => analizar(json)}
            />
          ) : null}

          {analisis.conteo ? (
            <>
              <dl
                className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7"
                aria-label="Conteos"
              >
                {(
                  [
                    ["Contratos", analisis.conteo.contratos],
                    ["Movimientos", analisis.conteo.transferencias],
                    ["Llamadas", analisis.conteo.llamadas],
                    ["Vínculos", analisis.conteo.vinculos],
                    ["Entidades", analisis.conteo.entidades],
                    ["Cifras declaradas", analisis.conteo.cifras],
                    ["Registros", analisis.conteo.registros],
                  ] as const
                ).map(([t, n]) => (
                  <div key={t} className="rounded-lg border border-linea bg-panel px-4 py-3">
                    <dt className="text-xs text-tenue">{t}</dt>
                    <dd className="text-2xl font-semibold text-texto">{n}</dd>
                  </div>
                ))}
              </dl>

              <div className="overflow-x-auto rounded-lg border border-linea">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Hojas del archivo</caption>
                  <thead className="bg-panel-2 text-xs tracking-wide text-tenue uppercase">
                    <tr>
                      <th scope="col" className="px-4 py-2">
                        Hoja
                      </th>
                      <th scope="col" className="px-4 py-2">
                        Estado
                      </th>
                      <th scope="col" className="px-4 py-2">
                        Filas válidas
                      </th>
                      <th scope="col" className="px-4 py-2">
                        Filas excluidas
                      </th>
                      <th scope="col" className="px-4 py-2">
                        Cifras
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analisis.hojas.map((h) => (
                      <tr key={h.hoja} className="border-t border-linea align-top">
                        <td className="px-4 py-2 text-texto">{h.hoja}</td>
                        <td
                          className={`px-4 py-2 ${h.estado === "error" ? "text-peligro" : "text-tenue"}`}
                        >
                          {ESTADOS[h.estado] ?? h.estado}
                          {h.error ? <span className="block text-xs">{h.error}</span> : null}
                        </td>
                        <td className="px-4 py-2 text-texto">{h.filas_validas}</td>
                        <td className="px-4 py-2 text-tenue">
                          {h.excluidas.length === 0
                            ? "—"
                            : h.excluidas.map((x) => (
                                <span key={x.fila} className="block text-xs">
                                  Fila {x.fila}: {x.motivo}
                                </span>
                              ))}
                        </td>
                        <td className="px-4 py-2 text-texto">{h.cifras}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {puedeGuardarPlantilla && analisis.plantilla && !analisis.plantilla.detectada ? (
                <div className="flex max-w-xl flex-col gap-1.5">
                  <label htmlFor="guardar_plantilla" className="text-sm text-texto">
                    Guardar este mapeo como plantilla (opcional)
                  </label>
                  <input
                    id="guardar_plantilla"
                    type="text"
                    maxLength={100}
                    value={nombrePlantilla}
                    onChange={(e) => setNombrePlantilla(e.target.value)}
                    placeholder="Nombre de la plantilla"
                    className={claseControl}
                  />
                </div>
              ) : null}

              <div>
                <button
                  type="button"
                  onClick={confirmar}
                  disabled={pendiente || analisis.duplicado}
                  className="rounded-md bg-oro px-4 py-2 text-sm font-medium text-fondo hover:bg-oro-suave disabled:opacity-60"
                >
                  {pendiente ? "Importando…" : "Confirmar importación"}
                </button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
