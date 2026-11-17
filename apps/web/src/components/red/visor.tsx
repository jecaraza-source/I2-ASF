"use client";

import {
  DISENOS,
  FAMILIAS_ARISTA,
  NIVELES,
  NOMBRE_FAMILIA,
  NOMBRE_DISENO,
  centrar,
  escribirEstado,
  etiquetaArista,
  familiaArista,
  filtrar,
  leerEstado,
  posiciones,
  vecindad,
  volverA,
  type AristaVista,
  type Diseno,
  type EstadoVista,
  type FamiliaArista,
  type GrafoVista,
  type Nivel,
} from "@sigma/red";
import type { Core, ElementDefinition, LayoutOptions, StylesheetJson } from "cytoscape";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { obtenerEvidencia, obtenerFicha } from "@/acciones/vista";
import { abrirCalendario } from "@/lib/calendario";
import type { EvidenciaArista, Ficha as DatosFicha } from "@/lib/vista-datos";
import { Ficha, Origenes } from "./ficha";
import {
  MenuContextual,
  PaletaIconos,
  guardarIconos,
  imagenEmoji,
  leerIconos,
  type AccionMenu,
  type IconoManual,
} from "./iconos";
import {
  COLOR_FAMILIA,
  COLOR_NIVEL,
  COLOR_SIN_NIVEL,
  FORMA_TIPO,
  NOMBRE_NIVEL,
  NOMBRE_TIPO,
  iconoTipo,
} from "./presentacion";

const claseControl =
  "rounded-md border border-linea-2 bg-fondo px-2 py-1 text-xs text-texto focus-visible:outline-2 focus-visible:outline-oro";
const claseBoton =
  "rounded-md border border-linea-2 px-2 py-1 text-xs text-texto hover:border-oro aria-pressed:border-oro aria-pressed:text-oro focus-visible:outline-2 focus-visible:outline-oro";

function estilos(tipos: string[]): StylesheetJson {
  return [
    {
      // Como en el prototipo: relleno translúcido y contorno del color del nivel, nombre debajo.
      selector: "node",
      style: {
        width: 38,
        height: 38,
        "background-color": COLOR_SIN_NIVEL,
        "background-opacity": 0.28,
        "background-image": iconoTipo("otro"),
        "background-width": "58%",
        "background-height": "58%",
        "border-width": 2,
        "border-color": COLOR_SIN_NIVEL,
        label: "data(label)",
        color: "#dce4ec",
        "font-size": 10,
        "text-valign": "bottom",
        "text-margin-y": 5,
        "text-wrap": "ellipsis",
        "text-max-width": "140px",
        "text-outline-color": "#0b1220",
        "text-outline-width": 2,
        "min-zoomed-font-size": 6,
      },
    },
    ...tipos.map((t) => ({
      selector: `node[tipo = "${t}"]`,
      style: { shape: FORMA_TIPO[t] ?? "ellipse", "background-image": iconoTipo(t) },
    })),
    ...NIVELES.map((n) => ({
      selector: `node[nivel = "${n}"]`,
      style: { "background-color": COLOR_NIVEL[n], "border-color": COLOR_NIVEL[n] },
    })),
    {
      // Ícono elegido a mano en la paleta (menú contextual).
      selector: "node[icono]",
      style: {
        "background-image": "data(icono)",
        "background-width": "78%",
        "background-height": "78%",
      },
    },
    {
      selector: "node.foco",
      style: {
        "border-width": 4,
        "border-color": "#f0d572",
        "background-opacity": 0.5,
        width: 50,
        height: 50,
        "font-size": 12,
        "font-weight": 600,
        color: "#ffffff",
      },
    },
    { selector: "node:selected", style: { "border-width": 4 } },
    {
      // Las líneas llevan el color de su familia; el texto solo aparece al resaltarlas.
      selector: "edge",
      style: {
        width: "mapData(fuerza, 1, 10, 1.6, 7)",
        "line-color": COLOR_FAMILIA.otro,
        "line-opacity": 0.85,
        "curve-style": "bezier",
        "font-size": 9,
        "font-weight": 600,
        color: "#f0d572",
        "text-rotation": "autorotate",
        "text-background-color": "#0d1a2e",
        "text-background-opacity": 0.9,
        "text-background-padding": "3px",
        "text-background-shape": "roundrectangle",
        "min-zoomed-font-size": 6,
      },
    },
    ...FAMILIAS_ARISTA.map((f) => ({
      selector: `edge[familia = "${f}"]`,
      style: { "line-color": COLOR_FAMILIA[f], "target-arrow-color": COLOR_FAMILIA[f] },
    })),
    { selector: "edge[clase = 'evento']", style: { "line-style": "dashed" } },
    {
      selector: "edge[?dirigido]",
      style: { "target-arrow-shape": "triangle", "arrow-scale": 1.1 },
    },
    // Al pasar sobre una entidad (o elegir una línea) se atenúa lo demás.
    { selector: ".atenuado", style: { opacity: 0.18 } },
    {
      selector: "edge.resaltada, edge.elegida",
      style: {
        label: "data(label)",
        "line-opacity": 1,
        width: "mapData(fuerza, 1, 10, 3, 9)",
        "z-index": 10,
      },
    },
    { selector: "node.resaltado", style: { "background-opacity": 0.5, color: "#ffffff" } },
    {
      selector: "edge.elegida",
      style: { "underlay-color": "#f0d572", "underlay-opacity": 0.35, "underlay-padding": 4 },
    },
  ];
}

