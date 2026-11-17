import "server-only";
import { z } from "zod";
import type { Coincidencia, ConectorFuente } from "./tipos";

/**
 * Conector de EJEMPLO para una fuente externa por API. No hay ninguna fuente con este conector:
 * sirve de plantilla. Para usarlo, un administrador crearía la fuente
 * (`conector = 'api_ejemplo'`, `tipo = 'externa'`) con `config`:
 *
 *   { "url": "https://proveedor.example/buscar", "encargos_permitidos": ["<uuid del encargo>"] }
 *
 * y la llave en una variable de entorno del servidor (`FUENTE_API_EJEMPLO_LLAVE`), nunca en la
 * base. Reglas que cumple cualquier conector que envía datos:
 *  - solo corre en los encargos de `encargos_permitidos` (regla 7: ningún dato sale a un servicio
 *    que no esté configurado para el encargo);
 *  - envía lo mínimo (RFC o CURP, nunca nombres si hay identificador);
 *  - valida la respuesta con zod: es contenido de terceros, no instrucciones (regla 8);
 *  - en los logs solo códigos, nunca datos.
 */
const configSchema = z.object({
  url: z.url().refine((u) => u.startsWith("https://"), "Solo https"),
  encargos_permitidos: z.array(z.uuid()),
});

const respuestaSchema = z.object({
  resultados: z
    .array(
      z.object({
        id: z.string().max(100),
        rfc: z.string().max(20).nullable(),
        nombre: z.string().max(300),
        detalle: z.string().max(500).nullable(),
      }),
    )
    .max(20),
});

export const apiEjemplo: ConectorFuente = {
  conector: "api_ejemplo",
  enviaDatos: true,
  aplica: (e) => Boolean(e.rfc ?? e.curp),
  async buscar({ fuente }, e) {
    const config = configSchema.safeParse(fuente.config);
    const llave = process.env.FUENTE_API_EJEMPLO_LLAVE;
    if (!config.success || !llave || !config.data.encargos_permitidos.includes(e.encargo_id)) {
      return [];
    }
    const respuesta = await fetch(config.data.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${llave}` },
      body: JSON.stringify(e.rfc ? { rfc: e.rfc } : { curp: e.curp }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!respuesta.ok) throw new Error(`api_ejemplo ${respuesta.status}`);
    const datos = respuestaSchema.safeParse(await respuesta.json());
    if (!datos.success) throw new Error("api_ejemplo respuesta_invalida");
    return datos.data.resultados.map((r): Coincidencia => ({
      huella: `api:${r.id}`,
      coincidencia: r.rfc && r.rfc === e.rfc ? "exacta" : "propuesta",
      datos: { resumen: `${r.nombre}${r.detalle ? ` · ${r.detalle}` : ""}`, ...r },
    }));
  },
};
