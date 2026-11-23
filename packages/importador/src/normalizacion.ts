/**
 * Normalización de valores (docs/ESPECIFICACION.md §5). Funciones puras.
 * Los montos se representan como texto decimal con 2 decimales y signo,
 * para no perder precisión en JavaScript (numeric(18,2) en la base).
 */

export type Celda = string | number | boolean | Date | null;

// ---------------------------------------------------------------------------
// Texto y nombres
// ---------------------------------------------------------------------------

export function textoDe(c: Celda): string {
  if (c === null) return "";
  if (c instanceof Date) return c.toISOString();
  return String(c).trim();
}

export function sinAcentos(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const SUFIJOS_SOCIETARIOS = [
  "SAPI DE CV",
  "SAB DE CV",
  "SA DE CV",
  "S DE RL DE CV",
  "S DE RL",
  "SC DE RL",
  "SC",
  "SA",
  "LTD",
  "CORP",
  "LLC",
  "INC",
];

/**
 * Nombre normalizado: mayúsculas, sin acentos, sin puntuación de siglas,
 * sin dobles espacios y sin sufijos societarios al final (§5).
 */
export function normalizarNombre(nombre: string): string {
  let s = sinAcentos(nombre).toUpperCase();
  s = s.replace(/\./g, "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const sufijo of SUFIJOS_SOCIETARIOS) {
      if (s.endsWith(` ${sufijo}`)) {
        s = s.slice(0, -sufijo.length - 1).trim();
        cambio = true;
      }
    }
  }
  return s;
}

/** Encabezado comparable: sin acentos, mayúsculas y espacios simples. */
export function normalizarEncabezado(s: string): string {
  return sinAcentos(s).toUpperCase().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Montos
// ---------------------------------------------------------------------------

/**
 * Convierte un monto a texto decimal "-1234.50". Conserva signo y paréntesis
 * contables. Nunca borra caracteres a ciegas: si el texto no es un monto
 * reconocible devuelve null.
 */
export function normalizarMonto(c: Celda): string | null {
  if (c === null || c === "" || typeof c === "boolean" || c instanceof Date) return null;
  if (typeof c === "number") {
    if (!Number.isFinite(c)) return null;
    return c.toFixed(2);
  }
  let s = c.trim();
  if (!s) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/^(MXN|USD|EUR)\s*/i, "").replace(/\s*(MXN|USD|EUR|M\.N\.)$/i, "");
  if (s.startsWith("-")) {
    negativo = !negativo;
    s = s.slice(1).trim();
  }
  s = s.replace(/^\$\s*/, "");
  if (s.startsWith("-")) {
    negativo = !negativo;
    s = s.slice(1).trim();
  }
  // Formato mexicano: coma de miles y punto decimal.
  if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(s)) return null;
  return aDecimal(s.replace(/,/g, ""), negativo);
}

function aDecimal(digitos: string, negativo: boolean): string {
  const [entero = "0", fraccion = ""] = digitos.split(".");
  const centavos = (fraccion + "00").slice(0, 2);
  // Redondeo a 2 decimales con el tercer dígito.
  let resultado = `${BigInt(entero)}${centavos}`;
  if ((fraccion[2] ?? "0") >= "5") resultado = (BigInt(resultado) + 1n).toString();
  const valor = resultado.padStart(3, "0");
  const texto = `${valor.slice(0, -2)}.${valor.slice(-2)}`.replace(/^0+(?=\d)/, "");
  return negativo && /[1-9]/.test(texto) ? `-${texto}` : texto;
}

/** Suma de montos en texto decimal, exacta (centavos con BigInt). */
export function sumarMontos(montos: readonly (string | null)[]): string {
  let total = 0n;
  for (const m of montos) {
    if (m === null) continue;
    const negativo = m.startsWith("-");
    const [e = "0", f = "00"] = m.replace("-", "").split(".");
    const centavos = BigInt(e) * 100n + BigInt((f + "00").slice(0, 2));
    total += negativo ? -centavos : centavos;
  }
  const negativo = total < 0n;
  const abs = (negativo ? -total : total).toString().padStart(3, "0");
  return `${negativo ? "-" : ""}${abs.slice(0, -2)}.${abs.slice(-2)}`;
}

/**
 * Cifras dentro de texto libre: "$1,847,320,450.00 MXN", "$116.5M", "$38.5 MDP".
 * Devuelve los montos encontrados con su texto original.
 */
export function montosEnTexto(texto: string): { crudo: string; valor: string }[] {
  const resultado: { crudo: string; valor: string }[] = [];
  const patron = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*(MDP|millones|M(?![A-Za-z]))?/gi;
  for (const m of texto.matchAll(patron)) {
    const entero = (m[1] ?? "").replace(/,/g, "");
    const fraccion = m[2] ?? "";
    let valor = aDecimal(`${entero}${fraccion}`, false);
    if (m[3]) valor = multiplicarMillones(`${entero}${fraccion}`);
    resultado.push({ crudo: m[0].trim(), valor });
  }
  return resultado;
}

