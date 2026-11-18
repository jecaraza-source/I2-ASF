import { formatoNumero } from "@sigma/modelo";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { extremosEvento } from "./csv";
import { disponer } from "./disposicion";
import { FONDO_FORMATO_JPG, FONDO_PORTADA_JPG } from "./plantilla";
import { NOMBRE_NIVEL, NOMBRE_TIPO_ENTIDAD, type NivelExport, type RedExport } from "./tipos";

/** Página de la plantilla del prototipo: 254 × 190.5 mm en horizontal = 720 × 540 pt. */
const W = 720;
const H = 540;
const M = 42;
/** Debajo del encabezado de la plantilla (logo y leyenda). */
const ARRIBA = H - 100;

const AZUL = rgb(10 / 255, 30 / 255, 80 / 255);
const AZUL_TENUE = rgb(85 / 255, 115 / 255, 165 / 255);
const GRIS = rgb(100 / 255, 120 / 255, 165 / 255);
const ORO = rgb(212 / 255, 175 / 255, 55 / 255);
const BLANCO = rgb(1, 1, 1);

/** Colores de riesgo del prototipo. */
const COLOR_NIVEL: Record<NivelExport, RGB> = {
  critico: rgb(198 / 255, 90 / 255, 74 / 255),
  alto: rgb(200 / 255, 128 / 255, 40 / 255),
  medio: rgb(180 / 255, 145 / 255, 30 / 255),
  bajo: rgb(65 / 255, 140 / 255, 90 / 255),
};

export type MetaReporte = {
  folio: string;
  /** Fecha y hora legibles (ya en hora de México). */
  fecha: string;
  autor: string;
  organizacion: string;
  /** SHA-256 de `datosCanonicos(red)`. */
  sha256: string;
  /** Texto canónico que se adjunta al PDF como datos.json. */
  datos: string;
  /** Fecha de creación del PDF (metadatos). */
  creado: Date;
};

const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

/** Helvetica estándar solo codifica WinAnsi: lo demás se aproxima o se reemplaza. */
export function textoSeguro(t: string): string {
  let r = "";
  for (const ch of String(t).replace(/[\r\n\t]+/g, " ")) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.includes(ch)) {
      r += ch;
      continue;
    }
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    r +=
      base &&
      [...base].every((b) => (b.codePointAt(0) ?? 0) >= 0x20 && (b.codePointAt(0) ?? 0) <= 0x7e)
        ? base
        : "?";
  }
  return r;
}

type Fuentes = { normal: PDFFont; negrita: PDFFont };

function recortar(t: string, fuente: PDFFont, tam: number, ancho: number): string {
  let s = textoSeguro(t);
  if (fuente.widthOfTextAtSize(s, tam) <= ancho) return s;
  while (s.length > 1 && fuente.widthOfTextAtSize(`${s}…`, tam) > ancho) s = s.slice(0, -1);
  return `${s}…`;
}

/** Parte un texto en líneas que caben en `ancho`; corta con «…» si excede `max` líneas. */
function envolver(t: string, fuente: PDFFont, tam: number, ancho: number, max: number): string[] {
  const palabras = textoSeguro(t).split(" ").filter(Boolean);
  const lineas: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (fuente.widthOfTextAtSize(prueba, tam) <= ancho) {
      actual = prueba;
      continue;
    }
    if (actual) lineas.push(actual);
    actual = recortar(p, fuente, tam, ancho);
    if (lineas.length === max) break;
  }
  if (actual && lineas.length < max) lineas.push(actual);
  if (
    lineas.length > max ||
    (lineas.length === max && palabras.join(" ").length > lineas.join(" ").length)
  ) {
    lineas.length = max;
    lineas[max - 1] = recortar(`${lineas[max - 1]} …`, fuente, tam, ancho);
  }
  return lineas;
}

