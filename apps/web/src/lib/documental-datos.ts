import "server-only";
import {
  POR_PAGINA_DOCUMENTAL,
  cargaArbol,
  cargaDocumental,
  type FiltrosDocumental,
  type Json,
} from "@sigma/modelo";
import { z } from "zod";
import { clienteServidor } from "@/lib/supabase/servidor";

type Cliente = Awaited<ReturnType<typeof clienteServidor>>;

const involucradosSchema = z
  .array(
    z.object({
      entidad_id: z.string(),
      nombre: z.string(),
      tipo: z.string(),
      rol: z.string(),
    }),
  )
  .catch([]);
const identificadoresSchema = z.array(z.object({ tipo: z.string(), valor: z.string() })).catch([]);
const montosSchema = z.array(z.object({ monto: z.string(), moneda: z.string() })).catch([]);

/** Una página de la tabla única y el total que cumple los filtros. */
export async function leerRegistros(
  supabase: Cliente,
  encargoId: string,
  f: FiltrosDocumental,
  pagina = {
    limite: POR_PAGINA_DOCUMENTAL,
    desplazamiento: (f.pagina - 1) * POR_PAGINA_DOCUMENTAL,
  },
) {
  const { data, error } = await supabase.rpc("expediente_registros", {
    p: cargaDocumental(encargoId, f, pagina) as Json,
  });
  if (error) {
    console.error(`[leerRegistros] error de base: ${error.code ?? "desconocido"}`);
    return { ok: false as const };
  }
  const filas = (data ?? []).map((r) => ({
    ...r,
    involucrados: involucradosSchema.parse(r.involucrados),
    identificadores: identificadoresSchema.parse(r.identificadores),
    montos: montosSchema.parse(r.montos),
    referencias: r.referencias ?? [],
  }));
  return { ok: true as const, filas, total: Number(data?.[0]?.total ?? 0) };
}
export type FilaDocumental = Extract<
  Awaited<ReturnType<typeof leerRegistros>>,
  { ok: true }
>["filas"][number];

export type NodoCategoria = { id: string | null; nombre: string; registros: number };
export type NodoEntidad = {
  id: string | null;
  nombre: string;
  tipo: string | null;
  registros: number;
  categorias: NodoCategoria[];
};
export type NodoExpediente = {
  id: string | null;
  nombre: string;
  registros: number;
  entidades: NodoEntidad[];
};

/** Árbol expediente → entidad → categoría con los mismos filtros que la tabla. */
export async function leerArbol(
  supabase: Cliente,
  encargoId: string,
  f: FiltrosDocumental,
): Promise<NodoExpediente[] | null> {
  const { data, error } = await supabase.rpc("expediente_arbol", {
    p: cargaArbol(encargoId, f) as Json,
  });
  if (error) {
    console.error(`[leerArbol] error de base: ${error.code ?? "desconocido"}`);
    return null;
  }
  const expedientes = new Map<string, NodoExpediente>();
  const llave = (id: string | null) => id ?? "sin";
  for (const n of data ?? []) {
    if (n.nivel === 1) {
      expedientes.set(llave(n.expediente_id), {
        id: n.expediente_id,
        nombre: n.expediente ?? "Sin expediente",
        registros: Number(n.registros),
        entidades: [],
      });
    }
  }
  for (const n of data ?? []) {
    const exp = expedientes.get(llave(n.expediente_id));
    if (!exp) continue;
    if (n.nivel === 2) {
      exp.entidades.push({
        id: n.entidad_id,
        nombre: n.entidad ?? "Sin entidades",
        tipo: n.entidad_tipo,
        registros: Number(n.registros),
        categorias: [],
      });
    } else if (n.nivel === 3) {
      const ent = exp.entidades.find((e) => e.id === n.entidad_id);
      ent?.categorias.push({
        id: n.categoria_id,
        nombre: n.categoria ?? "Sin categoría",
        registros: Number(n.registros),
      });
    }
  }
  // Los registros sin expediente van al final.
  return [...expedientes.values()].sort(
    (a, b) => Number(a.id === null) - Number(b.id === null) || a.nombre.localeCompare(b.nombre),
  );
}
