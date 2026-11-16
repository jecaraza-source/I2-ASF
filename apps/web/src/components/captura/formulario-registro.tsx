"use client";

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
import { useId, useState, useTransition } from "react";

export type TipoParaCaptura = {
  id: string;
  nombre: string;
  categoria: string;
  campos: CampoEsperado[];
};
export type EntidadConocida = { nombre: string; tipo: string; rfc: string | null };
type Resultado =
  | { ok: true; registroId: string }
  | { ok: false; mensaje: string; errores?: Record<string, string> };
type FilaInvolucrado = Required<Pick<Involucrado, "tipo" | "nombre" | "rol">> & {
  rfc: string;
  curp: string;
  clave: number;
};

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
}: {
  encargoId: string;
  tipos: TipoParaCaptura[];
  expedientes: { id: string; nombre: string }[];
  entidades: EntidadConocida[];
  guardar: (entrada: EntradaCaptura) => Promise<Resultado>;
  alGuardar: (registroId: string) => void;
  textoGuardar?: string;
}) {
  const idLista = useId();
  const [tipoId, setTipoId] = useState("");
  const [expedienteId, setExpedienteId] = useState("");
  const [fuente, setFuente] = useState("");
  const [moneda, setMoneda] = useState<(typeof MONEDAS)[number]>("MXN");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [involucrados, setInvolucrados] = useState<FilaInvolucrado[]>([]);
  const [consecutivo, setConsecutivo] = useState(1);
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
        involucrados: involucrados.map(({ tipo, nombre, rol, rfc, curp }) => ({
          tipo,
          nombre,
          rol,
          rfc,
          curp,
        })),
      });
      setResultado(r);
      if (r.ok) alGuardar(r.registroId);
    });

  const campo = (c: CampoEsperado) => {
    const error = errores[`valores.${c.clave}`];
    const comunes = {
      id: `${idLista}-${c.clave}`,
      value: valores[c.clave] ?? "",
      "aria-invalid": error ? true : undefined,
      className: claseControl,
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
            rows={2}
            maxLength={4000}
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
          />
        )}
        <ErrorCampo texto={error} />
      </div>
    );
  };

  return (
    <form
      noValidate
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
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-linea bg-panel p-4">
        <legend className="px-1 text-sm font-semibold text-texto">Datos del documento</legend>
        <div className="grid gap-3 md:grid-cols-2">{CAMPOS_COMUNES.map(campo)}</div>
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
          <ol className="flex flex-col gap-3" aria-label="Involucrados">
            {involucrados.map((f, i) => {
              const n = i + 1;
              const error = errores[`involucrados.${i}.nombre`];
              return (
                <li
                  key={f.clave}
                  className="grid gap-2 md:grid-cols-[9rem_minmax(0,1fr)_12rem_10rem_10rem_auto]"
                >
                  <select
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
                  <div className="flex flex-col gap-1">
                    <input
                      aria-label={`Nombre del involucrado ${n}`}
                      placeholder="Nombre o razón social"
                      list={`${idLista}-entidades`}
                      value={f.nombre}
                      maxLength={200}
                      onChange={(e) => alEscribirNombre(f, e.target.value)}
                      aria-invalid={error ? true : undefined}
                      className={claseControl}
                    />
                    <ErrorCampo texto={error} />
                  </div>
                  <select
                    aria-label={`Rol del involucrado ${n}`}
                    value={f.rol}
                    onChange={(e) =>
                      cambiarInvolucrado(f.clave, { rol: e.target.value as FilaInvolucrado["rol"] })
                    }
                    className={claseControl}
                  >
                    {ROLES_INVOLUCRADO.map((r) => (
                      <option key={r} value={r}>
                        {NOMBRE_ROL[r]}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`RFC del involucrado ${n}`}
                    placeholder="RFC"
                    value={f.rfc}
                    maxLength={20}
                    onChange={(e) =>
                      cambiarInvolucrado(f.clave, { rfc: e.target.value.toUpperCase() })
                    }
                    className={claseControl}
                  />
                  <input
                    aria-label={`CURP del involucrado ${n}`}
                    placeholder="CURP"
                    value={f.curp}
                    maxLength={20}
                    disabled={f.tipo !== "persona_fisica"}
                    onChange={(e) =>
                      cambiarInvolucrado(f.clave, { curp: e.target.value.toUpperCase() })
                    }
                    className={`${claseControl} disabled:opacity-40`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setInvolucrados((lista) => lista.filter((x) => x.clave !== f.clave))
                    }
                    aria-label={`Quitar involucrado ${n}`}
                    className="self-start rounded-md border border-linea-2 px-2 py-2 text-xs text-tenue hover:text-texto"
                  >
                    Quitar
                  </button>
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
        {resultado && !resultado.ok ? (
          <p role="alert" className="text-sm text-peligro">
            {resultado.mensaje}
          </p>
        ) : null}
      </div>
    </form>
  );
}
