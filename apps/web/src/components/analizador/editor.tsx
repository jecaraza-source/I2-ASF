"use client";

import { acotarAfirmaciones, type Afirmacion } from "@sigma/importador/sintesis";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { descartarSintesis, guardarSintesis, reintentarSintesis } from "@/acciones/analizador";

export type RegistroCita = { id: string; etiqueta: string; numero: number };

const claseBoton =
  "rounded-md border border-linea-2 px-3 py-1.5 text-sm text-texto hover:border-oro disabled:opacity-60";
const claseControl =
  "w-full rounded-md border border-linea-2 bg-fondo-2 px-3 py-2 text-sm text-texto focus:border-oro focus:outline-none";

/** Cita: abre el registro (y desde ahí la página, hoja, fila o celda de origen). */
export function Cita({ encargoId, registro }: { encargoId: string; registro: RegistroCita }) {
  return (
    <Link
      href={`/encargos/${encargoId}/registros/${registro.id}`}
      className="rounded border border-azul-medio/60 px-1.5 py-0.5 text-xs text-azul-claro underline hover:text-texto"
      title={registro.etiqueta}
    >
      Registro {registro.numero}
    </Link>
  );
}

/**
 * Editor del borrador. Quitar un registro del alcance quita sus citas, y la afirmación que se queda
 * sin citas desaparece (misma función que aplica el servidor). Nada se guarda sin registro.
 */
