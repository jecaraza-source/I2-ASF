"use client";

import {
  DISENOS,
  NIVELES,
  NOMBRE_DISENO,
  centrar,
  escribirEstado,
  etiquetaArista,
  filtrar,
  leerEstado,
  posiciones,
  vecindad,
  volverA,
  type AristaVista,
  type Diseno,
  type EstadoVista,
  type GrafoVista,
  type Nivel,
} from "@sigma/red";
import type { Core, ElementDefinition, LayoutOptions, StylesheetJson } from "cytoscape";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { obtenerEvidencia, obtenerFicha } from "@/acciones/vista";
import type { EvidenciaArista, Ficha as DatosFicha } from "@/lib/vista-datos";
import { Ficha, Origenes } from "./ficha";
import { COLOR_NIVEL, FORMA_TIPO, NOMBRE_NIVEL, NOMBRE_TIPO, iconoTipo } from "./presentacion";

const claseControl =
  "rounded-md border border-linea-2 bg-fondo px-2 py-1 text-xs text-texto focus-visible:outline-2 focus-visible:outline-oro";
const claseBoton =
  "rounded-md border border-linea-2 px-2 py-1 text-xs text-texto hover:border-oro aria-pressed:border-oro aria-pressed:text-oro focus-visible:outline-2 focus-visible:outline-oro";

function estilos(tipos: string[]): StylesheetJson {
  return [
    {
      selector: "node",
      style: {
        width: 34,
        height: 34,
        "background-color": "#5a6a8a",
        "background-image": iconoTipo("otro"),
        "background-width": "60%",
        "background-height": "60%",
        "border-width": 1.5,
        "border-color": "#0b1220",
        label: "data(label)",
        color: "#c9d3e3",
        "font-size": 9,
        "text-valign": "bottom",
        "text-margin-y": 4,
        "text-wrap": "ellipsis",
        "text-max-width": "130px",
        "min-zoomed-font-size": 6,
      },
    },
    ...tipos.map((t) => ({
      selector: `node[tipo = "${t}"]`,
      style: { shape: FORMA_TIPO[t] ?? "ellipse", "background-image": iconoTipo(t) },
    })),
    ...NIVELES.map((n) => ({
      selector: `node[nivel = "${n}"]`,
      style: { "background-color": COLOR_NIVEL[n] },
    })),
    {
      selector: "node.foco",
      style: { "border-width": 4, "border-color": "#f2d27a", width: 44, height: 44 },
    },
    { selector: "node:selected", style: { "border-width": 3, "border-color": "#7fb3d8" } },
    {
      selector: "edge",
      style: {
        width: "mapData(fuerza, 1, 10, 1, 7)",
        "line-color": "#4a5a78",
        "curve-style": "bezier",
        label: "data(label)",
        "font-size": 7,
        color: "#8a96ad",
        "text-rotation": "autorotate",
        "text-background-color": "#0b1220",
        "text-background-opacity": 0.8,
        "text-background-padding": "1px",
        "min-zoomed-font-size": 7,
      },
    },
    {
      selector: "edge[clase = 'evento']",
      style: { "line-style": "dashed", "line-color": "#6a7fa8" },
    },
    {
      selector: "edge[?dirigido]",
      style: {
        "target-arrow-shape": "triangle",
        "target-arrow-color": "#6a7fa8",
        "arrow-scale": 0.8,
      },
    },
    {
      selector: "edge.elegida",
      style: { "line-color": "#f2d27a", "target-arrow-color": "#f2d27a", color: "#f2d27a" },
    },
  ];
}

