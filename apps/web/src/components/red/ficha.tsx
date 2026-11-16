import { DESCRIPCION_CRITERIO } from "@sigma/red";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Ficha as DatosFicha, Origen } from "@/lib/vista-datos";
import { COLOR_NIVEL, NOMBRE_NIVEL, NOMBRE_TIPO } from "./presentacion";

function fecha(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs tracking-wide text-oro uppercase">{titulo}</h3>
      {children}
    </section>
  );
}

/** Enlaces al registro y a la celda o página de origen. */
export function Origenes({ origenes, encargoId }: { origenes: Origen[]; encargoId: string }) {
  if (!origenes.length)
    return <span className="text-xs text-tenue-2">Sin evidencia registrada</span>;
  return (
    <ul className="flex flex-col gap-0.5 text-xs">
      {origenes.map((o) => (
        <li key={o.registro_id}>
          <Link
            href={`/encargos/${encargoId}/registros/${o.registro_id}`}
            className="text-azul-claro hover:underline"
          >
            {o.resumen ?? "Registro"}
          </Link>
          {o.documento ? <span className="text-tenue"> · {o.documento.nombre}</span> : null}
          {o.ubicacion && !o.ubicaciones.length ? (
            <Link
              href={`/encargos/${encargoId}/registros/${o.registro_id}`}
              className="ml-1 text-tenue hover:text-texto hover:underline"
            >
              [{o.ubicacion}]
            </Link>
          ) : null}
          {o.ubicaciones.map((u, i) => (
            <Link
              key={u.extraccion_id ?? i}
              href={`/encargos/${encargoId}/registros/${o.registro_id}${u.extraccion_id ? `#x-${u.extraccion_id}` : ""}`}
              className="ml-1 text-tenue hover:text-texto hover:underline"
            >
              [{u.texto}]
            </Link>
          ))}
        </li>
      ))}
    </ul>
  );
}

/**
 * Ficha de una entidad (§11). Sirve en el panel del visor (`compacta`, con `onCentrar`) y en su
 * página propia. Todo el texto viene de la base: se pinta como texto, nunca como HTML.
 */
export function Ficha({
  ficha,
  encargoId,
  compacta = false,
  onCentrar,
}: {
  ficha: DatosFicha;
  encargoId: string;
  compacta?: boolean;
  onCentrar?: (id: string) => void;
}) {
  const { entidad: e, calificacion: c } = ficha;
  const otra = (o: { id: string; nombre: string }) =>
    onCentrar ? (
      <button
        type="button"
        onClick={() => onCentrar(o.id)}
        className="text-left text-azul-claro hover:underline"
        title="Centrar en la red"
      >
        {o.nombre}
      </button>
    ) : (
      <Link
        href={`/encargos/${encargoId}/entidades/${o.id}`}
        className="text-azul-claro hover:underline"
      >
        {o.nombre}
      </Link>
    );
  const limite = compacta ? 15 : Infinity;
  const nivel = c ? (c.ajuste_nivel ?? c.nivel) : null;

  return (
    <div className="flex flex-col gap-5 text-sm" aria-label={`Ficha de ${e.nombre}`}>
      <Seccion titulo="Datos generales">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-tenue">Tipo</dt>
          <dd className="text-texto">{NOMBRE_TIPO[e.tipo] ?? e.tipo}</dd>
          {e.riesgo_declarado ? (
            <>
              <dt className="text-tenue">Riesgo declarado</dt>
              <dd className="text-texto">{e.riesgo_declarado}</dd>
            </>
          ) : null}
          {e.identificadores.map(([k, v]) => (
            <FilaDato key={`i-${k}`} k={k.toUpperCase()} v={v} />
          ))}
          {e.atributos.map(([k, v]) => (
            <FilaDato key={`a-${k}`} k={k.replaceAll("_", " ")} v={v} />
          ))}
          {e.alias.length ? <FilaDato k="Alias" v={e.alias.join(" · ")} /> : null}
        </dl>
        {e.fusionada_en ? (
          <p className="text-xs text-tenue">Fusionada en {otra(e.fusionada_en)}.</p>
        ) : null}
      </Seccion>

      <Seccion titulo="Calificación">
        {c && nivel ? (
          <div className="flex flex-col gap-1">
            <span className="text-texto">
              <span
                className="mr-2 inline-block size-2.5 rounded-full align-middle"
                style={{ background: COLOR_NIVEL[nivel] }}
                aria-hidden
              />
              {NOMBRE_NIVEL[nivel]} · {c.puntaje} puntos
              {c.ajuste_nivel ? (
                <span className="text-xs text-tenue"> (ajustada: {c.ajuste_motivo})</span>
              ) : null}
            </span>
            <ul className="text-xs text-tenue">
              {c.criterios.length ? (
                c.criterios.map((x, i) => (
                  <li key={i}>
                    <span className="text-texto">+{x.aporte}</span>{" "}
                    {DESCRIPCION_CRITERIO[x.criterio] ?? x.criterio}: {x.detalle}
                  </li>
                ))
              ) : (
                <li>Sin criterios activados.</li>
              )}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-tenue">No figura en la última generación de la red.</p>
        )}
      </Seccion>

      <Seccion titulo={`Registros y documentos (${ficha.registros.length})`}>
        <Origenes origenes={ficha.registros.slice(0, limite)} encargoId={encargoId} />
      </Seccion>

      <Seccion titulo={`Vínculos (${ficha.vinculos.length})`}>
        {ficha.vinculos.length ? (
          <ul className="flex flex-col gap-2 text-xs" aria-label="Vínculos de la entidad">
            {ficha.vinculos.slice(0, limite).map((v) => (
              <li key={v.id} className="flex flex-col gap-0.5">
                <span className="text-texto">
                  {v.sentido === "sale" ? "→" : "←"} {otra(v.otra)}{" "}
                  <span className="text-tenue">
                    · {v.tipo}
                    {v.fuerza !== null ? ` · fuerza ${v.fuerza}` : ""}
                    {v.fecha_inicio ? ` · desde ${fecha(v.fecha_inicio)}` : ""}
                  </span>
                </span>
                {!compacta ? <Origenes origenes={v.origenes} encargoId={encargoId} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-tenue">Sin vínculos declarados.</p>
        )}
      </Seccion>

      <Seccion titulo={`Eventos (${ficha.eventos_total})`}>
        {ficha.eventos.length ? (
          <ul className="flex flex-col gap-2 text-xs" aria-label="Eventos de la entidad">
            {ficha.eventos.slice(0, compacta ? 10 : Infinity).map((ev) => (
              <li key={ev.id} className="flex flex-col gap-0.5">
                <span className="text-texto">
                  {fecha(ev.fecha)} · {ev.tipo} ({ev.rol})
                  {ev.monto ? ` · ${ev.monto} ${ev.moneda ?? ""}` : ""}
                  {ev.contrapartes.length ? " con " : ""}
                  {ev.contrapartes.map((o, i) => (
                    <span key={o.id}>
                      {i ? ", " : ""}
                      {otra(o)}
                    </span>
                  ))}
                </span>
                {!compacta ? <Origenes origenes={ev.origenes} encargoId={encargoId} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-tenue">Sin eventos.</p>
        )}
        {ficha.eventos_total > ficha.eventos.length ? (
          <p className="text-xs text-tenue-2">
            Se muestran {ficha.eventos.length} de {ficha.eventos_total}.
          </p>
        ) : null}
      </Seccion>
    </div>
  );
}

function FilaDato({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-tenue capitalize">{k}</dt>
      <dd className="break-words text-texto">{v}</dd>
    </>
  );
}
