"use client";

import { EXTENSIONES_ACEPTADAS, MAX_BYTES_DOCUMENTO, tipoPorNombre } from "@sigma/modelo";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type DragEvent } from "react";
import { prepararSubida, registrarDocumento, revisarDuplicados } from "@/acciones/ingreso";
import { clienteNavegador } from "@/lib/supabase/navegador";

type Opcion = { id: string; nombre: string };
type Clasificacion = {
  tipoDocumentoId: string;
  expediente: string;
  expedienteNuevo: string;
  fuente: string;
};
type Estado =
  | "calculando"
  | "listo"
  | "duplicado"
  | "invalido"
  | "subiendo"
  | "registrando"
  | "hecho"
  | "rechazado"
  | "error";
type Elemento = Clasificacion & {
  clave: string;
  archivo: File;
  sha256: string | null;
  estado: Estado;
  mensaje: string;
};

const NUEVO = "__nuevo__";
const VACIA: Clasificacion = {
  tipoDocumentoId: "",
  expediente: "",
  expedienteNuevo: "",
  fuente: "",
};
const claseControl =
  "w-full rounded-md border border-linea-2 bg-fondo-2 px-2 py-1.5 text-sm text-texto focus:border-oro focus:outline-none disabled:opacity-60";

const ETIQUETA: Record<Estado, string> = {
  calculando: "Calculando huella…",
  listo: "Listo para subir",
  duplicado: "Duplicado",
  invalido: "No se puede subir",
  subiendo: "Subiendo…",
  registrando: "Verificando en el servidor…",
  hecho: "Registrado",
  rechazado: "Rechazado",
  error: "Error",
};
const TONO: Record<Estado, string> = {
  calculando: "text-tenue",
  listo: "text-azul-claro",
  duplicado: "text-oro",
  invalido: "text-peligro",
  subiendo: "text-tenue",
  registrando: "text-tenue",
  hecho: "text-ok",
  rechazado: "text-peligro",
  error: "text-peligro",
};

