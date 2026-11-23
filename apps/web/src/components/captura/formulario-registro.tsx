"use client";

import { formatoPorcentaje } from "@sigma/modelo";
import {
  CAMPOS_COMUNES,
  MONEDAS,
  NOMBRE_ROL,
  NOMBRE_TIPO_INVOLUCRADO,
  ROLES_INVOLUCRADO,
  TIPOS_INVOLUCRADO,
  type CampoEsperado,
  type EntradaCaptura,
  type Involucrado,
} from "@sigma/importador/captura";
import { useId, useRef, useState, useTransition } from "react";
import { abrirCalendario } from "@/lib/calendario";

export type TipoParaCaptura = {
  id: string;
  nombre: string;
  categoria: string;
  campos: CampoEsperado[];
  /** Campos comunes ajustados a este tipo (renombrados u ocultos, §6). */
  comunes: CampoEsperado[];
};
export type EntidadConocida = { nombre: string; tipo: string; rfc: string | null };
type Resultado =
  | { ok: true; registroId: string }
  | { ok: false; mensaje: string; errores?: Record<string, string> };
type FilaInvolucrado = Required<Pick<Involucrado, "tipo" | "nombre" | "rol">> & {
  rfc: string;
  curp: string;
  /** Aportación al capital, tal como se escribe (solo socios). */
  aportacion: string;
  /** Número de acciones o partes sociales (solo socios). */
  acciones: string;
  clave: number;
  /** Validación: la lectura de la IA de la que viene (p. ej. `involucrado_2`). */
  campoIa?: string;
};

/** Lo que propuso la IA para un campo: se muestra junto al control al validar. */
export type Anotacion = { confianza: number; pagina: number | null; porRevisar: boolean };
/** Valores con los que arranca el formulario (validación de una lectura de la IA). */
export type InicialRegistro = {
  tipoId: string;
  expedienteId: string;
  moneda: (typeof MONEDAS)[number];
  valores: Record<string, string>;
  involucrados: Omit<FilaInvolucrado, "clave">[];
};

function TextoAnotacion({ a }: { a: Anotacion }) {
  return (
    <span className={a.porRevisar ? "text-oro" : "text-tenue"}>
      IA · {formatoPorcentaje(a.confianza)}
      {a.pagina ? ` · pág. ${a.pagina}` : ""} · {a.porRevisar ? "por revisar" : "sobre el umbral"}
    </span>
  );
}

const claseControl =
  "w-full rounded-md border border-linea-2 bg-fondo-2 px-3 py-2 text-sm text-texto focus:border-oro focus:outline-none aria-invalid:border-peligro";
const tiposInvolucrado: readonly string[] = TIPOS_INVOLUCRADO;

function ErrorCampo({ texto }: { texto?: string }) {
  return texto ? <span className="text-xs text-peligro">{texto}</span> : null;
}

/**
 * Formulario de registro único (§6): campos comunes, los del tipo de documento e involucrados
 * repetibles con autocompletado contra las entidades del encargo. La validación ocurre en el
 * servidor (`guardar`). Se reutiliza en la tarea 09 para validar extracciones.
 */
