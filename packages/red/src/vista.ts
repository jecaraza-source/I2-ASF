/**
 * Vista dinámica (§11): grafo dibujable, filtros, entidad central y estado en la URL.
 * Funciones puras; el visor (Cytoscape) solo dibuja lo que devuelven.
 */
import type { Nivel } from "./tipos";

export type NodoVista = {
  id: string;
  nombre: string;
  tipo: string;
  nivel: Nivel;
  puntaje: number;
};

export type AristaVista = {
  /** `v:<vinculo>` o `e:<tipo>:<a>:<b>` para eventos agrupados por par. */
  id: string;
  clase: "vinculo" | "evento";
  /** Tipo del vínculo o del evento. */
  tipo: string;
  origen: string;
  destino: string;
  /** 1–10; en eventos crece con la cantidad. */
  fuerza: number;
  cantidad: number;
  desde: string | null;
  hasta: string | null;
  /** IDs de los vínculos o eventos que la sostienen (para la evidencia). */
  objetos: string[];
  /** Vínculos de un documento (tarea 19): aportación del socio y su fracción del capital. */
  monto?: string | null;
  moneda?: string | null;
  participacion?: number | null;
};

export type GrafoVista = { nodos: NodoVista[]; aristas: AristaVista[] };

export type EventoVista = {
  id: string;
  tipo: string;
  /** Fecha ISO (aaaa-mm-dd) o null. */
  fecha: string | null;
  participantes: { entidad_id: string; rol: string }[];
};

const PLURAL: Record<string, string> = {
  llamada: "llamadas",
  transferencia: "transferencias",
  contrato: "contratos",
  pago: "pagos",
  otro: "eventos",
};

/** Papeles de un documento, como se leen en la red. */
export const NOMBRE_PAPEL: Record<string, string> = {
  socio: "Socio",
  representante_legal: "Representante legal",
  apoderado: "Apoderado",
  comisario: "Comisario",
  administrador: "Administrador",
  notario: "Notario",
};

/** «$25,000.00» sin depender del paquete de modelo (la red es pura). */
function pesos(monto: string, moneda: string | null | undefined): string {
  const [entero = "0", dec = "00"] = monto.replace(/^-/, "").split(".");
  const cuerpo = `${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(dec + "00").slice(0, 2)}`;
  const signo = monto.startsWith("-") ? "-" : "";
  if (!moneda || moneda === "MXN") return `${signo}$${cuerpo}`;
  if (moneda === "USD") return `${signo}US$${cuerpo}`;
  return `${signo}${cuerpo} ${moneda}`;
}

export function etiquetaArista(a: AristaVista): string {
  if (a.clase === "vinculo") {
    const papel = NOMBRE_PAPEL[a.tipo] ?? a.tipo;
    const partes = [papel];
    if (a.monto) partes.push(pesos(a.monto, a.moneda));
    const etiqueta = partes.join(" · ");
    return a.participacion ? `${etiqueta} (${Math.round(a.participacion * 1000) / 10}%)` : etiqueta;
  }
  return a.cantidad === 1 ? a.tipo : `${a.cantidad} ${PLURAL[a.tipo] ?? a.tipo}`;
}

/**
 * Pares que une un evento: origen→destino si los hay (del mismo tipo de entidad cuando ambos lados
 * traen varios, p. ej. teléfono↔teléfono y persona↔persona en una llamada); si no, todas las partes.
 */
function pares(e: EventoVista, tipoDe: ReadonlyMap<string, string>): [string, string][] {
  const origenes = e.participantes.filter((p) => p.rol === "origen").map((p) => p.entidad_id);
  const destinos = e.participantes.filter((p) => p.rol === "destino").map((p) => p.entidad_id);
  const resultado: [string, string][] = [];
  if (origenes.length && destinos.length) {
    for (const o of origenes) for (const d of destinos) if (o !== d) resultado.push([o, d]);
    const mismos = resultado.filter(([o, d]) => tipoDe.get(o) === tipoDe.get(d));
    return mismos.length ? mismos : resultado;
  }
  const todos = [...new Set(e.participantes.map((p) => p.entidad_id))];
  for (let i = 0; i < todos.length; i++)
    for (let j = i + 1; j < todos.length; j++)
      resultado.push([todos[i] as string, todos[j] as string]);
  return resultado;
}

/**
 * Agrupa eventos en una arista por par de entidades y tipo (sin dirección), para que cientos de
 * llamadas sean una sola línea con su cantidad.
 */
