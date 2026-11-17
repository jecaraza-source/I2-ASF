"use client";

import { useState } from "react";

/** Ícono elegido a mano para una entidad: un emoji y su nombre. */
export type IconoManual = { e: string; l: string };

/**
 * Paleta de íconos, con las categorías del prototipo (legacy/). Son constantes de la aplicación:
 * nada de aquí viene de archivos ni de la base.
 */
export const PALETA: Record<string, IconoManual[]> = {
  Personas: [
    { e: "👤", l: "Persona" },
    { e: "👥", l: "Grupo" },
    { e: "🕵️", l: "Investigado" },
    { e: "👮", l: "Autoridad" },
    { e: "🧑‍💼", l: "Funcionario" },
    { e: "👩‍⚖️", l: "Juez" },
    { e: "🤵", l: "Abogado" },
    { e: "🧑‍🔬", l: "Perito" },
    { e: "🎭", l: "Alias" },
    { e: "🧛", l: "Testaferro" },
  ],
  Finanzas: [
    { e: "🏦", l: "Banco" },
    { e: "💰", l: "Efectivo" },
    { e: "💳", l: "Tarjeta" },
    { e: "💵", l: "Dólar" },
    { e: "💸", l: "Transferencia" },
    { e: "🧾", l: "Cheque o factura" },
    { e: "📈", l: "Inversión" },
    { e: "💼", l: "Préstamo" },
    { e: "🏝️", l: "Paraíso fiscal" },
    { e: "🏴", l: "Cuenta oculta" },
  ],
  Organizaciones: [
    { e: "🏢", l: "Empresa" },
    { e: "🏛️", l: "Institución" },
    { e: "🏭", l: "Fábrica" },
    { e: "🏗️", l: "Constructora" },
    { e: "🤝", l: "Sociedad" },
    { e: "⚖️", l: "Notaría" },
    { e: "🌐", l: "Offshore" },
    { e: "🎪", l: "Fachada" },
    { e: "🏠", l: "Inmobiliaria" },
    { e: "🛒", l: "Comercio" },
  ],
  Documentos: [
    { e: "📄", l: "Documento" },
    { e: "📋", l: "Contrato" },
    { e: "📁", l: "Expediente" },
    { e: "📜", l: "Escritura" },
    { e: "📊", l: "Estado financiero" },
    { e: "✉️", l: "Comunicación" },
    { e: "📑", l: "Poder notarial" },
    { e: "📰", l: "Prensa" },
  ],
  Telecomunicaciones: [
    { e: "📱", l: "Celular" },
    { e: "📞", l: "Teléfono fijo" },
    { e: "💻", l: "Computadora" },
    { e: "📧", l: "Correo" },
    { e: "📡", l: "Antena" },
    { e: "🖥️", l: "Servidor" },
  ],
  Vehículos: [
    { e: "🚗", l: "Automóvil" },
    { e: "🚙", l: "Camioneta" },
    { e: "🚛", l: "Camión" },
    { e: "✈️", l: "Avión" },
    { e: "🚁", l: "Helicóptero" },
    { e: "🚢", l: "Barco" },
    { e: "🛥️", l: "Yate" },
  ],
  Ubicaciones: [
    { e: "📍", l: "Ubicación" },
    { e: "🏠", l: "Domicilio" },
    { e: "🏚️", l: "Propiedad" },
    { e: "🏙️", l: "Ciudad" },
    { e: "🌍", l: "País" },
    { e: "🚪", l: "Frontera" },
  ],
  Marcas: [
    { e: "⚠️", l: "Alerta" },
    { e: "🚨", l: "Posible delito" },
    { e: "🔍", l: "En investigación" },
    { e: "🎯", l: "Objetivo" },
    { e: "⭐", l: "Relevante" },
    { e: "🔴", l: "Crítico" },
    { e: "🟡", l: "Sospechoso" },
    { e: "🟢", l: "Confirmado" },
    { e: "❓", l: "Desconocido" },
    { e: "📌", l: "Fijado" },
  ],
};

const VALIDOS = new Map(
  Object.values(PALETA)
    .flat()
    .map((i) => [i.e, i]),
);