async function huella(archivo: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await archivo.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function tamano(bytes: number) {
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function Clasificar({
  valor,
  cambiar,
  tipos,
  expedientes,
  sufijo,
  deshabilitado,
}: {
  valor: Clasificacion;
  cambiar: (c: Partial<Clasificacion>) => void;
  tipos: { categoria: string; tipos: Opcion[] }[];
  expedientes: Opcion[];
  sufijo: string;
  deshabilitado?: boolean;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <label className="flex flex-col gap-1 text-xs text-tenue">
        Tipo de documento
        <select
          aria-label={`Tipo de documento ${sufijo}`}
          value={valor.tipoDocumentoId}
          onChange={(e) => cambiar({ tipoDocumentoId: e.target.value })}
          disabled={deshabilitado}
          className={claseControl}
        >
          <option value="">Elige…</option>
          {tipos.map((g) => (
            <optgroup key={g.categoria} label={g.categoria}>
              {g.tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-1">
        <label className="flex flex-col gap-1 text-xs text-tenue">
          Expediente
          <select
            aria-label={`Expediente ${sufijo}`}
            value={valor.expediente}
            onChange={(e) => cambiar({ expediente: e.target.value })}
            disabled={deshabilitado}
            className={claseControl}
          >
            <option value="">Elige…</option>
            <option value={NUEVO}>Nuevo expediente…</option>
            {expedientes.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </select>
        </label>
        {valor.expediente === NUEVO ? (
          <input
            aria-label={`Identificador del expediente nuevo ${sufijo}`}
            placeholder="Identificador del expediente"
            value={valor.expedienteNuevo}
            maxLength={120}
            onChange={(e) => cambiar({ expedienteNuevo: e.target.value })}
            disabled={deshabilitado}
            className={claseControl}
          />
        ) : null}
      </div>
      <label className="flex flex-col gap-1 text-xs text-tenue">
        Fuente
        <input
          aria-label={`Fuente ${sufijo}`}
          placeholder="Quién lo entregó o de dónde salió"
          value={valor.fuente}
          maxLength={200}
          onChange={(e) => cambiar({ fuente: e.target.value })}
          disabled={deshabilitado}
          className={claseControl}
        />
      </label>
    </div>
  );
}

const completa = (c: Clasificacion) =>
  !!c.tipoDocumentoId &&
  !!c.fuente.trim() &&
  (c.expediente === NUEVO ? !!c.expedienteNuevo.trim() : !!c.expediente);

export function ZonaIngreso({
  encargoId,
  tipos,
  expedientes,
}: {
  encargoId: string;
  tipos: { categoria: string; tipos: Opcion[] }[];
  expedientes: Opcion[];
}) {
  const router = useRouter();
  const idArchivos = useId();
  const [elementos, setElementos] = useState<Elemento[]>([]);
  const [lote, setLote] = useState<Clasificacion>(VACIA);
  const [encima, setEncima] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");
  const consecutivo = useRef(0);

  const actualizar = (clave: string, cambio: Partial<Elemento>) =>
    setElementos((lista) => lista.map((e) => (e.clave === clave ? { ...e, ...cambio } : e)));

  async function agregar(archivos: File[]) {
    if (!archivos.length) return;
    setAviso("");
    const nuevos: Elemento[] = archivos.map((archivo) => {
      const tipo = tipoPorNombre(archivo.name);
      const problema = !tipo
        ? "Tipo de archivo no aceptado."
        : archivo.size === 0
          ? "El archivo está vacío."
          : archivo.size > MAX_BYTES_DOCUMENTO
            ? "Supera 50 MB."
            : "";
      return {
        ...lote,
        clave: `a${++consecutivo.current}`,
        archivo,
        sha256: null,
        estado: problema ? "invalido" : "calculando",
        mensaje: problema,
      };
    });
    setElementos((lista) => [...lista, ...nuevos]);

    // Huella en el navegador (Web Crypto) para detectar duplicados antes de subir.
    const calculados: { clave: string; sha256: string }[] = [];
    for (const e of nuevos) {
      if (e.estado !== "calculando") continue;
      try {
        calculados.push({ clave: e.clave, sha256: await huella(e.archivo) });
      } catch {
        actualizar(e.clave, { estado: "error", mensaje: "No se pudo leer el archivo." });
      }
    }
    if (!calculados.length) return;
    const existentes = await revisarDuplicados({
      encargoId,
      huellas: [...new Set(calculados.map((c) => c.sha256))],
    });
    const yaEnBase = new Map(existentes.map((d) => [d.sha256, d.nombre]));
    setElementos((lista) => {
      const vistas = new Set(lista.filter((e) => e.sha256).map((e) => e.sha256 as string));
      return lista.map((e) => {
        const c = calculados.find((x) => x.clave === e.clave);
        if (!c) return e;
        if (yaEnBase.has(c.sha256))
          return {
            ...e,
            sha256: c.sha256,
            estado: "duplicado",
            mensaje: `Ya existe en este encargo como «${yaEnBase.get(c.sha256)}».`,
          };
        if (vistas.has(c.sha256))
          return {
            ...e,
            sha256: c.sha256,
            estado: "duplicado",
            mensaje: "Es el mismo archivo que otro de esta lista.",
          };
        vistas.add(c.sha256);
        return { ...e, sha256: c.sha256, estado: "listo", mensaje: "" };
      });
    });
  }

  async function subir() {
    const pendientes = elementos.filter((e) => e.estado === "listo" && e.sha256);
    if (!pendientes.length) return;
    const incompletos = pendientes.filter((e) => !completa(e));
    if (incompletos.length) {
      setAviso(`Falta tipo, expediente o fuente en ${incompletos.length} archivo(s).`);
      return;
    }
    setAviso("");
    setOcupado(true);
    let registrados = 0;
    const supabase = clienteNavegador();
    for (const e of pendientes) {
      const sha256 = e.sha256 as string;
      actualizar(e.clave, { estado: "subiendo", mensaje: "" });
      const subida = await prepararSubida({
        encargoId,
        sha256,
        nombre: e.archivo.name,
        tamano: e.archivo.size,
      });
      if (!subida.ok) {
        actualizar(e.clave, { estado: "error", mensaje: subida.mensaje });
        continue;
      }
      if (subida.token) {
        const { error } = await supabase.storage
          .from("originales")
          .uploadToSignedUrl(subida.ruta, subida.token, e.archivo, { contentType: subida.mime });
        if (error && !/exist|duplicate/i.test(error.message)) {
          actualizar(e.clave, { estado: "error", mensaje: "No se pudo subir. Intenta de nuevo." });
          continue;
        }
      }
      actualizar(e.clave, { estado: "registrando" });
      const r = await registrarDocumento({
        encargoId,
        sha256,
        nombre: e.archivo.name,
        tipoDocumentoId: e.tipoDocumentoId,
        expedienteId: e.expediente === NUEVO ? null : e.expediente,
        expedienteNuevo: e.expediente === NUEVO ? e.expedienteNuevo.trim() : null,
        fuente: e.fuente.trim(),
      });
      if (r.ok) {
        registrados++;
        actualizar(e.clave, { estado: "hecho", mensaje: "Registro pendiente de validación." });
      } else {
        actualizar(e.clave, {
          estado: r.rechazado ? "rechazado" : r.duplicado ? "duplicado" : "error",
          mensaje: r.mensaje,
        });
      }
    }
    setOcupado(false);
    setAviso(`${registrados} de ${pendientes.length} documento(s) registrados.`);
    router.refresh();
  }

  const soltar = (ev: DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    setEncima(false);
    void agregar([...ev.dataTransfer.files]);
  };
  const listos = elementos.filter((e) => e.estado === "listo").length;

  return (
    <div className="flex flex-col gap-5">
      <div
        onDragOver={(ev) => {
          ev.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={soltar}
        className={`rounded-lg border-2 border-dashed px-6 py-8 text-center ${encima ? "border-oro bg-panel-2" : "border-linea-2"}`}
      >
        <label htmlFor={idArchivos} className="cursor-pointer text-sm text-texto">
          Arrastra aquí los archivos o <span className="text-oro underline">elígelos</span>
        </label>
        <input
          id={idArchivos}
          type="file"
          multiple
          accept={EXTENSIONES_ACEPTADAS}
          aria-label="Archivos"
          className="sr-only"
          disabled={ocupado}
          onChange={(ev) => {
            void agregar([...(ev.target.files ?? [])]);
            ev.target.value = "";
          }}
        />
        <p className="mt-2 text-xs text-tenue">
          PDF, imágenes, Excel o correos (.eml, .msg). Hasta 50 MB por archivo.
        </p>
      </div>

      <fieldset className="rounded-lg border border-linea bg-panel p-4">
        <legend className="px-1 text-sm font-semibold text-texto">
          Pre-clasificación del lote
        </legend>
        <Clasificar
          valor={lote}
          cambiar={(c) => setLote((l) => ({ ...l, ...c }))}
          tipos={tipos}
          expedientes={expedientes}
          sufijo="del lote"
          deshabilitado={ocupado}
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={ocupado || !elementos.length}
            onClick={() =>
              setElementos((lista) =>
                lista.map((e) =>
                  e.estado === "listo" || e.estado === "calculando" ? { ...e, ...lote } : e,
                ),
              )
            }
            className="rounded-md border border-linea-2 px-3 py-1.5 text-sm text-texto hover:border-oro disabled:opacity-50"
          >
            Aplicar a todos
          </button>
          <span className="text-xs text-tenue">
            Los archivos que agregues después toman estos valores.
          </span>
        </div>
      </fieldset>

      {elementos.length ? (
        <ul aria-label="Archivos por subir" className="flex flex-col gap-3">
          {elementos.map((e) => {
            const editable = (e.estado === "listo" || e.estado === "calculando") && !ocupado;
            return (
              <li key={e.clave} className="rounded-lg border border-linea bg-panel p-4">
                <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-sm font-medium text-texto">{e.archivo.name}</span>
                  <span className="text-xs text-tenue">{tamano(e.archivo.size)}</span>
                  {e.sha256 ? (
                    <span className="font-mono text-xs text-tenue-2">{e.sha256.slice(0, 12)}…</span>
                  ) : null}
                  <span className={`text-xs ${TONO[e.estado]}`} role="status">
                    {ETIQUETA[e.estado]}
                    {e.mensaje ? ` · ${e.mensaje}` : ""}
                  </span>
                  {editable ? (
                    <button
                      type="button"
                      onClick={() =>
                        setElementos((lista) => lista.filter((x) => x.clave !== e.clave))
                      }
                      className="ml-auto text-xs text-tenue hover:text-texto"
                      aria-label={`Quitar ${e.archivo.name}`}
                    >
                      Quitar
                    </button>
                  ) : null}
                </div>
                {e.estado === "listo" ||
                e.estado === "calculando" ||
                e.estado === "subiendo" ||
                e.estado === "registrando" ? (
                  <Clasificar
                    valor={e}
                    cambiar={(c) => actualizar(e.clave, c)}
                    tipos={tipos}
                    expedientes={expedientes}
                    sufijo={`de ${e.archivo.name}`}
                    deshabilitado={!editable}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void subir()}
          disabled={ocupado || listos === 0}
          className="rounded-md bg-oro px-3.5 py-2 text-sm font-medium text-fondo hover:bg-oro-suave disabled:opacity-50"
        >
          {ocupado ? "Subiendo…" : `Subir ${listos || ""} documento(s)`.replace("  ", " ")}
        </button>
        {elementos.some((e) => e.estado !== "listo" && e.estado !== "calculando") && !ocupado ? (
          <button
            type="button"
            onClick={() =>
              setElementos((lista) =>
                lista.filter((e) => e.estado === "listo" || e.estado === "calculando"),
              )
            }
            className="text-sm text-tenue hover:text-texto"
          >
            Limpiar terminados
          </button>
        ) : null}
        {aviso ? (
          <p role="status" className="text-sm text-texto" data-testid="aviso-ingreso">
            {aviso}
          </p>
        ) : null}
      </div>
    </div>
  );
}