/**
 * Arriba de este número de entidades visibles, los diseños por fuerzas, capas o jerarquía tardan
 * minutos en el navegador (crecen con el cuadrado de las entidades): se usa la rejilla empaquetada.
 */
const RED_GRANDE = 1500;
const DISENOS_COSTOSOS: Diseno[] = ["fuerza", "mincruce", "jerarquia"];
const disenoEfectivo = (d: Diseno, entidades: number): Diseno =>
  entidades > RED_GRANDE && DISENOS_COSTOSOS.includes(d) ? "empaquetado" : d;

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
        familia: familiaArista(a.clase, a.tipo),
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
  const familias = useMemo(() => {
    const presentes = new Set(grafo.aristas.map((x) => familiaArista(x.clase, x.tipo)));
    return FAMILIAS_ARISTA.filter((f) => presentes.has(f));
  }, [grafo]);
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

  // --- Menú contextual e íconos elegidos a mano ----------------------------------------------
  type Menu = { x: number; y: number; entidadId: string | null };
  const [menu, setMenu] = useState<Menu | null>(null);
  const menuRef = useRef<(m: Menu | null) => void>(setMenu);
  const [iconos, setIconos] = useState<Record<string, IconoManual>>({});
  const [paletaDe, setPaletaDe] = useState<string | null>(null);
  useEffect(() => {
    // Preferencia local del navegador: se lee después de montar para no romper la hidratación.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIconos(leerIconos(encargoId));
  }, [encargoId]);
  const ponerIcono = (entidadId: string, icono: IconoManual | null) => {
    const nuevos = { ...iconos };
    if (icono) nuevos[entidadId] = icono;
    else delete nuevos[entidadId];
    setIconos(nuevos);
    guardarIconos(encargoId, nuevos);
  };

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
      // Clic derecho (o pulsación larga): menú contextual sobre la entidad o sobre el fondo.
      cy.on("cxttap", (ev) => {
        const p = ev.renderedPosition;
        menuRef.current({
          x: p.x,
          y: p.y,
          entidadId: ev.target !== cy && ev.target.isNode() ? ev.target.id() : null,
        });
      });
      cy.on("tapstart", () => menuRef.current(null));
      // Resalta la entidad bajo el cursor con sus líneas y vecinas, y atenúa el resto.
      cy.on("mouseover", "node", (ev) => {
        const cerca = ev.target.closedNeighborhood();
        cy?.elements().not(cerca).addClass("atenuado");
        cerca.edges().addClass("resaltada");
        cerca.nodes().addClass("resaltado");
      });
      cy.on("mouseout", "node", () => {
        cy?.elements().removeClass("atenuado resaltada resaltado");
      });
      cy.on("mouseover", "edge", (ev) => ev.target.addClass("resaltada"));
      cy.on("mouseout", "edge", (ev) => ev.target.removeClass("resaltada"));
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
    cy.layout(
      opcionesDiseno(
        disenoEfectivo(estado.diseno, visible.nodos.length),
        visible,
        estado.foco,
        distancia,
      ),
    ).run();
  }, [listo, visible, estado.foco, estado.diseno, distancia]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !listo) return;
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const icono = iconos[n.id()];
        if (icono) n.data("icono", imagenEmoji(icono.e));
        else n.removeData("icono");
      });
    });
  }, [iconos, listo, visible, estado.foco, estado.diseno]);

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
  const accionesMenu = (m: Menu): AccionMenu[] =>
    m.entidadId
      ? [
          { clave: "centrar", texto: "Centrar aquí" },
          { clave: "icono", texto: "Cambiar ícono…" },
          ...(iconos[m.entidadId]
            ? [{ clave: "automatico", texto: "Volver al ícono automático" }]
            : []),
        ]
      : [
          { clave: "ajustar", texto: "Ajustar la vista" },
          ...(estado.foco ? [{ clave: "general", texto: "Volver a la vista general" }] : []),
          ...(Object.keys(iconos).length
            ? [{ clave: "sin-iconos", texto: "Quitar todos los íconos personalizados" }]
            : []),
        ];
  const ejecutarMenu = (clave: string, entidadId: string | null) => {
    if (clave === "ajustar") ajustar();
    else if (clave === "general") navegar(volverA(estado, null));
    else if (clave === "sin-iconos") {
      setIconos({});
      guardarIconos(encargoId, {});
    } else if (!entidadId) return;
    else if (clave === "centrar") navegar(centrar(estado, entidadId));
    else if (clave === "icono") setPaletaDe(entidadId);
    else if (clave === "automatico") ponerIcono(entidadId, null);
  };

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
            <div role="group" aria-label="Alcance" className="flex gap-1">
              {([1, 2] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={estado.saltos === s}
                  onClick={() => navegar({ ...estado, saltos: s })}
                  className={claseBoton}
                >
                  {s === 1 ? "Relaciones directas" : "Hasta segundo grado"}
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
            {estado.foco ? (
              <button
                type="button"
                onClick={() => setPaletaDe(estado.foco)}
                className={claseBoton}
                aria-pressed={paletaDe === estado.foco}
              >
                Cambiar ícono
              </button>
            ) : null}
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
              <legend className="mb-1 text-tenue">Tipo de entidad</legend>
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
              <legend className="mb-1 text-tenue">Nivel de riesgo</legend>
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
              <legend className="mb-1 text-tenue">Fecha de las relaciones</legend>
              <label className="flex items-center gap-2 text-texto">
                Desde
                <input
                  type="date"
                  value={estado.desde ?? ""}
                  onChange={(ev) => navegar({ ...estado, desde: ev.target.value || null }, true)}
                  onClick={abrirCalendario}
                  className={claseControl}
                />
              </label>
              <label className="flex items-center gap-2 text-texto">
                Hasta
                <input
                  type="date"
                  value={estado.hasta ?? ""}
                  onChange={(ev) => navegar({ ...estado, hasta: ev.target.value || null }, true)}
                  onClick={abrirCalendario}
                  className={claseControl}
                />
              </label>
            </fieldset>
          </div>
        </details>

        <p className="text-xs text-tenue" data-testid="resumen-vista" aria-live="polite">
          {visible.nodos.length} entidades · {visible.aristas.length} relaciones visibles
          {estado.foco
            ? ` · ${estado.saltos === 1 ? "relaciones directas" : "hasta segundo grado"} de la entidad central`
            : ""}
        </p>
        {disenoEfectivo(estado.diseno, visible.nodos.length) !== estado.diseno ? (
          <p role="status" className="text-xs text-oro" data-testid="aviso-red-grande">
            Red grande ({visible.nodos.length.toLocaleString("es-MX")} entidades): se dibuja en
            rejilla empaquetada. Centra una entidad o filtra para usar el diseño elegido.
          </p>
        ) : null}
        {focoFiltrado ? (
          <p role="status" className="text-xs text-oro">
            Los filtros ocultan la entidad central.
          </p>
        ) : null}
        {paletaDe ? (
          <PaletaIconos
            entidad={nombre.get(paletaDe) ?? "Entidad"}
            actual={iconos[paletaDe] ?? null}
            alElegir={(icono) => ponerIcono(paletaDe, icono)}
            alRestablecer={() => ponerIcono(paletaDe, null)}
            alCerrar={() => setPaletaDe(null)}
          />
        ) : null}
        <div className="relative" onContextMenu={(ev) => ev.preventDefault()}>
          <div
            ref={contenedor}
            role="img"
            aria-label="Red de vínculos"
            className="h-[680px] w-full rounded-lg border border-linea-2 bg-[#0b1220] bg-[radial-gradient(ellipse_at_50%_0%,rgba(212,175,55,0.07),transparent_60%)]"
          />
          {menu ? (
            <MenuContextual
              x={menu.x}
              y={menu.y}
              titulo={menu.entidadId ? (nombre.get(menu.entidadId) ?? "Entidad") : null}
              acciones={accionesMenu(menu)}
              alElegir={(clave) => ejecutarMenu(clave, menu.entidadId)}
              alCerrar={() => setMenu(null)}
            />
          ) : null}
        </div>
        <p className="text-xs text-tenue-2">
          Clic derecho sobre una entidad para centrarla o cambiar su ícono.
          {Object.keys(iconos).length
            ? ` ${Object.keys(iconos).length} entidad(es) con ícono personalizado.`
            : ""}
        </p>
        <Leyenda tipos={tipos} familias={familias} />
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

function Leyenda({ tipos, familias }: { tipos: string[]; familias: readonly FamiliaArista[] }) {
  return (
    <div
      className="grid gap-x-8 gap-y-3 rounded-lg border border-linea bg-panel p-3 text-xs text-tenue sm:grid-cols-3"
      aria-label="Leyenda"
    >
      <div className="flex flex-col gap-1.5">
        <p className="font-semibold text-texto">Nivel de riesgo (color de la entidad)</p>
        {NIVELES.map((n) => (
          <span key={n} className="flex items-center gap-1.5">
            <span
              className="inline-block size-3 rounded-full border-2"
              style={{ borderColor: COLOR_NIVEL[n], background: `${COLOR_NIVEL[n]}55` }}
              aria-hidden
            />
            {NOMBRE_NIVEL[n]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block size-3 rounded-full border-2"
            style={{ borderColor: COLOR_SIN_NIVEL, background: `${COLOR_SIN_NIVEL}55` }}
            aria-hidden
          />
          Sin calificar
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="font-semibold text-texto">Tipo de entidad (ícono)</p>
        {tipos.map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            {/* El ícono es un SVG propio (data URI), no contenido del auditado. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={iconoTipo(t)} alt="" className="size-4 rounded bg-[#3d5a78] p-0.5" />
            {NOMBRE_TIPO[t] ?? t}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="font-semibold text-texto">Relación (color de la línea)</p>
        {familias.map((f) => (
          <span key={f} className="flex items-center gap-1.5">
            <span
              className="inline-block h-1 w-6 rounded"
              style={{ background: COLOR_FAMILIA[f] }}
              aria-hidden
            />
            {NOMBRE_FAMILIA[f]}
          </span>
        ))}
        <p className="mt-1 text-tenue-2">
          Línea continua: vínculo declarado. Punteada: eventos agrupados (llamadas, transferencias,
          contratos). Más gruesa: relación más fuerte. Pasa el cursor sobre una entidad para ver sus
          relaciones; haz clic en una línea para ver la evidencia.
        </p>
      </div>
    </div>
  );
}