function multiplicarMillones(decimal: string): string {
  const [e = "0", f = ""] = decimal.split(".");
  const fraccion = (f + "000000").slice(0, 6);
  return `${BigInt(e + fraccion)}.00`;
}

/** Primer número de un texto como "9 (75%)" o "14 operaciones". */
export function primerNumero(texto: string): string | null {
  const m = /^\s*(-?\d{1,3}(?:,\d{3})+|-?\d+)(\.\d+)?/.exec(texto);
  if (!m) return null;
  return aDecimal(
    `${(m[1] ?? "").replace(/[-,]/g, "")}${m[2] ?? ""}`,
    (m[1] ?? "").startsWith("-"),
  );
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

/** Excel cuenta días desde 1899-12-30 (con el error histórico de 1900 ya incluido). */
export function serialExcelAIso(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

/** Fecha ISO 8601 (aaaa-mm-dd). `dd/mm/aaaa` se lee como formato mexicano. */
export function normalizarFecha(c: Celda): string | null {
  if (c === null || typeof c === "boolean") return null;
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : c.toISOString().slice(0, 10);
  if (typeof c === "number") return c > 0 && c < 2958466 ? serialExcelAIso(c) : null;
  const s = c.trim();
  let m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return fechaValida(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return fechaValida(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

function fechaValida(a: number, m: number, d: number): string | null {
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Hora "hh:mm[:ss]" o fracción de día de Excel → "hh:mm:ss". */
export function normalizarHora(c: Celda): string | null {
  if (c === null || typeof c === "boolean") return null;
  if (c instanceof Date) return c.toISOString().slice(11, 19);
  if (typeof c === "number") {
    if (c < 0 || c >= 1) return null;
    const seg = Math.round(c * 86400);
    return [Math.floor(seg / 3600), Math.floor((seg % 3600) / 60), seg % 60]
      .map((n) => String(n).padStart(2, "0"))
      .join(":");
  }
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(c.trim());
  if (!m) return null;
  const [h, mi, se] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (h > 23 || mi > 59 || se > 59) return null;
  return [h, mi, se].map((n) => String(n).padStart(2, "0")).join(":");
}

/**
 * Fecha y hora locales (zona del encargo) → ISO 8601 con desplazamiento.
 * Usa la base de zonas horarias del motor, así respeta los horarios de verano históricos.
 */
export function fechaHoraLocal(
  fecha: string,
  hora: string | null,
  zona = "America/Mexico_City",
): string {
  const h = hora ?? "00:00:00";
  const [a, m, d] = fecha.split("-").map(Number) as [number, number, number];
  const [hh, mi, ss] = h.split(":").map(Number) as [number, number, number];
  const comoUtc = Date.UTC(a, m - 1, d, hh, mi, ss);
  const desfase = desfaseMinutos(zona, comoUtc);
  const signo = desfase <= 0 ? "-" : "+";
  const abs = Math.abs(desfase);
  return `${fecha}T${h}${signo}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

function desfaseMinutos(zona: string, instanteUtc: number): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instanteUtc));
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value);
  const local = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  // Primera aproximación con el desfase en ese instante; suficiente fuera de la hora del cambio.
  return Math.round((local - instanteUtc) / 60000);
}

// ---------------------------------------------------------------------------
// Fuerza del vínculo
// ---------------------------------------------------------------------------

const FUERZA_TEXTO: Record<string, number> = { CRITICO: 9, ALTO: 7, MEDIO: 5, BAJO: 3 };

/** Escala 1–10 (§5). CRÍTICO=9, ALTO=7, MEDIO=5, BAJO=3. */
export function normalizarFuerza(c: Celda): number | null {
  if (c === null) return null;
  if (typeof c === "number") return Number.isInteger(c) && c >= 1 && c <= 10 ? c : null;
  const s = sinAcentos(String(c)).toUpperCase().trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n >= 1 && n <= 10 ? n : null;
  }
  return FUERZA_TEXTO[s] ?? null;
}

// ---------------------------------------------------------------------------
// Identificadores
// ---------------------------------------------------------------------------

const RFC = /^[A-ZÑ&]{3,4}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[A-Z0-9]{3}$/;
const CURP =
  /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9]\d$/;

export function esRfc(s: string): boolean {
  return RFC.test(s.toUpperCase().replace(/[\s-]/g, ""));
}

export function esCurp(s: string): boolean {
  return CURP.test(s.toUpperCase().trim());
}

/** CLABE: 18 dígitos con dígito verificador (pesos 3,7,1). */
export function esClabe(s: string): boolean {
  const d = s.replace(/\s/g, "");
  if (!/^\d{18}$/.test(d)) return false;
  const pesos = [3, 7, 1];
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += (Number(d[i]) * (pesos[i % 3] ?? 1)) % 10;
  return (10 - (suma % 10)) % 10 === Number(d[17]);
}

export type Identificadores = {
  rfc?: string;
  curp?: string;
  clabe?: string;
  id_fiscal?: string;
  telefono?: string;
  /** Identificadores presentes que no pasaron la validación de formato (§5). */
  invalidos?: string[];
};

/**
 * Agrega un identificador validando su formato. Si falla, se conserva y se
 * marca en `invalidos` (§5). `id_fiscal` acepta RFC o un identificador extranjero.
 */
const DIGITO_EN_PALABRA: Record<string, string> = {
  CERO: "0",
  UNO: "1",
  UNA: "1",
  UN: "1",
  DOS: "2",
  TRES: "3",
  CUATRO: "4",
  CINCO: "5",
  SEIS: "6",
  SIETE: "7",
  OCHO: "8",
  NUEVE: "9",
};
/** Palabras de relleno al dictar una clave: «guion», «letra», «número». */
const RELLENO_CLAVE = new Set(["GUION", "LETRA", "NUMERO", "NO", "DIGITO"]);

/**
 * Las escrituras notariales suelen escribir el RFC o la CURP con letra («SESV siete, tres, cero,
 * cuatro…»). Convierte cada dígito escrito con palabra a su número y une el resto; si no hay ningún
 * dígito en palabra, devuelve el texto tal cual (sin espacios ni guiones).
 */
export function claveDesdeTexto(crudo: string): string {
  const mayus = crudo
    .toUpperCase()
    .replace(/[ÁÀÄ]/g, "A")
    .replace(/[ÉÈË]/g, "E")
    .replace(/[ÍÌÏ]/g, "I")
    .replace(/[ÓÒÖ]/g, "O")
    .replace(/[ÚÙÜ]/g, "U")
    // Una etiqueta al inicio («R.F.C.:», «CURP») no es parte de la clave.
    .replace(/^\s*(R\.?\s*F\.?\s*C\.?|C\.?\s*U\.?\s*R\.?\s*P\.?)(\s*[:.-]\s*|\s+)/, "");
  const fichas = mayus.split(/[^A-ZÑ&0-9]+/).filter(Boolean);
  if (!fichas.some((f) => f in DIGITO_EN_PALABRA)) return mayus.replace(/[\s-]/g, "");
  const esDigito = (f: string | undefined) => f !== undefined && f in DIGITO_EN_PALABRA;
  return (
    fichas
      // «Y» entre dos dígitos en palabra es conjunción («cuatro y cinco»); en otro lugar es la letra.
      .filter(
        (f, i) =>
          !RELLENO_CLAVE.has(f) &&
          !(f === "Y" && esDigito(fichas[i - 1]) && esDigito(fichas[i + 1])),
      )
      .map((f) => DIGITO_EN_PALABRA[f] ?? f)
      .join("")
  );
}

/**
 * Número entero de un texto como «500», «1,500 acciones» o «quinientas (500)»: los dígitos del
 * primer grupo numérico. Null si no hay dígitos.
 */
export function normalizarEntero(texto: string): string | null {
  const grupo = texto.match(/\d{1,3}(?:[,.\s]\d{3})+(?!\d)|\d+/);
  if (!grupo) return null;
  const n = grupo[0].replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return n.length <= 15 ? n : null;
}

export function agregarIdentificador(
  ids: Identificadores,
  clase: "rfc" | "curp" | "clabe" | "id_fiscal",
  crudo: string,
): Identificadores {
  const limpio = crudo.trim().toUpperCase();
  if (!limpio || limpio === "N/A") return ids;
  const valor = clase === "rfc" || clase === "curp" ? claveDesdeTexto(limpio) : limpio;
  const r: Identificadores = { ...ids };
  const marcar = (c: string) => {
    r.invalidos = [...new Set([...(r.invalidos ?? []), c])];
  };
  switch (clase) {
    case "rfc":
      r.rfc = valor.replace(/[\s-]/g, "");
      if (!esRfc(valor)) marcar("rfc");
      break;
    case "curp":
      r.curp = valor;
      if (!esCurp(valor)) marcar("curp");
      break;
    case "clabe":
      r.clabe = valor.replace(/\s/g, "");
      if (!esClabe(valor)) marcar("clabe");
      break;
    case "id_fiscal":
      if (esRfc(valor)) r.rfc = valor.replace(/[\s-]/g, "");
      else r.id_fiscal = valor;
      break;
  }
  return r;
}

/** RFC utilizable para resolver entidades (presente y válido). */
export function rfcValido(ids: Identificadores): string | undefined {
  return ids.rfc && !ids.invalidos?.includes("rfc") ? ids.rfc : undefined;
}

// ---------------------------------------------------------------------------
// Celdas
// ---------------------------------------------------------------------------

/** Referencia A1 de una celda (fila y columna base 1). */
export function referenciaA1(fila: number, columna: number): string {
  let n = columna;
  let letras = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    letras = String.fromCharCode(65 + r) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return `${letras}${fila}`;
}