export function FormularioRegistro({
  encargoId,
  tipos,
  expedientes,
  entidades,
  guardar,
  alGuardar,
  textoGuardar = "Guardar captura",
  inicial,
  anotaciones,
  alEnfocar,
  acciones,
}: {
  encargoId: string;
  tipos: TipoParaCaptura[];
  expedientes: { id: string; nombre: string }[];
  entidades: EntidadConocida[];
  guardar: (entrada: EntradaCaptura) => Promise<Resultado>;
  alGuardar: (registroId: string) => void;
  textoGuardar?: string;
  /** Con `inicial` el formulario valida una lectura de la IA: tipo fijo y sin fuente declarada. */
  inicial?: InicialRegistro;
  /** Por clave de campo o de lectura (`involucrado_N`). */
  anotaciones?: Record<string, Anotacion>;
  /** Se llama al enfocar un campo anotado, para llevar el documento a su página. */
  alEnfocar?: (anotacion: Anotacion) => void;
  /** Acciones adicionales junto al botón de guardar. */
  acciones?: React.ReactNode;
}) {
  const validando = Boolean(inicial);
  const idLista = useId();
  const [tipoId, setTipoId] = useState(inicial?.tipoId ?? "");
  const [expedienteId, setExpedienteId] = useState(inicial?.expedienteId ?? "");
  const [fuente, setFuente] = useState("");
  const [moneda, setMoneda] = useState<(typeof MONEDAS)[number]>(inicial?.moneda ?? "MXN");
  const [valores, setValores] = useState<Record<string, string>>(inicial?.valores ?? {});
  const [involucrados, setInvolucrados] = useState<FilaInvolucrado[]>(
    () => inicial?.involucrados.map((f, i) => ({ ...f, clave: i + 1 })) ?? [],
  );
  const [consecutivo, setConsecutivo] = useState((inicial?.involucrados.length ?? 0) + 1);
  const formulario = useRef<HTMLFormElement>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, iniciar] = useTransition();

  const tipo = tipos.find((t) => t.id === tipoId);
  const errores = resultado && !resultado.ok ? (resultado.errores ?? {}) : {};
  const categorias = [...new Set(tipos.map((t) => t.categoria))];

  const cambiarInvolucrado = (clave: number, cambio: Partial<FilaInvolucrado>) =>
    setInvolucrados((lista) => lista.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)));

  /** Al elegir una entidad conocida se completan su tipo y su RFC. */
  const alEscribirNombre = (fila: FilaInvolucrado, nombre: string) => {
    const conocida = entidades.find((e) => e.nombre.toUpperCase() === nombre.trim().toUpperCase());
    cambiarInvolucrado(fila.clave, {
      nombre,
      ...(conocida && tiposInvolucrado.includes(conocida.tipo)
        ? { tipo: conocida.tipo as FilaInvolucrado["tipo"], rfc: fila.rfc || (conocida.rfc ?? "") }
        : {}),
    });
  };

  const enviar = () =>
    iniciar(async () => {
      const r = await guardar({
        encargoId,
        tipoDocumentoId: tipoId,
        expedienteId: expedienteId || null,
        fuente,
        moneda,
        valores,
        involucrados: involucrados.map(
          ({ tipo, nombre, rol, rfc, curp, aportacion, acciones, campoIa }) => ({
            tipo,
            nombre,
            rol,
            rfc,
            curp,
            aportacion: rol === "socio" ? aportacion : "",
            acciones: rol === "socio" ? acciones : "",
            ...(campoIa ? { campoIa } : {}),
          }),
        ),
      });
      setResultado(r);
      if (r.ok) alGuardar(r.registroId);
    });

  /** Atajos de validación: Ctrl/⌘+Enter valida; Alt+↓/↑ va al siguiente o anterior campo por revisar. */
  const alTeclear = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (!validando) return;
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      enviar();
      return;
    }
    if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      const lista = [
        ...(formulario.current?.querySelectorAll<HTMLElement>("[data-por-revisar='true']") ?? []),
      ];
      if (!lista.length) return;
      e.preventDefault();
      const i = lista.indexOf(document.activeElement as HTMLElement);
      const paso = e.key === "ArrowDown" ? 1 : -1;
      lista[(i + paso + lista.length) % lista.length]?.focus();
    }
  };

  const campo = (c: CampoEsperado) => {
    const error = errores[`valores.${c.clave}`];
    const nota = anotaciones?.[c.clave];
    const leido = inicial?.valores[c.clave] ?? "";
    const actual = valores[c.clave] ?? "";
    const comunes = {
      id: `${idLista}-${c.clave}`,
      value: actual,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": nota ? `${idLista}-${c.clave}-ia` : undefined,
      "data-por-revisar": nota?.porRevisar ? "true" : undefined,
      onFocus: nota && alEnfocar ? () => alEnfocar(nota) : undefined,
      className: `${claseControl} ${nota?.porRevisar ? "border-oro-tenue" : ""}`,
    };
    const cambiar = (v: string) => setValores((x) => ({ ...x, [c.clave]: v }));
    return (
      <div
        key={c.clave}
        className={`flex flex-col gap-1 ${c.tipo === "texto_largo" ? "md:col-span-2" : ""}`}
      >
        <label htmlFor={comunes.id} className="text-xs text-tenue">
          {c.etiqueta}
          {c.requerido ? " *" : ""}
        </label>
        {c.tipo === "texto_largo" ? (
          <textarea
            {...comunes}
            rows={c.clave === "objeto_social" || c.clave === "facultades" ? 8 : 3}
            maxLength={20000}
            onChange={(e) => cambiar(e.target.value)}
          />
        ) : c.tipo === "monto" && c.clave === "monto" ? (
          <div className="flex gap-2">
            <input
              {...comunes}
              inputMode="decimal"
              placeholder="0.00"
              onChange={(e) => cambiar(e.target.value)}
            />
            <select
              aria-label="Moneda"
              value={moneda}
              onChange={(e) => setMoneda(e.target.value as (typeof MONEDAS)[number])}
              className={`${claseControl} w-24`}
            >
              {MONEDAS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
        ) : (
          <input
            {...comunes}
            type={c.tipo === "fecha" ? "date" : "text"}
            inputMode={c.tipo === "monto" || c.tipo === "numero" ? "decimal" : undefined}
            maxLength={c.tipo === "fecha" ? undefined : 400}
            onChange={(e) => cambiar(e.target.value)}
            onClick={c.tipo === "fecha" ? abrirCalendario : undefined}
          />
        )}
        {nota ? (
          <p
            id={`${idLista}-${c.clave}-ia`}
            className="flex flex-wrap items-center gap-x-2 text-xs"
          >
            <TextoAnotacion a={nota} />
            <span className="text-tenue">
              {actual.trim() === ""
                ? "· Se rechaza"
                : actual.trim() === leido.trim()
                  ? "· Se acepta"
                  : `· Se corrige (la IA leyó «${leido}»)`}
            </span>
            {actual.trim() === "" || actual.trim() !== leido.trim() ? (
              <button
                type="button"
                onClick={() => cambiar(leido)}
                className="text-azul-claro underline"
                aria-label={`Restaurar ${c.etiqueta}`}
              >
                Restaurar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => cambiar("")}
                className="text-azul-claro underline"
                aria-label={`Rechazar ${c.etiqueta}`}
              >
                Rechazar
              </button>
            )}
          </p>
        ) : null}
        <ErrorCampo texto={error} />
      </div>
    );
  };

  return (
    <form
      ref={formulario}
      noValidate
      onKeyDown={alTeclear}
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
      className="flex flex-col gap-6"
    >
      <fieldset className="rounded-lg border border-linea bg-panel p-4">
        <legend className="px-1 text-sm font-semibold text-texto">Clasificación</legend>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idLista}-tipo`} className="text-xs text-tenue">
              Tipo de documento *
            </label>
            <select
              id={`${idLista}-tipo`}
              value={tipoId}
              disabled={validando}
              onChange={(e) => setTipoId(e.target.value)}
              aria-invalid={errores.tipoDocumentoId ? true : undefined}
              className={claseControl}
            >
              <option value="">Elige…</option>
              {categorias.map((cat) => (
                <optgroup key={cat} label={cat}>
                  {tipos
                    .filter((t) => t.categoria === cat)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <ErrorCampo texto={errores.tipoDocumentoId} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idLista}-expediente`} className="text-xs text-tenue">
              Expediente
            </label>
            <select
              id={`${idLista}-expediente`}
              value={expedienteId}
              onChange={(e) => setExpedienteId(e.target.value)}
              className={claseControl}
            >
              <option value="">Sin expediente</option>
              {expedientes.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
          </div>
          {validando ? null : (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idLista}-fuente`} className="text-xs text-tenue">
                Fuente declarada *
              </label>
              <input
                id={`${idLista}-fuente`}
                value={fuente}
                maxLength={200}
                placeholder="Quién lo dijo o de dónde se tomó"
                onChange={(e) => setFuente(e.target.value)}
                aria-invalid={errores.fuente ? true : undefined}
                className={claseControl}
              />
              <ErrorCampo texto={errores.fuente} />
            </div>
          )}
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-linea bg-panel p-4">
        <legend className="px-1 text-sm font-semibold text-texto">Datos del documento</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {(tipo?.comunes ?? CAMPOS_COMUNES).map(campo)}
        </div>
        {tipo?.campos.length ? (
          <>
            <h3 className="mt-5 mb-2 text-xs tracking-wide text-oro uppercase">{tipo.nombre}</h3>
            <div className="grid gap-3 md:grid-cols-2">{tipo.campos.map(campo)}</div>
          </>
        ) : null}
      </fieldset>

      <fieldset className="rounded-lg border border-linea bg-panel p-4">
        <legend className="px-1 text-sm font-semibold text-texto">Involucrados</legend>
        <datalist id={`${idLista}-entidades`}>
          {entidades.map((e) => (
            <option key={`${e.tipo}-${e.nombre}`} value={e.nombre} />
          ))}
        </datalist>
        {involucrados.length === 0 ? (
          <p className="text-sm text-tenue">
            Agrega a las personas, empresas o dependencias que aparecen.
          </p>
        ) : (
          <ol className="grid gap-3 lg:grid-cols-2" aria-label="Involucrados">
            {involucrados.map((f, i) => {
              const n = i + 1;
              const error = errores[`involucrados.${i}.nombre`];
              const errorAportacion = errores[`involucrados.${i}.aportacion`];
              const errorAcciones = errores[`involucrados.${i}.acciones`];
              const nota = f.campoIa ? anotaciones?.[f.campoIa] : undefined;
              const id = `${idLista}-inv-${f.clave}`;
              const etiqueta = "mb-1 block text-xs text-tenue";
              return (
                <li
                  key={f.clave}
                  onFocus={nota && alEnfocar ? () => alEnfocar(nota) : undefined}
                  className={`rounded-md border bg-fondo-2/40 p-3 ${nota?.porRevisar ? "border-oro-tenue" : "border-linea-2"}`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-texto">Involucrado {n}</span>
                    {validando ? (
                      nota ? (
                        <TextoAnotacion a={nota} />
                      ) : (
                        <span className="text-tenue">Agregado por ti</span>
                      )
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        setInvolucrados((lista) => lista.filter((x) => x.clave !== f.clave))
                      }
                      aria-label={`Quitar involucrado ${n}`}
                      className="ml-auto rounded-md border border-linea-2 px-2 py-1 text-xs text-tenue hover:text-texto"
                    >
                      Quitar
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label htmlFor={`${id}-nombre`} className={etiqueta}>
                        Nombre o razón social
                      </label>
                      <input
                        id={`${id}-nombre`}
                        aria-label={`Nombre del involucrado ${n}`}
                        list={`${idLista}-entidades`}
                        value={f.nombre}
                        maxLength={200}
                        onChange={(e) => alEscribirNombre(f, e.target.value)}
                        aria-invalid={error ? true : undefined}
                        data-por-revisar={nota?.porRevisar ? "true" : undefined}
                        className={`${claseControl} ${nota?.porRevisar ? "border-oro-tenue" : ""}`}
                      />
                      <ErrorCampo texto={error} />
                    </div>
                    <div>
                      <label htmlFor={`${id}-tipo`} className={etiqueta}>
                        Tipo
                      </label>
                      <select
                        id={`${id}-tipo`}
                        aria-label={`Tipo del involucrado ${n}`}
                        value={f.tipo}
                        onChange={(e) =>
                          cambiarInvolucrado(f.clave, {
                            tipo: e.target.value as FilaInvolucrado["tipo"],
                          })
                        }
                        className={claseControl}
                      >
                        {TIPOS_INVOLUCRADO.map((t) => (
                          <option key={t} value={t}>
                            {NOMBRE_TIPO_INVOLUCRADO[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`${id}-rol`} className={etiqueta}>
                        Rol
                      </label>
                      <select
                        id={`${id}-rol`}
                        aria-label={`Rol del involucrado ${n}`}
                        value={f.rol}
                        onChange={(e) =>
                          cambiarInvolucrado(f.clave, {
                            rol: e.target.value as FilaInvolucrado["rol"],
                          })
                        }
                        className={claseControl}
                      >
                        {ROLES_INVOLUCRADO.map((r) => (
                          <option key={r} value={r}>
                            {NOMBRE_ROL[r]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`${id}-rfc`} className={etiqueta}>
                        RFC
                      </label>
                      <input
                        id={`${id}-rfc`}
                        aria-label={`RFC del involucrado ${n}`}
                        value={f.rfc}
                        maxLength={20}
                        onChange={(e) =>
                          cambiarInvolucrado(f.clave, { rfc: e.target.value.toUpperCase() })
                        }
                        className={claseControl}
                      />
                    </div>
                    {f.tipo === "persona_fisica" ? (
                      <div>
                        <label htmlFor={`${id}-curp`} className={etiqueta}>
                          CURP
                        </label>
                        <input
                          id={`${id}-curp`}
                          aria-label={`CURP del involucrado ${n}`}
                          value={f.curp}
                          maxLength={20}
                          onChange={(e) =>
                            cambiarInvolucrado(f.clave, { curp: e.target.value.toUpperCase() })
                          }
                          className={claseControl}
                        />
                      </div>
                    ) : null}
                    {f.rol === "socio" ? (
                      <div>
                        <label htmlFor={`${id}-aportacion`} className={etiqueta}>
                          Aportación ({moneda})
                        </label>
                        <input
                          id={`${id}-aportacion`}
                          aria-label={`Aportación del involucrado ${n}`}
                          inputMode="decimal"
                          placeholder="0.00"
                          value={f.aportacion}
                          maxLength={40}
                          onChange={(e) =>
                            cambiarInvolucrado(f.clave, { aportacion: e.target.value })
                          }
                          aria-invalid={errorAportacion ? true : undefined}
                          className={claseControl}
                        />
                        <ErrorCampo texto={errorAportacion} />
                      </div>
                    ) : null}
                    {f.rol === "socio" ? (
                      <div>
                        <label htmlFor={`${id}-acciones`} className={etiqueta}>
                          Número de acciones
                        </label>
                        <input
                          id={`${id}-acciones`}
                          aria-label={`Acciones del involucrado ${n}`}
                          inputMode="numeric"
                          placeholder="0"
                          value={f.acciones}
                          maxLength={40}
                          onChange={(e) =>
                            cambiarInvolucrado(f.clave, { acciones: e.target.value })
                          }
                          aria-invalid={errorAcciones ? true : undefined}
                          className={claseControl}
                        />
                        <ErrorCampo texto={errorAcciones} />
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <button
          type="button"
          onClick={() => {
            setInvolucrados((lista) => [
              ...lista,
              {
                clave: consecutivo,
                tipo: "persona_moral",
                nombre: "",
                rol: "proveedor",
                rfc: "",
                curp: "",
                aportacion: "",
                acciones: "",
              },
            ]);
            setConsecutivo((n) => n + 1);
          }}
          className="mt-3 rounded-md border border-linea-2 px-3 py-1.5 text-sm text-texto hover:border-oro"
        >
          Agregar involucrado
        </button>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-md bg-oro px-4 py-2 text-sm font-medium text-fondo hover:bg-oro-suave disabled:opacity-60"
        >
          {enviando ? "Guardando…" : textoGuardar}
        </button>
        {acciones}
        {resultado && !resultado.ok ? (
          <p role="alert" className="text-sm text-peligro">
            {resultado.mensaje}
          </p>
        ) : null}
      </div>
    </form>
  );
}
