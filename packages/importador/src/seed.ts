/**
 * Genera supabase/seed_plantillas.sql a partir de plantillas/*.json.
 * Sin imports: se ejecuta también con `node` (type stripping) desde scripts/.
 */
export const ORGANIZACION_DE_PRUEBA = "b0000000-0000-4000-8000-000000000001";

type PlantillaJson = { nombre: string; firma_hojas: unknown; mapeo: unknown };

export function generarSqlPlantillas(
  plantillas: PlantillaJson[],
  organizacionId = ORGANIZACION_DE_PRUEBA,
): string {
  const lineas = [
    "-- Generado por packages/importador (pnpm --filter @sigma/importador plantillas:seed).",
    "-- No editar a mano: la fuente son packages/importador/plantillas/*.json.",
    "",
  ];
  for (const p of [...plantillas].sort((a, b) => a.nombre.localeCompare(b.nombre))) {
    const firma = JSON.stringify(p.firma_hojas);
    const mapeo = JSON.stringify(p.mapeo);
    if (firma.includes("$plantilla$") || mapeo.includes("$plantilla$")) {
      throw new Error("La plantilla contiene el delimitador reservado $plantilla$");
    }
    lineas.push(
      "insert into public.plantilla_importacion (organizacion_id, nombre, firma_hojas, mapeo)",
      `values ('${organizacionId}', '${p.nombre.replace(/'/g, "''")}',`,
      `  $plantilla$${firma}$plantilla$::jsonb,`,
      `  $plantilla$${mapeo}$plantilla$::jsonb);`,
      "",
    );
  }
  return lineas.join("\n");
}