function opcionesDiseno(
  d: Diseno,
  grafo: GrafoVista,
  foco: string | null,
  distancia: Map<string, number> | null,
): LayoutOptions {
  const comun = { animate: false, fit: true, padding: 40 } as const;
  const raiz =
    foco ??
    [...grafo.nodos].sort((a, b) => b.puntaje - a.puntaje || a.nombre.localeCompare(b.nombre))[0]
      ?.id;
  switch (d) {
    case "circular":
      return { ...comun, name: "circle" };
    case "jerarquia":
      return {
        ...comun,
        name: "breadthfirst",
        directed: false,
        roots: raiz ? [raiz] : undefined,
        spacingFactor: 1.1,
      };
    case "abanico":
      return {
        ...comun,
        name: "concentric",
        minNodeSpacing: 24,
        concentric: (n) =>
          distancia ? 10 - (distancia.get(n.id()) ?? 9) : Number(n.data("puntaje") ?? 0),
        levelWidth: () => (distancia ? 1 : 25),
      };
    case "agrupados":
    case "organizacion":
    case "empaquetado": {
      const pos = posiciones(d, grafo.nodos);
      return { ...comun, name: "preset", positions: Object.fromEntries(pos) };
    }
    case "mincruce":
      // cytoscape-dagre: ordena por capas minimizando cruces.
      return {
        ...comun,
        name: "dagre",
        rankDir: "LR",
        nodeSep: 24,
        rankSep: 90,
      } as unknown as LayoutOptions;
    case "fuerza":
    default:
      return {
        ...comun,
        name: "cose",
        randomize: false,
        nodeRepulsion: () => 9000,
        idealEdgeLength: () => 90,
        numIter: grafo.nodos.length > 150 ? 400 : 1000,
      };
  }
}

function elementos(grafo: GrafoVista, foco: string | null): ElementDefinition[] {
  return [
    ...grafo.nodos.map((n) => ({
      group: "nodes" as const,
      data: { id: n.id, label: n.nombre, tipo: n.tipo, nivel: n.nivel, puntaje: n.puntaje },
      classes: n.id === foco ? "foco" : undefined,
    })),
    ...grafo.aristas.map((a) => ({
      group: "edges" as const,
      data: {
        id: a.id,
        source: a.origen,
        target: a.destino,
        label: etiquetaArista(a),
        fuerza: a.fuerza,
        clase: a.clase,
        dirigido: a.clase === "evento" && a.tipo === "transferencia",
      },
    })),
  ];
}

