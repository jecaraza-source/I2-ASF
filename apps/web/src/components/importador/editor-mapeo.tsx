"use client";

import type { ClaseHoja, PlantillaEntrada } from "@sigma/importador";
import { useState } from "react";
import type { MuestraHoja } from "@/acciones/importaciones";
import { CAMPOS, CLASES } from "./campos";

type EstadoHoja = {
  clase: ClaseHoja | "ignorar";
  filaEncabezado: number;
  extremosPorId: boolean;
  columnas: Record<string, string>;
};

const claseControl =
  "rounded-md border border-linea-2 bg-fondo-2 px-2 py-1.5 text-sm text-texto focus:border-oro focus:outline-none";

/**
 * Pantalla de mapeo de columnas: el auditor declara qué produce cada hoja y qué
 * columna alimenta cada dato. Genera una plantilla que el servidor valida.
 */
export function EditorMapeo({
  muestra,
  nombreArchivo,
  onAplicar,
}: {
  muestra: MuestraHoja[];
  nombreArchivo: string;
  onAplicar: (plantillaJson: string) => void;
}) {
  const [hojas, setHojas] = useState<Record<string, EstadoHoja>>(() =>
    Object.fromEntries(
      muestra.map((h) => [
        h.hoja,
        { clase: "ignorar", filaEncabezado: 1, extremosPorId: false, columnas: {} },
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);

  const actualizar = (hoja: string, cambio: Partial<EstadoHoja>) =>
    setHojas((h) => ({ ...h, [hoja]: { ...(h[hoja] as EstadoHoja), ...cambio } }));

  const aplicar = () => {
    const r = construirPlantilla(muestra, hojas, nombreArchivo);
    if (typeof r === "string") {
      setError(r);
      return;
    }
    setError(null);
    onAplicar(JSON.stringify(r));
  };

  return (
    <div className="flex flex-col gap-5">
      {muestra.map((m) => {
        const estado = hojas[m.hoja] as EstadoHoja;
        const encabezados = (m.filas[estado.filaEncabezado - 1] ?? []).filter(
          (c) => c.trim() !== "",
        );
        const idHoja = `hoja-${m.hoja.replace(/\W+/g, "-")}`;
        return (
          <fieldset key={m.hoja} className="rounded-lg border border-linea bg-panel p-4">
            <legend className="px-1 text-sm font-semibold text-texto">{m.hoja}</legend>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-xs text-tenue" htmlFor={`${idHoja}-clase`}>
                Qué contiene
                <select
                  id={`${idHoja}-clase`}
                  value={estado.clase}
                  onChange={(e) =>
                    actualizar(m.hoja, {
                      clase: e.target.value as EstadoHoja["clase"],
                      columnas: {},
                    })
                  }
                  className={claseControl}
                >
                  {CLASES.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.texto}
                    </option>
                  ))}
                </select>
              </label>
              {estado.clase !== "ignorar" && estado.clase !== "cifras" ? (
                <label
                  className="flex flex-col gap-1 text-xs text-tenue"
                  htmlFor={`${idHoja}-fila`}
                >
                  Fila de encabezados
                  <input
                    id={`${idHoja}-fila`}
                    type="number"
                    min={1}
                    max={Math.max(1, m.filas.length)}
                    value={estado.filaEncabezado}
                    onChange={(e) =>
                      actualizar(m.hoja, {
                        filaEncabezado: Math.max(1, Number(e.target.value) || 1),
                        columnas: {},
                      })
                    }
                    className={`${claseControl} w-24`}
                  />
                </label>
              ) : null}
              {estado.clase === "vinculos" ? (
                <label className="flex items-center gap-2 text-xs text-tenue">
                  <input
                    type="checkbox"
                    checked={estado.extremosPorId}
                    onChange={(e) => actualizar(m.hoja, { extremosPorId: e.target.checked })}
                  />
                  Las entidades vienen como ID del archivo
                </label>
              ) : null}
            </div>

            {estado.clase !== "ignorar" && estado.clase !== "cifras" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {CAMPOS[estado.clase].map((campo) => (
                  <label key={campo.clave} className="flex flex-col gap-1 text-xs text-tenue">
                    <span>
                      {campo.etiqueta}
                      {campo.requerido ? <span className="text-oro"> *</span> : null}
                    </span>
                    <select
                      value={estado.columnas[campo.clave] ?? ""}
                      onChange={(e) =>
                        actualizar(m.hoja, {
                          columnas: { ...estado.columnas, [campo.clave]: e.target.value },
                        })
                      }
                      className={claseControl}
                    >
                      <option value="">—</option>
                      {encabezados.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : null}

            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-tenue hover:text-texto">
                Ver primeras filas
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="text-xs text-tenue">
                  <tbody>
                    {m.filas.map((f, i) => (
                      <tr
                        key={i}
                        className={i + 1 === estado.filaEncabezado ? "text-oro" : undefined}
                      >
                        <th scope="row" className="pr-2 text-right font-normal text-tenue-2">
                          {i + 1}
                        </th>
                        {f.map((c, j) => (
                          <td
                            key={j}
                            className="max-w-48 truncate border-l border-linea px-2 py-0.5"
                          >
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </fieldset>
        );
      })}
      {error ? (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      ) : null}
      <div>
        <button
          type="button"
          onClick={aplicar}
          className="rounded-md border border-oro px-4 py-2 text-sm text-oro hover:bg-oro hover:text-fondo"
        >
          Aplicar mapeo
        </button>
      </div>
    </div>
  );
}

function construirPlantilla(
  muestra: MuestraHoja[],
  hojas: Record<string, EstadoHoja>,
  nombreArchivo: string,
): PlantillaEntrada | string {
  const mapeo: PlantillaEntrada["mapeo"]["hojas"] = [];
  const firma: PlantillaEntrada["firma_hojas"] = [];
  for (const m of muestra) {
    const e = hojas[m.hoja];
    if (!e || e.clase === "ignorar") continue;
    if (e.clase === "cifras") {
      mapeo.push({ hoja: m.hoja, clase: "cifras" });
      firma.push({ hoja: m.hoja, encabezados: [] });
      continue;
    }
    const faltan = CAMPOS[e.clase]
      .filter((c) => c.requerido && !e.columnas[c.clave])
      .map((c) => c.etiqueta);
    if (faltan.length) return `En «${m.hoja}» falta elegir: ${faltan.join(", ")}.`;
    const col = (k: string) => e.columnas[k] || undefined;
    const usadas = [...new Set(Object.values(e.columnas).filter(Boolean))];
    firma.push({ hoja: m.hoja, encabezados: usadas.slice(0, 6) });
    const base = { hoja: m.hoja, fila_encabezado: e.filaEncabezado };
    switch (e.clase) {
      case "contratos":
        mapeo.push({
          ...base,
          clase: "contratos",
          moneda: "MXN",
          columnas: {
            identificador: col("identificador") ?? "",
            proveedor: col("proveedor") ?? "",
            numero: col("numero"),
            rfc: col("rfc"),
            dependencia: col("dependencia"),
            fecha: col("fecha"),
            monto_original: col("monto_original"),
            monto_pagado: col("monto_pagado"),
          },
        });
        break;
      case "transferencias": {
        const montos = [{ columna: col("monto_mxn") ?? "", moneda: "MXN" }];
        if (col("monto_usd")) montos.push({ columna: col("monto_usd") ?? "", moneda: "USD" });
        mapeo.push({
          ...base,
          clase: "transferencias",
          columnas: {
            identificador: col("identificador"),
            fecha: col("fecha") ?? "",
            origen: col("origen") ?? "",
            origen_id: col("origen_id"),
            destino: col("destino") ?? "",
            destino_id: col("destino_id"),
            cuenta_origen: col("cuenta_origen"),
            cuenta_destino: col("cuenta_destino"),
            tipo: col("tipo"),
            etapa: col("etapa"),
          },
          montos,
        });
        break;
      }
      case "vinculos":
        mapeo.push({
          ...base,
          clase: "vinculos",
          extremos_por_id: e.extremosPorId,
          columnas: {
            origen: col("origen") ?? "",
            destino: col("destino") ?? "",
            tipo_origen: col("tipo_origen"),
            tipo_destino: col("tipo_destino"),
            tipo_vinculo: col("tipo_vinculo"),
            fuerza: col("fuerza"),
            fecha: col("fecha"),
          },
        });
        break;
      case "llamadas":
        mapeo.push({
          ...base,
          clase: "llamadas",
          columnas: {
            numero_origen: col("numero_origen") ?? "",
            numero_destino: col("numero_destino") ?? "",
            fecha: col("fecha") ?? "",
            hora: col("hora"),
            duracion: col("duracion"),
            tipo: col("tipo"),
            nombre_origen: col("nombre_origen"),
            nombre_destino: col("nombre_destino"),
          },
        });
        break;
      case "entidades":
        mapeo.push({
          ...base,
          clase: "entidades",
          columnas: {
            nombre: col("nombre") ?? "",
            id: col("id"),
            tipo: col("tipo"),
            id_fiscal: col("id_fiscal"),
            riesgo: col("riesgo"),
          },
        });
        break;
    }
  }
  if (!mapeo.length) return "Elige qué contiene al menos una hoja.";
  return {
    nombre: `Mapeo de ${nombreArchivo}`.slice(0, 100),
    firma_hojas: firma,
    mapeo: { hojas: mapeo },
  };
}