export function EditorSintesis({
  encargoId,
  sintesisId,
  inicial,
  registros,
  alcanceInicial,
}: {
  encargoId: string;
  sintesisId: string;
  inicial: Afirmacion[];
  registros: RegistroCita[];
  alcanceInicial: string[];
}) {
  const router = useRouter();
  const id = useId();
  const [alcance, setAlcance] = useState<string[]>(alcanceInicial);
  const [afirmaciones, setAfirmaciones] = useState<Afirmacion[]>(inicial);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [descartando, setDescartando] = useState(false);
  const [enviando, iniciar] = useTransition();
  const porId = new Map(registros.map((r) => [r.id, r]));

  const quitarDelAlcance = (registroId: string) => {
    const nuevo = alcance.filter((x) => x !== registroId);
    const antes = afirmaciones.length;
    const acotadas = acotarAfirmaciones(afirmaciones, nuevo);
    setAlcance(nuevo);
    setAfirmaciones(acotadas);
    const quitadas = antes - acotadas.length;
    setAviso({
      ok: true,
      texto: `Registro ${porId.get(registroId)?.numero ?? ""} fuera del alcance.${
        quitadas ? ` Se quitaron ${quitadas} afirmación(es) que solo se sostenían en él.` : ""
      } Guarda para conservar el cambio.`,
    });
  };

  const cambiar = (i: number, cambio: Partial<Afirmacion>) =>
    setAfirmaciones((lista) => lista.map((a, j) => (j === i ? { ...a, ...cambio } : a)));

  const enviar = (aprobar: boolean) => {
    const sinCita = afirmaciones.filter((a) => a.registros.length === 0 || !a.texto.trim()).length;
    iniciar(async () => {
      const r = await guardarSintesis({
        encargoId,
        sintesisId,
        afirmaciones,
        registros: alcance,
        aprobar,
      });
      setAviso({
        ok: r.ok,
        texto:
          r.ok && sinCita
            ? `${r.mensaje ?? ""} Se omitieron ${sinCita} afirmación(es) sin texto o sin registro.`
            : (r.mensaje ?? ""),
      });
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Registros del alcance" className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-texto">Registros del alcance</h2>
        <p className="text-xs text-tenue">
          Solo registros validados. Quitar uno quita sus citas; el alcance solo se reduce.
        </p>
        <ul className="flex flex-col gap-1">
          {alcance.map((rid) => {
            const r = porId.get(rid);
            return (
              <li key={rid} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 text-xs text-tenue">Registro {r?.numero}</span>
                <Link
                  href={`/encargos/${encargoId}/registros/${rid}`}
                  className="min-w-0 flex-1 truncate text-texto hover:text-oro"
                >
                  {r?.etiqueta ?? rid}
                </Link>
                <button
                  type="button"
                  className="text-xs text-tenue underline hover:text-peligro"
                  onClick={() => quitarDelAlcance(rid)}
                  disabled={alcance.length <= 1}
                  aria-label={`Quitar del alcance el registro ${r?.numero ?? ""}`}
                >
                  Quitar del alcance
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Afirmaciones del borrador" className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-texto">
          Borrador · {afirmaciones.length} afirmación(es)
        </h2>
        <p className="text-xs text-tenue">
          Propuesta de la IA: revísala, corrige el texto y las citas. Cada afirmación necesita al
          menos un registro que la sostenga.
        </p>
        <ol className="flex flex-col gap-3">
          {afirmaciones.map((a, i) => {
            const disponibles = alcance.filter((rid) => !a.registros.includes(rid));
            return (
              <li
                key={i}
                aria-label={`Afirmación ${i + 1}`}
                className={`flex flex-col gap-2 rounded-md border p-3 ${
                  a.registros.length ? "border-linea-2" : "border-peligro/60"
                }`}
              >
                <label htmlFor={`${id}-a${i}`} className="text-xs text-tenue">
                  Afirmación {i + 1}
                </label>
                <textarea
                  id={`${id}-a${i}`}
                  rows={2}
                  maxLength={2000}
                  value={a.texto}
                  onChange={(e) => cambiar(i, { texto: e.target.value })}
                  className={claseControl}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-tenue">Se sostiene en:</span>
                  {a.registros.length === 0 ? (
                    <span role="alert" className="text-xs text-peligro">
                      Sin registro: no se guardará.
                    </span>
                  ) : null}
                  {a.registros.map((rid) => {
                    const r = porId.get(rid);
                    return r ? (
                      <span key={rid} className="inline-flex items-center gap-1">
                        <Cita encargoId={encargoId} registro={r} />
                        <button
                          type="button"
                          className="text-xs text-tenue hover:text-peligro"
                          aria-label={`Quitar la cita al registro ${r.numero} de la afirmación ${i + 1}`}
                          onClick={() =>
                            cambiar(i, { registros: a.registros.filter((x) => x !== rid) })
                          }
                        >
                          ×
                        </button>
                      </span>
                    ) : null;
                  })}
                  {disponibles.length ? (
                    <select
                      aria-label={`Agregar cita a la afirmación ${i + 1}`}
                      value=""
                      onChange={(e) =>
                        e.target.value &&
                        cambiar(i, { registros: [...a.registros, e.target.value] })
                      }
                      className="rounded-md border border-linea-2 bg-fondo-2 px-2 py-1 text-xs text-texto"
                    >
                      <option value="">+ cita</option>
                      {disponibles.map((rid) => (
                        <option key={rid} value={rid}>
                          Registro {porId.get(rid)?.numero} ·{" "}
                          {porId.get(rid)?.etiqueta.slice(0, 60)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <button
                    type="button"
                    className="ml-auto text-xs text-tenue underline hover:text-peligro"
                    onClick={() => setAfirmaciones((l) => l.filter((_, j) => j !== i))}
                  >
                    Eliminar afirmación {i + 1}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        <div>
          <button
            type="button"
            className={claseBoton}
            onClick={() => setAfirmaciones((l) => [...l, { texto: "", registros: [] }])}
          >
            Agregar afirmación
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={claseBoton}
          disabled={enviando}
          onClick={() => enviar(false)}
        >
          Guardar borrador
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={() => enviar(true)}
          className="rounded-md bg-oro px-4 py-2 text-sm font-medium text-fondo hover:bg-oro-suave disabled:opacity-60"
        >
          Aprobar síntesis
        </button>
        <button
          type="button"
          className="text-sm text-tenue underline hover:text-peligro"
          aria-expanded={descartando}
          onClick={() => setDescartando((v) => !v)}
        >
          Descartar
        </button>
      </div>
      {descartando ? (
        <div className="flex max-w-xl flex-col gap-2">
          <label htmlFor={`${id}-motivo`} className="text-sm text-texto">
            Motivo del descarte
          </label>
          <input
            id={`${id}-motivo`}
            value={motivo}
            maxLength={500}
            onChange={(e) => setMotivo(e.target.value)}
            className={claseControl}
          />
          <div>
            <button
              type="button"
              className={claseBoton}
              disabled={enviando}
              onClick={() =>
                iniciar(async () => {
                  const r = await descartarSintesis({ encargoId, sintesisId, motivo });
                  setAviso({ ok: r.ok, texto: r.mensaje ?? "" });
                  if (r.ok) router.refresh();
                })
              }
            >
              Confirmar descarte
            </button>
          </div>
        </div>
      ) : null}
      {aviso ? (
        <p
          role={aviso.ok ? "status" : "alert"}
          className={`text-sm ${aviso.ok ? "text-ok" : "text-peligro"}`}
        >
          {aviso.texto}
        </p>
      ) : null}
    </div>
  );
}

/** Mientras se genera, la página se refresca sola unas veces; el cron es el respaldo. */
export function EsperandoSintesis() {
  const router = useRouter();
  const [vueltas, setVueltas] = useState(40);
  useEffect(() => {
    if (vueltas <= 0) return;
    const t = setTimeout(() => {
      router.refresh();
      setVueltas((n) => n - 1);
    }, 3000);
    return () => clearTimeout(t);
  }, [vueltas, router]);
  return (
    <p role="status" className="text-sm text-tenue">
      La IA está redactando la síntesis con los registros elegidos. Esta página se actualiza sola.
    </p>
  );
}

export function BotonReintentar({
  encargoId,
  sintesisId,
}: {
  encargoId: string;
  sintesisId: string;
}) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        className={claseBoton}
        disabled={enviando}
        onClick={() =>
          iniciar(async () => {
            const r = await reintentarSintesis({ encargoId, sintesisId });
            setAviso(r.mensaje ?? null);
            if (r.ok) router.refresh();
          })
        }
      >
        Reintentar
      </button>
      {aviso ? (
        <p role="status" className="text-xs text-tenue">
          {aviso}
        </p>
      ) : null}
    </div>
  );
}