/** Emoji como imagen (data URI) para el fondo del nodo en Cytoscape. */
export function imagenEmoji(emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><text x="24" y="26" font-size="30" text-anchor="middle" dominant-baseline="middle">${emoji}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const clave = (encargoId: string) => `sigma:iconos:${encargoId}`;

/**
 * Íconos elegidos a mano, por encargo. Son una preferencia de presentación de este navegador: no
 * tocan la evidencia ni la base. Solo se aceptan íconos de la paleta.
 */
export function leerIconos(encargoId: string): Record<string, IconoManual> {
  try {
    const crudo: unknown = JSON.parse(window.localStorage.getItem(clave(encargoId)) ?? "{}");
    if (!crudo || typeof crudo !== "object") return {};
    const limpio: Record<string, IconoManual> = {};
    for (const [id, e] of Object.entries(crudo)) {
      const icono = typeof e === "string" ? VALIDOS.get(e) : undefined;
      if (icono) limpio[id] = icono;
    }
    return limpio;
  } catch {
    return {};
  }
}

export function guardarIconos(encargoId: string, iconos: Record<string, IconoManual>) {
  try {
    const compacto = Object.fromEntries(Object.entries(iconos).map(([id, i]) => [id, i.e]));
    window.localStorage.setItem(clave(encargoId), JSON.stringify(compacto));
  } catch {
    // Sin almacenamiento (modo privado): los íconos duran lo que dure la página.
  }
}

const claseItem =
  "block w-full rounded px-3 py-1.5 text-left text-sm text-texto hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-oro";

export type AccionMenu = { clave: string; texto: string };

/** Menú contextual de la red (clic derecho sobre una entidad o sobre el fondo). */
export function MenuContextual({
  x,
  y,
  titulo,
  acciones,
  alElegir,
  alCerrar,
}: {
  x: number;
  y: number;
  titulo: string | null;
  acciones: AccionMenu[];
  alElegir: (clave: string) => void;
  alCerrar: () => void;
}) {
  return (
    <div
      role="menu"
      aria-label="Acciones de la red"
      className="absolute z-20 min-w-52 rounded-lg border border-linea-2 bg-panel p-1 shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
      style={{ left: x, top: y }}
      onKeyDown={(e) => {
        if (e.key === "Escape") alCerrar();
      }}
    >
      {titulo ? (
        <p className="truncate border-b border-linea px-3 py-1.5 text-xs text-tenue">{titulo}</p>
      ) : null}
      {acciones.map((a) => (
        <button
          key={a.clave}
          type="button"
          role="menuitem"
          className={claseItem}
          onClick={() => {
            alCerrar();
            alElegir(a.clave);
          }}
        >
          {a.texto}
        </button>
      ))}
    </div>
  );
}

/** Paleta para elegir el ícono de una entidad. */
export function PaletaIconos({
  entidad,
  actual,
  alElegir,
  alRestablecer,
  alCerrar,
}: {
  entidad: string;
  actual: IconoManual | null;
  alElegir: (i: IconoManual) => void;
  alRestablecer: () => void;
  alCerrar: () => void;
}) {
  const categorias = Object.keys(PALETA);
  const [categoria, setCategoria] = useState(categorias[0] as string);
  return (
    <section
      aria-label="Paleta de íconos"
      className="rounded-lg border border-oro-tenue bg-panel p-3 text-xs"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-oro">Ícono de la entidad</h2>
          <p className="text-tenue">{entidad}</p>
        </div>
        <button
          type="button"
          onClick={alCerrar}
          className="rounded px-2 py-1 text-tenue hover:text-texto focus-visible:outline-2 focus-visible:outline-oro"
        >
          Cerrar
        </button>
      </div>
      <div role="tablist" aria-label="Categorías de íconos" className="mb-2 flex flex-wrap gap-1">
        {categorias.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={c === categoria}
            onClick={() => setCategoria(c)}
            className="rounded-md border border-linea-2 px-2 py-1 text-texto hover:border-oro focus-visible:outline-2 focus-visible:outline-oro aria-selected:border-oro aria-selected:text-oro"
          >
            {c}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1 sm:grid-cols-10">
        {(PALETA[categoria] ?? []).map((i) => (
          <button
            key={i.e}
            type="button"
            title={i.l}
            aria-label={i.l}
            aria-pressed={actual?.e === i.e}
            onClick={() => alElegir(i)}
            className="flex flex-col items-center gap-0.5 rounded-md border border-linea px-1 py-1.5 hover:border-oro focus-visible:outline-2 focus-visible:outline-oro aria-pressed:border-oro aria-pressed:bg-panel-2"
          >
            <span className="text-xl" aria-hidden>
              {i.e}
            </span>
            <span className="w-full truncate text-center text-[10px] text-tenue">{i.l}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-tenue-2">
          El ícono es solo de presentación y se guarda en este navegador. No cambia la evidencia.
        </p>
        {actual ? (
          <button
            type="button"
            onClick={alRestablecer}
            className="rounded-md border border-linea-2 px-2 py-1 text-texto hover:border-oro focus-visible:outline-2 focus-visible:outline-oro"
          >
            Volver al ícono automático
          </button>
        ) : null}
      </div>
    </section>
  );
}