export function agruparEventos(
  eventos: EventoVista[],
  /** Entidades dibujadas: ID → tipo de entidad. */
  nodos: ReadonlyMap<string, string>,
): AristaVista[] {
  const grupos = new Map<string, AristaVista>();
  for (const e of eventos) {
    for (const [a, b] of pares(e, nodos)) {
      if (!nodos.has(a) || !nodos.has(b)) continue;
      const [x, y] = a < b ? [a, b] : [b, a];
      const clave = `e:${e.tipo}:${x}:${y}`;
      let g = grupos.get(clave);
      if (!g) {
        g = {
          id: clave,
          clase: "evento",
          tipo: e.tipo,
          origen: a,
          destino: b,
          fuerza: 1,
          cantidad: 0,
          desde: null,
          hasta: null,
          objetos: [],
        };
        grupos.set(clave, g);
      }
      if (!g.objetos.includes(e.id)) {
        g.objetos.push(e.id);
        g.cantidad = g.objetos.length;
      }
      if (e.fecha) {
        if (!g.desde || e.fecha < g.desde) g.desde = e.fecha;
        if (!g.hasta || e.fecha > g.hasta) g.hasta = e.fecha;
      }
    }
  }
  for (const g of grupos.values())
    g.fuerza = Math.min(10, 1 + Math.round(Math.log2(g.cantidad) * 2));
  return [...grupos.values()].sort((p, q) => p.id.localeCompare(q.id));
}

export const NIVELES: Nivel[] = ["critico", "alto", "medio", "bajo"];

export type FiltrosVista = {
  /** Tipos de entidad visibles; vacío = todos. */
  tipos: string[];
  /** Niveles visibles; vacío = todos. */
  niveles: Nivel[];
  desde: string | null;
  hasta: string | null;
};

/**
 * Aplica filtros. Una arista con fechas se conserva si su intervalo toca el rango pedido;
 * las aristas sin fecha nunca se ocultan por fecha.
 */
export function filtrar(grafo: GrafoVista, f: FiltrosVista): GrafoVista {
  const nodos = grafo.nodos.filter(
    (n) =>
      (!f.tipos.length || f.tipos.includes(n.tipo)) &&
      (!f.niveles.length || f.niveles.includes(n.nivel)),
  );
  const ids = new Set(nodos.map((n) => n.id));
  const aristas = grafo.aristas.filter((a) => {
    if (!ids.has(a.origen) || !ids.has(a.destino)) return false;
    if (f.desde && a.hasta && a.hasta < f.desde) return false;
    if (f.hasta && a.desde && a.desde > f.hasta) return false;
    return true;
  });
  return { nodos, aristas };
}

/** Subgrafo a `saltos` de la entidad central, con distancias (0 = centro). */
export function vecindad(
  grafo: GrafoVista,
  foco: string,
  saltos: number,
): GrafoVista & { distancia: Map<string, number> } {
  const distancia = new Map<string, number>();
  if (!grafo.nodos.some((n) => n.id === foco)) return { nodos: [], aristas: [], distancia };
  const adyacencia = new Map<string, string[]>();
  for (const a of grafo.aristas) {
    adyacencia.set(a.origen, [...(adyacencia.get(a.origen) ?? []), a.destino]);
    adyacencia.set(a.destino, [...(adyacencia.get(a.destino) ?? []), a.origen]);
  }
  distancia.set(foco, 0);
  let frontera = [foco];
  for (let d = 1; d <= saltos; d++) {
    const siguiente: string[] = [];
    for (const n of frontera)
      for (const m of adyacencia.get(n) ?? [])
        if (!distancia.has(m)) {
          distancia.set(m, d);
          siguiente.push(m);
        }
    frontera = siguiente;
  }
  return {
    nodos: grafo.nodos.filter((n) => distancia.has(n.id)),
    aristas: grafo.aristas.filter((a) => distancia.has(a.origen) && distancia.has(a.destino)),
    distancia,
  };
}

export const DISENOS = [
  "fuerza",
  "circular",
  "agrupados",
  "jerarquia",
  "organizacion",
  "abanico",
  "empaquetado",
  "mincruce",
  "estructura",
] as const;
export type Diseno = (typeof DISENOS)[number];

