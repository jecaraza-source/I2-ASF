/**
 * Generación de la red (docs/ESPECIFICACION.md §9):
 * semillas → registros validados que las mencionan → entidades → vínculos
 * declarados y eventos entre ellas. Los eventos van aparte: no cuentan como vínculos.
 */
import type { DatosRed, EntidadRed, RedGenerada } from "./tipos";

/** Mapa entidad → entidad canónica, siguiendo las fusiones aceptadas. */
export function canonicas(entidades: EntidadRed[]): Map<string, string> {
  const porId = new Map(entidades.map((e) => [e.id, e]));
  const mapa = new Map<string, string>();
  for (const e of entidades) {
    let actual = e;
    const vistos = new Set<string>();
    while (actual.fusionada_en && porId.has(actual.fusionada_en) && !vistos.has(actual.id)) {
      vistos.add(actual.id);
      actual = porId.get(actual.fusionada_en) as EntidadRed;
    }
    mapa.set(e.id, actual.id);
  }
  return mapa;
}

export type OpcionesRed = { semillas: string[] | "todas"; alcance: 1 | 2 };

export function generarRed(datos: DatosRed, opciones: OpcionesRed): RedGenerada {
  const canon = canonicas(datos.entidades);
  const c = (id: string) => canon.get(id) ?? id;

  // Entidades mencionadas por cada registro validado, y registros de cada entidad.
  const porRegistro = new Map<string, Set<string>>();
  const porEntidad = new Map<string, Set<string>>();
  for (const m of datos.menciones) {
    const e = c(m.entidad_id);
    (
      porRegistro.get(m.registro_id) ?? porRegistro.set(m.registro_id, new Set()).get(m.registro_id)
    )?.add(e);
    (porEntidad.get(e) ?? porEntidad.set(e, new Set()).get(e))?.add(m.registro_id);
  }

  const distancia = new Map<string, number>();
  let semillas: string[];
  if (opciones.semillas === "todas") {
    semillas = [...porEntidad.keys()].sort();
    for (const s of semillas) distancia.set(s, 0);
  } else {
    semillas = [...new Set(opciones.semillas.map(c))].sort();
    for (const s of semillas) distancia.set(s, 0);
    let frontera = semillas;
    for (let salto = 1; salto <= opciones.alcance; salto++) {
      const siguiente: string[] = [];
      for (const e of frontera) {
        for (const r of porEntidad.get(e) ?? []) {
          for (const otra of porRegistro.get(r) ?? []) {
            if (!distancia.has(otra)) {
              distancia.set(otra, salto);
              siguiente.push(otra);
            }
          }
        }
      }
      frontera = siguiente;
    }
  }

  const enRed = (id: string) => distancia.has(c(id));
  const vinculos = datos.vinculos
    .filter((v) => enRed(v.origen_id) && enRed(v.destino_id) && c(v.origen_id) !== c(v.destino_id))
    .map((v) => v.id)
    .sort();
  const eventos = datos.eventos
    .filter((ev) => {
      const ps = new Set(ev.participantes.map((p) => c(p.entidad_id)));
      return ps.size > 0 && [...ps].every((p) => distancia.has(p));
    })
    .map((ev) => ev.id)
    .sort();

  return {
    semillas,
    alcance: opciones.alcance,
    nodos: [...distancia.entries()]
      .map(([entidad_id, d]) => ({ entidad_id, distancia: d }))
      .sort((a, b) => a.distancia - b.distancia || a.entidad_id.localeCompare(b.entidad_id)),
    vinculos,
    eventos,
  };
}
