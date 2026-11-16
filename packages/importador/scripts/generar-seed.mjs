// Regenera supabase/seed_plantillas.sql desde plantillas/*.json.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generarSqlPlantillas } from "../src/seed.ts";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(raiz, "plantillas");
const plantillas = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
const destino = join(raiz, "..", "..", "supabase", "seed_plantillas.sql");
writeFileSync(destino, generarSqlPlantillas(plantillas));
console.log(`Escrito ${destino} (${plantillas.length} plantillas)`);
