"use client";

import { recorridoPorClave } from "@sigma/modelo";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Nombre de cada tramo de la ruta. `enlace: false` = no tiene página propia. */
const TRAMOS: Record<string, { texto: string; enlace?: boolean }> = {
  encargos: { texto: "Encargos" },
  nuevo: { texto: "Nuevo" },
  nueva: { texto: "Nueva" },
  editar: { texto: "Editar" },
  expedientes: { texto: "Expedientes" },
  importaciones: { texto: "Importación de Excel" },
  red: { texto: "Red de vínculos" },
  vista: { texto: "Vista de la red" },
  alertas: { texto: "Alertas" },
  ingreso: { texto: "Ingreso", enlace: false },
  importar: { texto: "Ingreso de documentos" },
  exportar: { texto: "Exportar" },
  capturar: { texto: "Captura manual" },
  documentos: { texto: "Documentos", enlace: false },
  registros: { texto: "Registros" },
  entidades: { texto: "Entidades", enlace: false },
  tipos: { texto: "Tipos de documento", enlace: false },
  categorias: { texto: "Categorías", enlace: false },
  configuracion: { texto: "Configuración" },
  ia: { texto: "Uso de IA" },
  usuarios: { texto: "Usuarios y accesos" },
  recorridos: { texto: "Recorridos guiados" },
  organizacion: { texto: "Organización" },
};

type Migaja = { ruta: string; texto: string; enlace: boolean };

export function migajas(pathname: string): Migaja[] {
  const partes = pathname.split("/").filter(Boolean);
  return partes.map((p, i) => {
    const ruta = `/${partes.slice(0, i + 1).join("/")}`;
    if (UUID.test(p)) {
      const texto = partes[i - 1] === "encargos" ? "Encargo" : "Detalle";
      return { ruta, texto, enlace: true };
    }
    if (partes[i - 1] === "recorridos") {
      return { ruta, texto: recorridoPorClave(p)?.nombre ?? "Recorrido", enlace: true };
    }
    const t = TRAMOS[p];
    return { ruta, texto: t?.texto ?? p, enlace: t?.enlace !== false };
  });
}

/**
 * Barra de navegación: regresar a la pantalla anterior y ruta de dónde estás. Los textos salen de
 * la ruta (constantes de arriba), nunca de datos del encargo.
 */
export function BarraNavegacion() {
  const pathname = usePathname();
  const router = useRouter();
  const ruta = migajas(pathname);
  if (pathname === "/encargos" || !ruta.length) return null;
  const anterior =
    [...ruta]
      .slice(0, -1)
      .reverse()
      .find((m) => m.enlace)?.ruta ?? "/encargos";

  const regresar = () => {
    // Si se llegó por un enlace directo no hay historial dentro de la plataforma: sube un nivel.
    if (window.history.length > 1) router.back();
    else router.push(anterior);
  };

  return (
    <nav
      aria-label="Navegación"
      className="flex flex-none flex-wrap items-center gap-2 border-b border-linea bg-fondo-2 px-3 py-2 text-xs md:gap-3 md:px-6"
    >
      <button
        type="button"
        onClick={regresar}
        className="inline-flex items-center gap-1.5 rounded-md border border-linea-2 px-3 py-1.5 text-sm font-medium text-texto hover:border-oro hover:text-oro focus-visible:outline-2 focus-visible:outline-oro"
      >
        <span aria-hidden>←</span> Regresar
      </button>
      <Link
        href={anterior}
        className="hidden rounded-md border border-linea-2 px-3 py-1.5 text-sm text-tenue hover:border-oro sm:inline-block hover:text-texto focus-visible:outline-2 focus-visible:outline-oro"
      >
        <span aria-hidden>↑</span> Subir un nivel
      </Link>
      <ol className="flex flex-wrap items-center gap-1 text-tenue">
        {ruta.map((m, i) => (
          <li key={m.ruta} className="flex items-center gap-1">
            {i ? (
              <span aria-hidden className="text-tenue-2">
                ›
              </span>
            ) : null}
            {i === ruta.length - 1 ? (
              <span aria-current="page" className="text-oro">
                {m.texto}
              </span>
            ) : m.enlace ? (
              <Link href={m.ruta} className="text-azul-claro hover:underline">
                {m.texto}
              </Link>
            ) : (
              <span>{m.texto}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