export const NOMBRE_DISENO: Record<Diseno, string> = {
  fuerza: "Fuerza",
  circular: "Circular",
  agrupados: "Agrupados",
  jerarquia: "Jerarquía",
  organizacion: "Organización",
  abanico: "Abanico",
  empaquetado: "Empaquetado",
  mincruce: "Mínimos cruces",
  estructura: "Estructura corporativa",
};

export type EstadoVista = FiltrosVista & {
  foco: string | null;
  saltos: 1 | 2;
  ruta: string[];
  diseno: Diseno;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function lista(v: string | null): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

/** Lee el estado de la URL; cualquier valor inválido cae en su valor por defecto. */
export function leerEstado(p: URLSearchParams): EstadoVista {
  const foco = p.get("foco");
  const diseno = p.get("diseno");
  const desde = p.get("desde");
  const hasta = p.get("hasta");
  const ruta = lista(p.get("ruta")).filter((x) => UUID.test(x));
  const focoValido = foco && UUID.test(foco) ? foco : null;
  return {
    foco: focoValido,
    saltos: p.get("saltos") === "2" ? 2 : 1,
    ruta: focoValido ? (ruta.length ? ruta : [focoValido]) : [],
    diseno: (DISENOS as readonly string[]).includes(diseno ?? "") ? (diseno as Diseno) : "fuerza",
    tipos: lista(p.get("tipos")).filter((t) => /^[a-z_]+$/.test(t)),
    niveles: lista(p.get("niveles")).filter((n): n is Nivel => (NIVELES as string[]).includes(n)),
    desde: desde && FECHA.test(desde) ? desde : null,
    hasta: hasta && FECHA.test(hasta) ? hasta : null,
  };
}

/** Serializa el estado (solo lo que difiere del valor por defecto). */
export function escribirEstado(e: EstadoVista): string {
  const p = new URLSearchParams();
  if (e.foco) {
    p.set("foco", e.foco);
    p.set("saltos", String(e.saltos));
    p.set("ruta", e.ruta.join(","));
  }
  if (e.diseno !== "fuerza") p.set("diseno", e.diseno);
  if (e.tipos.length) p.set("tipos", e.tipos.join(","));
  if (e.niveles.length) p.set("niveles", e.niveles.join(","));
  if (e.desde) p.set("desde", e.desde);
  if (e.hasta) p.set("hasta", e.hasta);
  return p.toString();
}

/** Centra una entidad: si ya estaba en la ruta se regresa a ese paso; si no, se agrega. */
export function centrar(e: EstadoVista, id: string): EstadoVista {
  const i = e.ruta.indexOf(id);
  const ruta = i >= 0 ? e.ruta.slice(0, i + 1) : [...e.ruta, id];
  return { ...e, foco: id, ruta };
}

/** Regresa a un paso de la ruta, o a la vista general con `null`; los filtros se conservan. */
export function volverA(e: EstadoVista, indice: number | null): EstadoVista {
  if (indice === null || indice < 0) return { ...e, foco: null, saltos: 1, ruta: [] };
  const ruta = e.ruta.slice(0, indice + 1);
  return { ...e, foco: ruta[ruta.length - 1] ?? null, ruta };
}

export type Punto = { x: number; y: number };

const ORDEN_TIPOS = [
  "persona_fisica",
  "persona_moral",
  "dependencia",
  "cuenta",
  "telefono",
  "domicilio",
  "otro",
];
const ordenTipo = (t: string) => {
  const i = ORDEN_TIPOS.indexOf(t);
  return i < 0 ? ORDEN_TIPOS.length : i;
};

/**
 * Posiciones de los diseños que no da Cytoscape de fábrica:
 * - agrupados: un círculo por tipo de entidad, los grupos en rejilla;
 * - organizacion: una fila por tipo (personas arriba, cuentas y teléfonos abajo);
 * - empaquetado: rejilla compacta ordenada por nivel y puntaje.
 */
export function posiciones(
  diseno: "agrupados" | "organizacion" | "empaquetado",
  nodos: NodoVista[],
) {
  const pos = new Map<string, Punto>();
  const porTipo = new Map<string, NodoVista[]>();
  for (const n of [...nodos].sort((a, b) => a.nombre.localeCompare(b.nombre))) {
    const grupo = porTipo.get(n.tipo);
    if (grupo) grupo.push(n);
    else porTipo.set(n.tipo, [n]);
  }
  const tipos = [...porTipo.keys()].sort((a, b) => ordenTipo(a) - ordenTipo(b));

  if (diseno === "empaquetado") {
    const orden = [...nodos].sort(
      (a, b) =>
        NIVELES.indexOf(a.nivel) - NIVELES.indexOf(b.nivel) ||
        b.puntaje - a.puntaje ||
        a.nombre.localeCompare(b.nombre),
    );
    const columnas = Math.max(1, Math.ceil(Math.sqrt(orden.length)));
    orden.forEach((n, i) =>
      pos.set(n.id, { x: (i % columnas) * 90, y: Math.floor(i / columnas) * 90 }),
    );
    return pos;
  }

  if (diseno === "organizacion") {
    tipos.forEach((t, fila) => {
      const grupo = porTipo.get(t) ?? [];
      grupo.forEach((n, i) =>
        pos.set(n.id, { x: (i - (grupo.length - 1) / 2) * 110, y: fila * 160 }),
      );
    });
    return pos;
  }

  const columnas = Math.max(1, Math.ceil(Math.sqrt(tipos.length)));
  tipos.forEach((t, g) => {
    const grupo = porTipo.get(t) ?? [];
    const radio = Math.max(40, (grupo.length * 70) / (2 * Math.PI));
    const centro = { x: (g % columnas) * 600, y: Math.floor(g / columnas) * 600 };
    grupo.forEach((n, i) => {
      const angulo = (2 * Math.PI * i) / Math.max(1, grupo.length);
      pos.set(n.id, {
        x: centro.x + (grupo.length === 1 ? 0 : radio * Math.cos(angulo)),
        y: centro.y + (grupo.length === 1 ? 0 : radio * Math.sin(angulo)),
      });
    });
  });
  return pos;
}

const CAPA_PAPEL: Record<string, "capital" | "representacion" | "fe"> = {
  socio: "capital",
  administrador: "representacion",
  representante_legal: "representacion",
  apoderado: "representacion",
  comisario: "representacion",
  notario: "fe",
};

/**
 * Estructura corporativa (tarea 19): los socios arriba de la sociedad en la que participan (en
 * cadena, si una sociedad es socia de otra), la representación y la vigilancia debajo de su
 * sociedad, el notario más abajo y lo que no tiene papel societario en una fila al final.
 */
export function posicionesEstructura(grafo: GrafoVista): Map<string, Punto> {
  const capa = new Map<string, number>();
  const capital = grafo.aristas.filter(
    (a) => a.clase === "vinculo" && CAPA_PAPEL[a.tipo] === "capital",
  );
  // Sociedades: destino de un vínculo societario. Rango por cadena de capital (socio → sociedad).
  for (const a of capital) {
    if (!capa.has(a.origen)) capa.set(a.origen, 0);
    if (!capa.has(a.destino)) capa.set(a.destino, 1);
  }
  for (let vuelta = 0; vuelta < grafo.nodos.length; vuelta++) {
    let cambio = false;
    for (const a of capital) {
      const o = capa.get(a.origen) ?? 0;
      if ((capa.get(a.destino) ?? 0) < o + 1) {
        capa.set(a.destino, o + 1);
        cambio = true;
      }
    }
    if (!cambio) break;
  }
  const papeles = grafo.aristas.filter(
    (a) =>
      a.clase === "vinculo" &&
      (CAPA_PAPEL[a.tipo] === "representacion" || CAPA_PAPEL[a.tipo] === "fe"),
  );
  for (const a of papeles) if (!capa.has(a.destino)) capa.set(a.destino, 1);
  for (const a of papeles) {
    if (capa.has(a.origen) && capital.some((c) => c.origen === a.origen)) continue;
    const extra = CAPA_PAPEL[a.tipo] === "fe" ? 2 : 1;
    capa.set(a.origen, Math.max(capa.get(a.origen) ?? 0, (capa.get(a.destino) ?? 1) + extra));
  }
  const maxima = Math.max(0, ...capa.values());
  const filas = new Map<number, NodoVista[]>();
  for (const n of grafo.nodos) {
    const f = capa.has(n.id) ? (capa.get(n.id) as number) : maxima + 2;
    const fila = filas.get(f);
    if (fila) fila.push(n);
    else filas.set(f, [n]);
  }
  const pos = new Map<string, Punto>();
  for (const [f, fila] of filas) {
    fila.sort((a, b) => ordenTipo(a.tipo) - ordenTipo(b.tipo) || a.nombre.localeCompare(b.nombre));
    fila.forEach((n, i) => pos.set(n.id, { x: (i - (fila.length - 1) / 2) * 150, y: f * 170 }));
  }
  return pos;
}