export function VisorRed({ encargoId, grafo }: { encargoId: string; grafo: GrafoVista }) {
  const sp = useSearchParams();
  const estado = useMemo(() => leerEstado(new URLSearchParams(sp.toString())), [sp]);
  const estadoRef = useRef(estado);
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

  const navegar = useCallback((e: EstadoVista, reemplazar = false) => {
    const q = escribirEstado(e);
    const url = q ? `?${q}` : window.location.pathname;
    if (reemplazar) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }, []);

  const tipos = useMemo(() => [...new Set(grafo.nodos.map((n) => n.tipo))].sort(), [grafo]);
  const nombre = useMemo(() => new Map(grafo.nodos.map((n) => [n.id, n.nombre])), [grafo]);
  const aristaPorId = useMemo(() => new Map(grafo.aristas.map((a) => [a.id, a])), [grafo]);

  const { visible, distancia } = useMemo(() => {
    const f = filtrar(grafo, estado);
    if (!estado.foco) return { visible: f, distancia: null };
    const v = vecindad(f, estado.foco, estado.saltos);
    return { visible: { nodos: v.nodos, aristas: v.aristas }, distancia: v.distancia };
  }, [grafo, estado]);

  // --- Cytoscape -----------------------------------------------------------------------------
  const contenedor = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [listo, setListo] = useState(false);
  const [arista, setArista] = useState<AristaVista | null>(null);
  const aristaRef = useRef<(a: AristaVista | null) => void>(setArista);

  useEffect(() => {
    let vivo = true;
    let cy: Core | null = null;
    void (async () => {
      const [{ default: cytoscape }, { default: dagre }] = await Promise.all([
        import("cytoscape"),
        import("cytoscape-dagre"),
      ]);
      if (!vivo || !contenedor.current) return;
      cytoscape.use(dagre);
      cy = cytoscape({
        container: contenedor.current,
        style: estilos(tipos),
        minZoom: 0.1,
        maxZoom: 4,
        wheelSensitivity: 0.3,
        textureOnViewport: true,
        hideEdgesOnViewport: grafo.aristas.length > 400,
        boxSelectionEnabled: false,
      });
      cy.on("tap", "node", (ev) => navegar(centrar(estadoRef.current, ev.target.id())));
      cy.on("tap", "edge", (ev) => aristaRef.current(aristaPorId.get(ev.target.id()) ?? null));
      cy.on("tap", (ev) => {
        if (ev.target === cy) aristaRef.current(null);
      });
      cyRef.current = cy;
      setListo(true);
    })();
    return () => {
      vivo = false;
      cy?.destroy();
      cyRef.current = null;
    };
  }, [tipos, grafo, aristaPorId, navegar]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !listo) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elementos(visible, estado.foco));
    });
    cy.layout(opcionesDiseno(estado.diseno, visible, estado.foco, distancia)).run();
  }, [listo, visible, estado.foco, estado.diseno, distancia]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !listo) return;
    cy.edges().removeClass("elegida");
    if (arista) cy.getElementById(arista.id).addClass("elegida");
  }, [arista, listo, visible]);

  // --- Panel lateral: ficha del foco o evidencia de la arista ---------------------------------
  const [ficha, setFicha] = useState<DatosFicha | null>(null);
  const [evidenciaDe, setEvidenciaDe] = useState<{
    id: string;
    datos: EvidenciaArista | null;
  } | null>(null);
  const [cargando, iniciar] = useTransition();

  useEffect(() => {
    if (!estado.foco) return;
    const entidadId = estado.foco;
    iniciar(async () => {
      setFicha(await obtenerFicha({ encargoId, entidadId }));
    });
  }, [estado.foco, encargoId]);

  useEffect(() => {
    if (!arista) return;
    iniciar(async () => {
      const datos = await obtenerEvidencia({
        encargoId,
        clase: arista.clase,
        objetos: arista.objetos,
      });
      setEvidenciaDe({ id: arista.id, datos });
    });
  }, [arista, encargoId]);

  // --- Controles -------------------------------------------------------------------------------
  const [busqueda, setBusqueda] = useState("");
  const [sinCoincidencia, setSinCoincidencia] = useState(false);
  const buscar = () => {
    const q = busqueda.trim().toUpperCase();
    if (!q) return;
    const n =
      grafo.nodos.find((x) => x.nombre.toUpperCase() === q) ??
      grafo.nodos.find((x) => x.nombre.toUpperCase().includes(q));
    setSinCoincidencia(!n);
    if (n) {
      setArista(null);
      navegar(centrar(estado, n.id));
    }
  };
  const alternar = <T extends string>(lista: T[], v: T) =>
    lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v];
  const zoom = (factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({
      level: cy.zoom() * factor,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  };
  const ajustar = () => cyRef.current?.fit(undefined, 40);
  const evidencia = arista && evidenciaDe?.id === arista.id ? evidenciaDe.datos : null;
  const focoFiltrado = estado.foco && !visible.nodos.some((n) => n.id === estado.foco);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <nav aria-label="Ruta" className="flex flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => navegar(volverA(estado, null))}
            aria-current={estado.foco ? undefined : "page"}
            className={estado.foco ? "text-azul-claro hover:underline" : "text-oro"}
          >
            Vista general
          </button>
          {estado.ruta.map((id, i) => (
            <span key={`${id}-${i}`} className="flex items-center gap-1">
              <span className="text-tenue-2" aria-hidden>
                ›
              </span>
              <button
                type="button"
                onClick={() => navegar(volverA(estado, i))}
                aria-current={i === estado.ruta.length - 1 ? "page" : undefined}
                className={
                  i === estado.ruta.length - 1 ? "text-oro" : "text-azul-claro hover:underline"
                }
              >
                {nombre.get(id) ?? "Entidad"}
              </button>
            </span>
          ))}
        </nav>

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-linea bg-panel p-3">
          <form
            className="flex items-end gap-1.5"
            onSubmit={(ev) => {
              ev.preventDefault();
              buscar();
            }}
          >
            <label className="flex flex-col gap-1 text-xs text-tenue">
              Buscar entidad
              <input
                list="entidades-red"
                value={busqueda}
                onChange={(ev) => {
                  setBusqueda(ev.target.value);
                  setSinCoincidencia(false);
                }}
                className={`${claseControl} w-56`}
              />
            </label>
            {sinCoincidencia ? (
              <span role="status" className="self-center text-xs text-oro">
                Sin coincidencias
              </span>
            ) : null}
            <datalist id="entidades-red">
              {grafo.nodos.map((n) => (
                <option key={n.id} value={n.nombre} />
              ))}
            </datalist>
            <button type="submit" className={claseBoton}>
              Centrar
            </button>
          </form>

          <label className="flex flex-col gap-1 text-xs text-tenue">
            Diseño
            <select
              value={estado.diseno}
              onChange={(ev) => navegar({ ...estado, diseno: ev.target.value as Diseno }, true)}
              className={claseControl}
            >
              {DISENOS.map((d) => (
                <option key={d} value={d}>
                  {NOMBRE_DISENO[d]}
                </option>
              ))}
            </select>
          </label>

          {estado.foco ? (
            <div role="group" aria-label="Saltos" className="flex gap-1">
              {([1, 2] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={estado.saltos === s}
                  onClick={() => navegar({ ...estado, saltos: s })}
                  className={claseBoton}
                >
                  {s === 1 ? "1 salto" : "2 saltos"}
                </button>
              ))}
            </div>
          ) : null}

          <div role="group" aria-label="Zoom" className="flex gap-1">
            <button
              type="button"
              onClick={() => zoom(1.25)}
              className={claseBoton}
              aria-label="Acercar"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => zoom(0.8)}
              className={claseBoton}
              aria-label="Alejar"
            >
              −
            </button>
            <button type="button" onClick={ajustar} className={claseBoton}>
              Ajustar
            </button>
          </div>
        </div>

        <details className="rounded-lg border border-linea bg-panel p-3 text-xs">
          <summary className="cursor-pointer text-texto">
            Filtros
            {estado.tipos.length +
            estado.niveles.length +
            (estado.desde ? 1 : 0) +
            (estado.hasta ? 1 : 0)
              ? " (activos)"
              : ""}
          </summary>
          <div className="mt-3 flex flex-wrap gap-6">
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-tenue">Tipo</legend>
              {tipos.map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-texto">
                  <input
                    type="checkbox"
                    checked={!estado.tipos.length || estado.tipos.includes(t)}
                    onChange={() => {
                      const base = estado.tipos.length ? estado.tipos : tipos;
                      const nuevos = alternar(base, t);
                      navegar(
                        { ...estado, tipos: nuevos.length === tipos.length ? [] : nuevos },
                        true,
                      );
                    }}
                  />
                  {NOMBRE_TIPO[t] ?? t}
                </label>
              ))}
            </fieldset>
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-tenue">Nivel</legend>
              {NIVELES.map((n) => (
                <label key={n} className="flex items-center gap-1.5 text-texto">
                  <input
                    type="checkbox"
                    checked={!estado.niveles.length || estado.niveles.includes(n)}
                    onChange={() => {
                      const base: Nivel[] = estado.niveles.length ? estado.niveles : NIVELES;
                      const nuevos = alternar(base, n);
                      navegar(
                        { ...estado, niveles: nuevos.length === NIVELES.length ? [] : nuevos },
                        true,
                      );
                    }}
                  />
                  <span
                    className="inline-block size-2.5 rounded-full"
                    style={{ background: COLOR_NIVEL[n] }}
                    aria-hidden
                  />
                  {NOMBRE_NIVEL[n]}
                </label>
              ))}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-tenue">Fecha de vínculos y eventos</legend>
              <label className="flex items-center gap-2 text-texto">
                Desde
                <input
                  type="date"
                  value={estado.desde ?? ""}
                  onChange={(ev) => navegar({ ...estado, desde: ev.target.value || null }, true)}
                  className={claseControl}
                />
              </label>
              <label className="flex items-center gap-2 text-texto">
                Hasta
                <input
                  type="date"
                  value={estado.hasta ?? ""}
                  onChange={(ev) => navegar({ ...estado, hasta: ev.target.value || null }, true)}
                  className={claseControl}
                />
              </label>
            </fieldset>
          </div>
        </details>

        <p className="text-xs text-tenue" data-testid="resumen-vista" aria-live="polite">
          {visible.nodos.length} entidades · {visible.aristas.length} líneas visibles
          {estado.foco ? ` · ${estado.saltos === 1 ? "1 salto" : "2 saltos"} desde el centro` : ""}
        </p>
        {focoFiltrado ? (
          <p role="status" className="text-xs text-oro">
            Los filtros ocultan la entidad central.
          </p>
        ) : null}
        <div
          ref={contenedor}
          role="img"
          aria-label="Red de vínculos"
          className="h-[640px] w-full rounded-lg border border-linea bg-[#0b1220]"
        />
        <Leyenda tipos={tipos} />
      </div>

      <aside className="flex flex-col gap-4" aria-label="Detalle">
        {arista ? (
          <section
            className="rounded-lg border border-linea bg-panel p-4"
            aria-label="Evidencia del vínculo"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-texto">
                {nombre.get(arista.origen)} — {nombre.get(arista.destino)}
              </h2>
              <button
                type="button"
                onClick={() => setArista(null)}
                className="text-xs text-tenue hover:text-texto"
              >
                Cerrar
              </button>
            </div>
            <p className="mb-3 text-xs text-tenue">{etiquetaArista(arista)}</p>
            {!evidencia ? (
              <p className="text-xs text-tenue">
                {cargando ? "Cargando evidencia…" : "Sin evidencia."}
              </p>
            ) : (
              <ul className="flex max-h-[520px] flex-col gap-2 overflow-y-auto text-xs">
                {evidencia.objetos.map((o) => (
                  <li key={o.id} className="flex flex-col gap-0.5 border-t border-linea pt-2">
                    <span className="text-texto">
                      {o.fecha ? `${o.fecha.split("-").reverse().join("/")} · ` : ""}
                      {o.descripcion}
                    </span>
                    <Origenes origenes={o.origenes} encargoId={encargoId} />
                  </li>
                ))}
                {evidencia.total > evidencia.objetos.length ? (
                  <li className="text-tenue-2">
                    Se muestran {evidencia.objetos.length} de {evidencia.total}.
                  </li>
                ) : null}
              </ul>
            )}
          </section>
        ) : null}

        {estado.foco ? (
          <section className="rounded-lg border border-linea bg-panel p-4" aria-label="Ficha">
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-texto">
                {nombre.get(estado.foco) ?? ficha?.entidad.nombre}
              </h2>
              <Link
                href={`/encargos/${encargoId}/entidades/${estado.foco}`}
                className="shrink-0 text-xs text-azul-claro hover:underline"
              >
                Abrir ficha completa
              </Link>
            </div>
            {ficha && ficha.entidad.id === estado.foco ? (
              <Ficha
                ficha={ficha}
                encargoId={encargoId}
                compacta
                onCentrar={(id) => {
                  setArista(null);
                  navegar(centrar(estadoRef.current, id));
                }}
              />
            ) : (
              <p className="text-xs text-tenue">{cargando ? "Cargando ficha…" : "Sin datos."}</p>
            )}
          </section>
        ) : !arista ? (
          <section className="rounded-lg border border-linea bg-panel p-4 text-xs text-tenue">
            Elige una entidad (clic o búsqueda) para centrarla y ver su ficha; clic en una línea
            muestra su evidencia.
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function Leyenda({ tipos }: { tipos: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-tenue" aria-label="Leyenda">
      {NIVELES.map((n) => (
        <span key={n} className="flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ background: COLOR_NIVEL[n] }}
            aria-hidden
          />
          {NOMBRE_NIVEL[n]}
        </span>
      ))}
      <span className="text-tenue-2">·</span>
      {tipos.map((t) => (
        <span key={t} className="flex items-center gap-1">
          {/* El ícono es un SVG propio (data URI), no contenido del auditado. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconoTipo(t)} alt="" className="size-4 rounded bg-[#5a6a8a] p-0.5" />
          {NOMBRE_TIPO[t] ?? t}
        </span>
      ))}
      <span className="text-tenue-2">· línea punteada = eventos agrupados · grosor = fuerza</span>
    </div>
  );
}
