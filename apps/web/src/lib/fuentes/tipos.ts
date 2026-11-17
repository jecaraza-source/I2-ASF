import type { Json } from "@sigma/modelo";
import type { clienteServicio } from "@/lib/supabase/servicio";

export type Servicio = NonNullable<ReturnType<typeof clienteServicio>>;

/** Lo que una fuente recibe de la entidad: solo lo necesario para buscarla. */
export type EntidadConsulta = {
  id: string;
  organizacion_id: string;
  encargo_id: string;
  tipo: string;
  nombre: string;
  nombre_normalizado: string;
  /** RFC y CURP solo si tienen formato válido. */
  rfc: string | null;
  curp: string | null;
};

export type Coincidencia = {
  /** Identidad estable del hallazgo en la fuente: volver a consultar actualiza, no duplica. */
  huella: string;
  /** Por RFC o CURP: exacta. Por nombre: propuesta, hasta que un auditor la confirme. */
  coincidencia: "exacta" | "propuesta";
  datos: { resumen: string } & Record<string, Json>;
};

export type FuenteActiva = {
  id: string;
  nombre: string;
  tipo: string;
  conector: string;
  config: Record<string, unknown>;
};

/**
 * Conector de una fuente de consulta (§11.1). `enviaDatos`: la consulta sale de la plataforma
 * (una API de terceros). Esos conectores solo corren en los encargos que el administrador permitió
 * en la configuración de la fuente (regla 7).
 */
export interface ConectorFuente {
  conector: string;
  enviaDatos: boolean;
  /** Qué tipos de entidad tiene sentido buscar en esta fuente. */
  aplica(entidad: EntidadConsulta): boolean;
  buscar(
    ctx: { servicio: Servicio; fuente: FuenteActiva },
    entidad: EntidadConsulta,
  ): Promise<Coincidencia[]>;
}