function texto(
  pagina: PDFPage,
  t: string,
  x: number,
  y: number,
  o: { fuente: PDFFont; tam: number; color?: RGB; alinear?: "izq" | "centro" | "der" },
) {
  const s = textoSeguro(t);
  const ancho = o.fuente.widthOfTextAtSize(s, o.tam);
  const px = o.alinear === "centro" ? x - ancho / 2 : o.alinear === "der" ? x - ancho : x;
  pagina.drawText(s, { x: px, y, size: o.tam, font: o.fuente, color: o.color ?? AZUL });
}

const EVENTO_PLURAL: Record<string, string> = {
  transferencia: "transferencias",
  llamada: "llamadas",
  contrato: "contratos",
};

/**
 * Reporte PDF con la plantilla institucional, generado en servidor con pdf-lib (sin navegador).
 * Portada, resumen, red, entidades con nivel y criterios, alertas. Al pie de cada página: folio,
 * fecha, autor y SHA-256 de los datos exportados; esos datos van adjuntos como datos.json.
 */
export async function reportePdf(red: RedExport, meta: MetaReporte): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(textoSeguro(`Reporte de red · ${red.encargo.nombre}`));
  doc.setAuthor(textoSeguro(meta.autor));
  doc.setSubject(`SHA-256 ${meta.sha256}`);
  doc.setKeywords([meta.folio, meta.sha256]);
  doc.setCreator("SIGMA");
  doc.setProducer("SIGMA · @sigma/i2-export");
  doc.setCreationDate(meta.creado);
  doc.setModificationDate(meta.creado);
  await doc.attach(new TextEncoder().encode(meta.datos), "datos.json", {
    mimeType: "application/json",
    description: `Datos exportados. SHA-256 ${meta.sha256}`,
    creationDate: meta.creado,
    modificationDate: meta.creado,
  });

  const f: Fuentes = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    negrita: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const portada = await doc.embedJpg(
    Uint8Array.from(atob(FONDO_PORTADA_JPG), (c) => c.charCodeAt(0)),
  );
  const formato = await doc.embedJpg(
    Uint8Array.from(atob(FONDO_FORMATO_JPG), (c) => c.charCodeAt(0)),
  );

  const alcance =
    red.alcance.tipo === "expediente"
      ? `Expediente ${red.alcance.identificador}`
      : "Red completa del encargo";
  const enRed = new Set(red.entidades.map((e) => e.id));
  const nombreDe = new Map(red.entidades.map((e) => [e.id, e.nombre]));
  const paginas: PDFPage[] = [];
  const nueva = (fondo: PDFImage) => {
    const p = doc.addPage([W, H]);
    p.drawImage(fondo, { x: 0, y: 0, width: W, height: H });
    paginas.push(p);
    return p;
  };
  const tituloPagina = (p: PDFPage, t: string, sub?: string) => {
    texto(p, t, W / 2, ARRIBA, { fuente: f.negrita, tam: 14, alinear: "centro" });
    if (sub)
      texto(p, sub, W / 2, ARRIBA - 14, {
        fuente: f.normal,
        tam: 8,
        color: AZUL_TENUE,
        alinear: "centro",
      });
    p.drawLine({
      start: { x: M + 30, y: ARRIBA - 22 },
      end: { x: W - M - 30, y: ARRIBA - 22 },
      thickness: 1,
      color: ORO,
    });
    return ARRIBA - 36;
  };

  // 1 · Portada
  const p1 = nueva(portada);
  texto(p1, "REPORTE DE RED DE VÍNCULOS", W / 2, 150, {
    fuente: f.negrita,
    tam: 24,
    alinear: "centro",
  });
  texto(p1, recortar(red.encargo.nombre, f.normal, 11, W - 2 * M), W / 2, 128, {
    fuente: f.normal,
    tam: 11,
    color: AZUL_TENUE,
    alinear: "centro",
  });
  p1.drawLine({
    start: { x: M + 90, y: 116 },
    end: { x: W - M - 90, y: 116 },
    thickness: 1.6,
    color: ORO,
  });
  texto(p1, `${alcance} · Folio ${meta.folio}`, W / 2, 100, {
    fuente: f.normal,
    tam: 9,
    color: AZUL_TENUE,
    alinear: "centro",
  });
  texto(p1, meta.fecha, W / 2, 86, {
    fuente: f.normal,
    tam: 9,
    color: AZUL_TENUE,
    alinear: "centro",
  });

  // 2 · Resumen
  const p2 = nueva(formato);
  let y = tituloPagina(p2, "RESUMEN DEL ENCARGO", meta.fecha);
  const campo = (etiqueta: string, valor: string, x: number, yy: number) => {
    texto(p2, etiqueta.toUpperCase(), x, yy, { fuente: f.negrita, tam: 6.5, color: GRIS });
    texto(p2, recortar(valor, f.normal, 10, W / 2 - M - 20), x, yy - 13, {
      fuente: f.normal,
      tam: 10,
    });
  };
  const col2 = W / 2 + 10;
  campo("Encargo", red.encargo.nombre, M + 10, y);
  campo("Alcance", alcance, col2, y);
  y -= 34;
  campo("Organización", meta.organizacion, M + 10, y);
  campo("Folio", meta.folio, col2, y);
  y -= 34;
  campo("Exportó", meta.autor, M + 10, y);
  campo("Generación de la red", red.red.generada_en, col2, y);
  y -= 30;
  p2.drawLine({ start: { x: M + 30, y }, end: { x: W - M - 30, y }, thickness: 0.8, color: ORO });
  y -= 14;
  texto(p2, "RESUMEN ESTADÍSTICO", W / 2, y, {
    fuente: f.negrita,
    tam: 8,
    color: GRIS,
    alinear: "centro",
  });
  y -= 14;
  const cuenta = (n: NivelExport) => red.entidades.filter((e) => e.nivel === n).length;
  const abiertas = red.alertas.filter((a) => a.estado === "abierta").length;
  const kpis: { v: number; l: string; c: RGB }[] = [
    { v: red.entidades.length, l: "Entidades", c: rgb(30 / 255, 90 / 255, 165 / 255) },
    { v: cuenta("critico"), l: "Nivel crítico", c: COLOR_NIVEL.critico },
    { v: cuenta("alto"), l: "Nivel alto", c: COLOR_NIVEL.alto },
    { v: red.vinculos.length, l: "Vínculos", c: rgb(55 / 255, 110 / 255, 190 / 255) },
    { v: red.eventos.length, l: "Eventos", c: rgb(55 / 255, 135 / 255, 85 / 255) },
    { v: abiertas, l: "Alertas abiertas", c: rgb(140 / 255, 80 / 255, 165 / 255) },
  ];
  const kw = (W - 2 * M) / kpis.length - 6;
  kpis.forEach((k, i) => {
    const kx = M + i * (kw + 6);
    p2.drawRectangle({
      x: kx,
      y: y - 70,
      width: kw,
      height: 70,
      color: rgb(240 / 255, 245 / 255, 1),
      borderColor: k.c,
      borderWidth: 1.4,
    });
    texto(p2, formatoNumero(k.v), kx + kw / 2, y - 38, {
      fuente: f.negrita,
      tam: 24,
      color: k.c,
      alinear: "centro",
    });
    texto(p2, k.l, kx + kw / 2, y - 56, {
      fuente: f.normal,
      tam: 7.5,
      color: AZUL_TENUE,
      alinear: "centro",
    });
  });
  y -= 96;
  const porTipo = new Map<string, number>();
  for (const e of red.eventos) porTipo.set(e.tipo, (porTipo.get(e.tipo) ?? 0) + 1);
  if (porTipo.size) {
    texto(
      p2,
      `Eventos: ${[...porTipo].map(([t, n]) => `${n} ${n === 1 ? t : (EVENTO_PLURAL[t] ?? t)}`).join(" · ")}`,
      W / 2,
      y,
      { fuente: f.normal, tam: 8.5, color: AZUL_TENUE, alinear: "centro" },
    );
  }

  // 3 · Red
  const p3 = nueva(formato);
  y = tituloPagina(
    p3,
    "RED DE VÍNCULOS",
    `${formatoNumero(red.entidades.length)} entidades · ${formatoNumero(red.vinculos.length)} vínculos · ${formatoNumero(red.eventos.length)} eventos`,
  );
  const GX = M;
  const GW = W - 2 * M;
  const GH = y - 70;
  const GY = 70;
  p3.drawRectangle({
    x: GX,
    y: GY,
    width: GW,
    height: GH,
    color: rgb(250 / 255, 252 / 255, 1),
    borderColor: rgb(175 / 255, 198 / 255, 230 / 255),
    borderWidth: 0.8,
  });
  // Las más relevantes primero; arriba de 400 el dibujo deja de leerse.
  const dibujadas = [...red.entidades]
    .sort((a, b) => b.puntaje - a.puntaje || a.id.localeCompare(b.id))
    .slice(0, 400);
  const ids = dibujadas.map((e) => e.id).sort();
  const aristas: [string, string][] = [
    ...red.vinculos.map((v) => [v.origen_id, v.destino_id] as [string, string]),
    ...red.eventos.flatMap((e) => {
      const ext = extremosEvento(e, enRed);
      return ext ? [[ext[0].entidad_id, ext[1].entidad_id] as [string, string]] : [];
    }),
  ];
  const pos = disponer(ids, aristas);
  const pad = 20;
  const aPunto = (id: string) => {
    const q = pos.get(id);
    return q
      ? { x: GX + pad + q.x * (GW - 2 * pad), y: GY + pad + (1 - q.y) * (GH - 2 * pad) }
      : null;
  };
  for (const e of red.eventos) {
    const ext = extremosEvento(e, enRed);
    const a = ext && aPunto(ext[0].entidad_id);
    const b = ext && aPunto(ext[1].entidad_id);
    if (a && b)
      p3.drawLine({
        start: a,
        end: b,
        thickness: 0.4,
        color: rgb(65 / 255, 150 / 255, 95 / 255),
        dashArray: [2, 2],
        opacity: 0.7,
      });
  }
  for (const v of red.vinculos) {
    const a = aPunto(v.origen_id);
    const b = aPunto(v.destino_id);
    if (a && b)
      p3.drawLine({
        start: a,
        end: b,
        thickness: 0.4 + Math.min(v.fuerza ?? 3, 10) * 0.12,
        color: rgb(90 / 255, 120 / 255, 190 / 255),
        opacity: 0.8,
      });
  }
  const radio = dibujadas.length > 150 ? 2.5 : dibujadas.length > 60 ? 3.5 : 5;
  const conEtiqueta = dibujadas.length <= 60;
  for (const e of dibujadas) {
    const q = aPunto(e.id);
    if (!q) continue;
    const c = COLOR_NIVEL[e.nivel];
    if (e.tipo === "persona_moral" || e.tipo === "dependencia") {
      p3.drawRectangle({
        x: q.x - radio,
        y: q.y - radio,
        width: radio * 2,
        height: radio * 2,
        color: c,
        borderColor: BLANCO,
        borderWidth: 0.4,
      });
    } else {
      p3.drawCircle({
        x: q.x,
        y: q.y,
        size: radio,
        color: c,
        borderColor: BLANCO,
        borderWidth: 0.4,
      });
    }
    if (conEtiqueta) {
      texto(p3, recortar(e.nombre, f.normal, 5, 90), q.x, q.y - radio - 6, {
        fuente: f.normal,
        tam: 5,
        color: AZUL,
        alinear: "centro",
      });
    }
  }
  if (red.entidades.length > dibujadas.length) {
    texto(
      p3,
      `Se dibujan las ${formatoNumero(dibujadas.length)} entidades de mayor puntaje de ${formatoNumero(red.entidades.length)}.`,
      W / 2,
      GY + 6,
      { fuente: f.normal, tam: 6.5, color: GRIS, alinear: "centro" },
    );
  }
  let lx = M;
  texto(p3, "NIVEL:", lx, 56, { fuente: f.negrita, tam: 7, color: GRIS });
  lx += 30;
  for (const n of ["critico", "alto", "medio", "bajo"] as const) {
    p3.drawCircle({ x: lx + 3, y: 58.5, size: 3, color: COLOR_NIVEL[n] });
    texto(p3, NOMBRE_NIVEL[n], lx + 9, 56, { fuente: f.normal, tam: 7, color: AZUL_TENUE });
    lx += 50;
  }
  texto(
    p3,
    "Cuadro: persona moral o dependencia · Círculo: otras · Línea continua: vínculo · Punteada: evento",
    lx + 10,
    56,
    { fuente: f.normal, tam: 7, color: AZUL_TENUE },
  );

  // 4 · Entidades con nivel y criterios
  const columnasE = [
    { t: "ENTIDAD", w: 190 },
    { t: "TIPO", w: 80 },
    { t: "NIVEL", w: 50 },
    { t: "PUNTAJE", w: 45 },
    { t: "CRITERIOS", w: W - 2 * M - 365 },
  ];
  const ordenadas = [...red.entidades].sort(
    (a, b) => b.puntaje - a.puntaje || a.nombre.localeCompare(b.nombre),
  );
  tabla(() => nueva(formato), f, {
    titulo: "ENTIDADES CON NIVEL Y CRITERIOS",
    sub: `${formatoNumero(ordenadas.length)} entidades, de mayor a menor puntaje`,
    columnas: columnasE,
    vacio: "Sin entidades en la red.",
    filas: ordenadas.map((e) => ({
      color: COLOR_NIVEL[e.nivel],
      celdas: [
        [e.nombre, e.rfc ? `RFC ${e.rfc}` : ""].filter(Boolean),
        [NOMBRE_TIPO_ENTIDAD[e.tipo] ?? e.tipo],
        [NOMBRE_NIVEL[e.nivel]],
        [formatoNumero(e.puntaje)],
        e.criterios.length
          ? [
              e.criterios.map((c) => `${c.detalle} (+${c.aporte})`).join("; ") +
                (e.ajuste_motivo ? ` · Ajuste: ${e.ajuste_motivo}` : ""),
            ]
          : [e.ajuste_motivo ? `Ajuste: ${e.ajuste_motivo}` : "Sin criterios activados"],
      ],
    })),
    tituloPagina,
  });

  // 5 · Alertas
  const sev: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 };
  const alertas = [...red.alertas].sort(
    (a, b) =>
      (sev[a.severidad] ?? 9) - (sev[b.severidad] ?? 9) ||
      a.regla.localeCompare(b.regla) ||
      a.id.localeCompare(b.id),
  );
  const colorSev: Record<string, RGB> = {
    critica: COLOR_NIVEL.critico,
    alta: COLOR_NIVEL.alto,
    media: COLOR_NIVEL.medio,
    baja: COLOR_NIVEL.bajo,
  };
  tabla(() => nueva(formato), f, {
    titulo: "ALERTAS",
    sub: `${formatoNumero(alertas.length)} alerta(s) sobre entidades de la red · ${formatoNumero(abiertas)} abierta(s)`,
    columnas: [
      { t: "REGLA", w: 40 },
      { t: "SEVERIDAD", w: 60 },
      { t: "ESTADO", w: 65 },
      { t: "ALERTA", w: 300 },
      { t: "ENTIDADES", w: W - 2 * M - 465 },
    ],
    vacio: "Sin alertas sobre las entidades de la red.",
    filas: alertas.map((a) => ({
      color: colorSev[a.severidad] ?? GRIS,
      celdas: [
        [a.regla],
        [a.severidad],
        [a.estado],
        [a.titulo],
        [
          a.entidades
            .map((id) => nombreDe.get(id))
            .filter(Boolean)
            .join("; "),
        ],
      ],
    })),
    tituloPagina,
  });

  // Pie de página: folio, fecha, autor y SHA-256 en todas menos la portada.
  const total = paginas.length;
  paginas.forEach((p, i) => {
    if (i === 0) return;
    texto(p, `${i + 1} / ${total}`, W - M, 12, {
      fuente: f.negrita,
      tam: 7,
      color: GRIS,
      alinear: "der",
    });
    texto(p, `Folio ${meta.folio} · ${meta.fecha} · Exportó: ${meta.autor}`, M, 22, {
      fuente: f.normal,
      tam: 6.5,
      color: GRIS,
    });
    texto(p, "CONFIDENCIAL · USO OFICIAL EXCLUSIVO", W - M, 22, {
      fuente: f.negrita,
      tam: 6.5,
      color: GRIS,
      alinear: "der",
    });
    texto(p, `SHA-256 de los datos exportados: ${meta.sha256}`, M, 12, {
      fuente: f.normal,
      tam: 6.5,
      color: GRIS,
    });
  });
  return doc.save();
}

