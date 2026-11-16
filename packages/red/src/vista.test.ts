import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { detectarPlantilla, importar, plantillaSchema } from "@sigma/importador";
import { leerXlsx } from "@sigma/importador/leer";
import { describe, expect, it } from "vitest";
import {
  agruparEventos,
  centrar,
  escribirEstado,
  etiquetaArista,
  filtrar,
  leerEstado,
  posiciones,
  vecindad,
  volverA,
  type AristaVista,
  type GrafoVista,
  type NodoVista,
} from "./vista";

const RAIZ = join(__dirname, "..", "..", "..");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const nodo = (
  n: number,
  tipo = "persona_fisica",
  nivel: NodoVista["nivel"] = "bajo",
): NodoVista => ({
  id: id(n),
  nombre: `N${n}`,
  tipo,
  nivel,
  puntaje: 0,
});
const arista = (a: number, b: number, desde: string | null = null): AristaVista => ({
  id: `v:${a}-${b}`,
  clase: "vinculo",
  tipo: "socio",
  origen: id(a),
  destino: id(b),
  fuerza: 5,
  cantidad: 1,
  desde,
  hasta: desde,
  objetos: [`${a}-${b}`],
});

// Cadena 1–2–3–4 y un nodo suelto 5.
const cadena: GrafoVista = {
  nodos: [
    nodo(1),
    nodo(2, "persona_moral", "critico"),
    nodo(3, "cuenta", "alto"),
    nodo(4),
    nodo(5, "telefono"),
  ],
  aristas: [arista(1, 2, "2023-01-10"), arista(2, 3, "2024-06-01"), arista(3, 4)],
};

describe("vecindad", () => {
  it("1 salto trae el centro y sus vínculos directos; 2 saltos, los siguientes", () => {
    const uno = vecindad(cadena, id(2), 1);
    expect(uno.nodos.map((n) => n.nombre).sort()).toEqual(["N1", "N2", "N3"]);
    expect(uno.aristas).toHaveLength(2);
    const dos = vecindad(cadena, id(2), 2);
    expect(dos.nodos.map((n) => n.nombre).sort()).toEqual(["N1", "N2", "N3", "N4"]);
    expect(dos.distancia.get(id(4))).toBe(2);
  });
  it("un foco que no está en la red deja la vista vacía", () => {
    expect(vecindad(cadena, id(99), 1).nodos).toEqual([]);
  });
});

describe("filtrar", () => {
  it("por tipo y nivel quita nodos y sus aristas", () => {
    const g = filtrar(cadena, {
      tipos: [],
      niveles: ["critico", "alto"],
      desde: null,
      hasta: null,
    });
    expect(g.nodos.map((n) => n.nombre)).toEqual(["N2", "N3"]);
    expect(g.aristas.map((a) => a.id)).toEqual(["v:2-3"]);
  });
  it("por fecha conserva aristas sin fecha", () => {
    const g = filtrar(cadena, { tipos: [], niveles: [], desde: "2024-01-01", hasta: null });
    expect(g.aristas.map((a) => a.id)).toEqual(["v:2-3", "v:3-4"]);
  });
});

describe("estado en la URL", () => {
  it("ida y vuelta conserva foco, saltos, ruta, diseño y filtros", () => {
    const e = leerEstado(
      new URLSearchParams(
        `foco=${id(2)}&saltos=2&ruta=${id(1)},${id(2)}&diseno=abanico&niveles=critico&desde=2024-01-01`,
      ),
    );
    expect(e).toMatchObject({
      foco: id(2),
      saltos: 2,
      ruta: [id(1), id(2)],
      diseno: "abanico",
      niveles: ["critico"],
    });
    expect(leerEstado(new URLSearchParams(escribirEstado(e)))).toEqual(e);
  });
  it("valores inválidos caen en el valor por defecto", () => {
    const e = leerEstado(
      new URLSearchParams("foco=<script>&saltos=9&diseno=x&niveles=nada&desde=ayer"),
    );
    expect(e).toEqual({
      foco: null,
      saltos: 1,
      ruta: [],
      diseno: "fuerza",
      tipos: [],
      niveles: [],
      desde: null,
      hasta: null,
    });
    expect(escribirEstado(e)).toBe("");
  });
  it("centrar agrega a la ruta; volver a un paso o a la vista general conserva filtros", () => {
    let e = leerEstado(new URLSearchParams("niveles=alto"));
    e = centrar(e, id(1));
    e = centrar(e, id(2));
    e = centrar(e, id(3));
    expect(e.ruta).toEqual([id(1), id(2), id(3)]);
    expect(centrar(e, id(2)).ruta).toEqual([id(1), id(2)]);
    expect(volverA(e, 0)).toMatchObject({ foco: id(1), ruta: [id(1)], niveles: ["alto"] });
    expect(volverA(e, null)).toMatchObject({ foco: null, ruta: [], niveles: ["alto"] });
  });
});

describe("posiciones", () => {
  it("da una posición a cada nodo en los tres diseños propios", () => {
    for (const d of ["agrupados", "organizacion", "empaquetado"] as const) {
      expect(posiciones(d, cadena.nodos).size).toBe(5);
    }
  });
});

describe("eventos agrupados (07734)", () => {
  it("las 300 llamadas se dibujan como pocas aristas con su cantidad", async () => {
    const dir = join(RAIZ, "packages", "importador", "plantillas");
    const plantillas = readdirSync(dir).map((f) =>
      plantillaSchema.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))),
    );
    const libro = await leerXlsx(
      readFileSync(join(RAIZ, "fixtures", "ASF_Auditoria_Forense_07734.xlsx")),
    );
    const plantilla = detectarPlantilla(libro, plantillas);
    if (!plantilla) throw new Error("sin plantilla");
    const r = importar(libro, plantilla);
    const eventos = r.eventos.map((e, i) => ({
      id: `ev${i}`,
      tipo: e.tipo,
      fecha: typeof e.fecha_hora === "string" ? e.fecha_hora.slice(0, 10) : null,
      participantes: e.participantes.map((p) => ({ entidad_id: p.entidad, rol: p.rol })),
    }));
    const aristas = agruparEventos(eventos, new Map(r.entidades.map((e) => [e.clave, e.tipo])));
    const llamadas = aristas.filter((a) => a.tipo === "llamada");
    expect(new Set(llamadas.flatMap((a) => a.objetos)).size).toBe(300);
    expect(llamadas.length).toBeLessThan(150);
    const mayor = [...llamadas].sort((a, b) => b.cantidad - a.cantidad)[0];
    expect(mayor && etiquetaArista(mayor)).toMatch(/^\d+ llamadas$/);
    expect(mayor?.fuerza).toBeLessThanOrEqual(10);
  });
});