type Tabla = {
  titulo: string;
  sub: string;
  columnas: { t: string; w: number }[];
  filas: { color: RGB; celdas: string[][] }[];
  vacio: string;
  tituloPagina: (p: PDFPage, t: string, sub?: string) => number;
};

function tabla(nuevaPagina: () => PDFPage, f: Fuentes, t: Tabla) {
  const TAM = 7;
  const INTER = 9;
  const ABAJO = 44;
  let y = 0;
  const encabezado = (continua: boolean): PDFPage => {
    const pagina = nuevaPagina();
    y = t.tituloPagina(pagina, continua ? `${t.titulo} (continúa)` : t.titulo, t.sub);
    pagina.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 14, color: AZUL });
    let x = M + 4;
    for (const c of t.columnas) {
      texto(pagina, c.t, x, y, { fuente: f.negrita, tam: 6.5, color: BLANCO });
      x += c.w;
    }
    y -= 16;
    return pagina;
  };
  let pagina = encabezado(false);
  if (!t.filas.length) {
    texto(pagina, t.vacio, W / 2, y - 20, {
      fuente: f.normal,
      tam: 9,
      color: GRIS,
      alinear: "centro",
    });
    return;
  }
  t.filas.forEach((fila, i) => {
    const lineas = fila.celdas.map((celda, j) => {
      const ancho = (t.columnas[j]?.w ?? 60) - 8;
      return celda.flatMap((parte, k) =>
        envolver(
          parte,
          k === 0 && j === 0 ? f.negrita : f.normal,
          TAM,
          ancho,
          j === t.columnas.length - 1 || j === 3 ? 4 : 2,
        ),
      );
    });
    const alto = Math.max(1, ...lineas.map((l) => l.length)) * INTER + 4;
    if (y - alto < ABAJO) pagina = encabezado(true);
    const p = pagina;
    if (i % 2 === 0)
      p.drawRectangle({
        x: M,
        y: y - alto + INTER - 1,
        width: W - 2 * M,
        height: alto,
        color: rgb(243 / 255, 247 / 255, 253 / 255),
        opacity: 0.85,
      });
    p.drawRectangle({ x: M, y: y - alto + INTER - 1, width: 2.5, height: alto, color: fila.color });
    let x = M + 4;
    lineas.forEach((ls, j) => {
      ls.forEach((l, k) =>
        texto(p, l, x, y - k * INTER, {
          fuente: j === 0 && k === 0 ? f.negrita : f.normal,
          tam: TAM,
          color: j === 2 ? fila.color : AZUL,
        }),
      );
      x += t.columnas[j]?.w ?? 60;
    });
    y -= alto;
  });
}
