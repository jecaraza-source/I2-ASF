"use client";

import {
  AVISO_CONFIDENCIALIDAD,
  AVISO_PRIVACIDAD_SITIO,
  HORAS_MAXIMAS_SIN_ENVIAR,
  MAX_BYTES_FOTO,
  MAX_FOTOS_POR_VISITA,
  MIMES_FOTO,
} from "@sigma/modelo";
import { PREGUNTAS_CAMPO } from "@sigma/reglas";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { aceptarAvisoCampo } from "@/acciones/campo";
import { cerrarSesion } from "@/acciones/sesion";
import { enviarPendiente } from "@/lib/campo-envio";
import {
  borrarTodo,
  caducado,
  guardarPendiente,
  guardarVisitas,
  huellaSha256,
  leerPendientes,
  leerVisitas,
  respuestaVisitasSchema,
  ubicacionActual,
  type FotoLocal,
  type PendienteLocal,
  type VisitaLocal,
} from "@/lib/campo-local";

const RESPUESTAS = [
  { valor: "si", texto: "Sí" },
  { valor: "no", texto: "No" },
  { valor: "no_verificable", texto: "No se pudo verificar" },
] as const;

const boton =
  "rounded-md border border-linea-2 px-3 py-2 text-sm text-texto hover:border-oro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oro disabled:opacity-50";
const botonPrincipal =
  "rounded-md bg-oro px-4 py-2 text-sm font-medium text-fondo hover:bg-oro-suave focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oro disabled:opacity-50";

function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(iso));
}

/**
 * App de verificación en campo. Funciona sin señal: las visitas se descargan al teléfono (caducan a
 * las 24 h), la cédula y las fotos se guardan en el teléfono y se envían solas al volver la conexión.
 */
export function AppCampo() {
  const [enLinea, setEnLinea] = useState(true);
  const [visitas, setVisitas] = useState<VisitaLocal[] | null>(null);
  const [descargadoEn, setDescargadoEn] = useState<string | null>(null);
  const [pendientes, setPendientes] = useState<PendienteLocal[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const bloqueo = useRef(false);

  const recargarPendientes = useCallback(async () => setPendientes(await leerPendientes()), []);

  const descargar = useCallback(async () => {
    try {
      const r = await fetch("/api/campo/visitas", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (r.status === 401) {
        setAviso("Tu sesión terminó. Vuelve a ingresar con señal para enviar lo pendiente.");
        return;
      }
      if (!r.ok) return;
      const datos = respuestaVisitasSchema.safeParse(await r.json());
      if (!datos.success) return;
      await guardarVisitas(datos.data.usuario_id, datos.data.visitas);
      setVisitas(datos.data.visitas);
      setDescargadoEn(new Date().toISOString());
    } catch {
      // Sin conexión: se queda con lo guardado.
    }
  }, []);

  const enviarTodo = useCallback(async () => {
    if (bloqueo.current || !navigator.onLine) return;
    bloqueo.current = true;
    setEnviando(true);
    try {
      let enviadas = 0;
      for (const p of await leerPendientes()) {
        const r = await enviarPendiente(p);
        if (r.ok) {
          enviadas++;
          continue;
        }
        await guardarPendiente({ ...p, error: r.error });
        if (r.sesion) {
          setAviso("Tu sesión terminó. Vuelve a ingresar para enviar lo pendiente.");
          break;
        }
      }
      if (enviadas > 0) {
        setAviso(enviadas === 1 ? "Se envió 1 cédula." : `Se enviaron ${enviadas} cédulas.`);
        await descargar();
      }
    } finally {
      bloqueo.current = false;
      setEnviando(false);
      await recargarPendientes();
    }
  }, [descargar, recargarPendientes]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const local = await leerVisitas();
      if (!vivo) return;
      if (local) {
        setVisitas(local.visitas);
        setDescargadoEn(local.descargado_en);
      }
      await recargarPendientes();
      setEnLinea(navigator.onLine);
      if (navigator.onLine) {
        await descargar();
        await enviarTodo();
      }
      if (vivo) setVisitas((v) => v ?? []);
    })();
    const conectar = () => {
      setEnLinea(true);
      void enviarTodo();
    };
    const desconectar = () => setEnLinea(false);
    window.addEventListener("online", conectar);
    window.addEventListener("offline", desconectar);
    const reintento = window.setInterval(() => {
      if (navigator.onLine) void enviarTodo();
    }, 60_000);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => {
          const urls = performance
            .getEntriesByType("resource")
            .map((e) => e.name)
            .concat(location.origin + "/campo");
          reg.active?.postMessage({ tipo: "guardar", urls });
        })
        .catch(() => undefined);
    }
    return () => {
      vivo = false;
      window.removeEventListener("online", conectar);
      window.removeEventListener("offline", desconectar);
      window.clearInterval(reintento);
    };
  }, [descargar, enviarTodo, recargarPendientes]);

  const borrar = async () => {
    if (pendientes.length > 0 && !confirmarBorrado) {
      setConfirmarBorrado(true);
      setAviso(
        `Hay ${pendientes.length} cédula(s) sin enviar. Envíalas, o vuelve a pulsar «Borrar datos» para borrarlas también.`,
      );
      return;
    }
    await borrarTodo();
    setConfirmarBorrado(false);
    setVisitas([]);
    setPendientes([]);
    setDescargadoEn(null);
    setAbierta(null);
    setAviso("Se borraron los datos de este teléfono.");
  };

  const salir = async () => {
    await borrarTodo();
    await cerrarSesion();
  };

  const porEnviar = new Set(pendientes.map((p) => p.cedula.visita_id));
  const sinAviso = new Map<string, string>();
  for (const v of visitas ?? [])
    if (!v.aviso_aceptado) sinAviso.set(v.organizacion_id, v.organizacion);
  const visita = visitas?.find((v) => v.visita_id === abierta) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          role="status"
          data-testid="conexion"
          className={`rounded border px-2 py-1 ${enLinea ? "border-ok/60 text-ok" : "border-peligro/60 text-peligro"}`}
        >
          {enLinea ? "Con conexión" : "Sin conexión: lo que guardes se enviará después"}
        </span>
        <span
          data-testid="pendientes"
          className="rounded border border-linea-2 px-2 py-1 text-tenue"
        >
          {pendientes.length === 0
            ? "Nada por enviar"
            : `${pendientes.length} por enviar${enviando ? " · enviando…" : ""}`}
        </span>
        {descargadoEn ? (
          <span className="text-tenue">Visitas descargadas {fechaHora(descargadoEn)}</span>
        ) : null}
      </div>

      {aviso ? (
        <p role="status" className="rounded-md border border-linea-2 px-3 py-2 text-sm text-texto">
          {aviso}
        </p>
      ) : null}

      {pendientes.length > 0 ? (
        <section
          aria-labelledby="titulo-pendientes"
          className="rounded-md border border-oro-tenue p-3"
        >
          <h2 id="titulo-pendientes" className="mb-2 text-sm font-semibold text-texto">
            Cédulas por enviar
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {pendientes.map((p) => (
              <li key={p.cedula.id}>
                <span className="text-texto">{p.entidad}</span>{" "}
                <span className="text-xs text-tenue">
                  guardada {fechaHora(p.guardada_en)} · {p.fotos.length} foto(s)
                </span>
                {caducado(p.guardada_en) ? (
                  <span className="block text-xs text-peligro">
                    Lleva más de {HORAS_MAXIMAS_SIN_ENVIAR} h sin enviarse: busca señal cuanto
                    antes.
                  </span>
                ) : null}
                {p.error ? <span className="block text-xs text-peligro">{p.error}</span> : null}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={`${boton} mt-2`}
            disabled={!enLinea || enviando}
            onClick={() => void enviarTodo()}
          >
            Enviar ahora
          </button>
        </section>
      ) : null}

      {visitas === null ? (
        <p className="text-sm text-tenue">Cargando…</p>
      ) : sinAviso.size > 0 ? (
        [...sinAviso].map(([orgId, org]) => (
          <AvisoConfidencialidad
            key={orgId}
            organizacion={org}
            enLinea={enLinea}
            onAceptar={async () => {
              const r = await aceptarAvisoCampo(orgId);
              if (!r.ok) {
                setAviso("No se pudo registrar la aceptación. Intenta con señal.");
                return;
              }
              await descargar();
            }}
          />
        ))
      ) : visita ? (
        <CedulaCampo
          key={visita.visita_id}
          visita={visita}
          onCancelar={() => setAbierta(null)}
          onGuardada={async (p) => {
            await guardarPendiente(p);
            await recargarPendientes();
            setAbierta(null);
            setAviso(
              navigator.onLine
                ? "Cédula guardada. Enviando…"
                : "Cédula guardada en el teléfono. Se enviará al volver la señal.",
            );
            void enviarTodo();
          }}
        />
      ) : (
        <ListaVisitas visitas={visitas} porEnviar={porEnviar} onAbrir={setAbierta} />
      )}

      <div className="mt-auto flex flex-wrap gap-2 border-t border-linea pt-4">
        <button type="button" className={boton} onClick={() => void borrar()}>
          Borrar datos de este teléfono
        </button>
        <button type="button" className={boton} onClick={() => void salir()}>
          Salir
        </button>
      </div>
    </div>
  );
}

function AvisoConfidencialidad({
  organizacion,
  enLinea,
  onAceptar,
}: {
  organizacion: string;
  enLinea: boolean;
  onAceptar: () => Promise<void>;
}) {
  const [leido, setLeido] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const id = useId();
  return (
    <section aria-labelledby={`${id}-t`} className="rounded-md border border-linea bg-panel p-4">
      <h1 id={`${id}-t`} className="mb-1 text-lg font-semibold text-texto">
        {AVISO_CONFIDENCIALIDAD.titulo}
      </h1>
      <p className="mb-3 text-xs text-tenue">{organizacion}</p>
      <div className="flex flex-col gap-2 text-sm text-texto">
        {AVISO_CONFIDENCIALIDAD.parrafos.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <label htmlFor={`${id}-c`} className="mt-4 flex items-start gap-2 text-sm text-texto">
        <input
          id={`${id}-c`}
          type="checkbox"
          checked={leido}
          onChange={(e) => setLeido(e.target.checked)}
          className="mt-1"
        />
        Leí el aviso y me obligo a cumplirlo.
      </label>
      <button
        type="button"
        className={`${botonPrincipal} mt-3`}
        disabled={!leido || !enLinea || ocupado}
        onClick={async () => {
          setOcupado(true);
          await onAceptar();
          setOcupado(false);
        }}
      >
        Acepto
      </button>
      {!enLinea ? (
        <p className="mt-2 text-xs text-tenue">Para aceptarlo necesitas conexión.</p>
      ) : null}
    </section>
  );
}

function ListaVisitas({
  visitas,
  porEnviar,
  onAbrir,
}: {
  visitas: VisitaLocal[];
  porEnviar: Set<string>;
  onAbrir: (id: string) => void;
}) {
  const abiertas = visitas.filter((v) => !porEnviar.has(v.visita_id));
  return (
    <section aria-labelledby="titulo-visitas">
      <h1 id="titulo-visitas" className="mb-3 text-lg font-semibold text-texto">
        Mis visitas
      </h1>
      {abiertas.length === 0 ? (
        <p className="rounded-md border border-linea p-4 text-sm text-tenue">
          No tienes visitas por hacer. Si esperabas alguna, conéctate para descargarla.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {abiertas.map((v) => (
            <li key={v.visita_id}>
              <button
                type="button"
                onClick={() => onAbrir(v.visita_id)}
                className="w-full rounded-md border border-linea bg-panel px-4 py-3 text-left hover:border-oro focus-visible:outline-2 focus-visible:outline-oro"
              >
                <span className="block text-sm font-medium text-texto">{v.entidad}</span>
                <span className="block text-xs text-tenue">
                  {v.rfc ? `${v.rfc} · ` : ""}
                  {v.encargo}
                </span>
                {v.domicilios?.[0] ? (
                  <span className="block text-xs text-tenue">{v.domicilios[0]}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type FotoPrevia = FotoLocal & { url: string };

function CedulaCampo({
  visita,
  onCancelar,
  onGuardada,
}: {
  visita: VisitaLocal;
  onCancelar: () => void;
  onGuardada: (p: PendienteLocal) => Promise<void>;
}) {
  const id = useId();
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [domicilio, setDomicilio] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [fotos, setFotos] = useState<FotoPrevia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [verAviso, setVerAviso] = useState(false);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    const lista = urls.current;
    return () => {
      for (const u of lista) URL.revokeObjectURL(u);
    };
  }, []);

  const agregarFotos = async (archivos: File[]) => {
    if (archivos.length === 0) return;
    setError(null);
    if (fotos.length + archivos.length > MAX_FOTOS_POR_VISITA) {
      setError(`Máximo ${MAX_FOTOS_POR_VISITA} fotos por visita.`);
      return;
    }
    setOcupado(true);
    const ubicacion = await ubicacionActual();
    const nuevas: FotoPrevia[] = [];
    for (const archivo of archivos) {
      const mime =
        archivo.type || (archivo.name.toLowerCase().endsWith(".heic") ? "image/heic" : "");
      if (!(MIMES_FOTO as readonly string[]).includes(mime)) {
        setError("Solo fotos JPG, PNG, WEBP o HEIC.");
        continue;
      }
      if (archivo.size > MAX_BYTES_FOTO || archivo.size === 0) {
        setError("Cada foto debe pesar menos de 15 MB.");
        continue;
      }
      const blob = new Blob([await archivo.arrayBuffer()], { type: mime });
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      nuevas.push({
        id: crypto.randomUUID(),
        blob,
        sha256: await huellaSha256(blob),
        mime,
        bytes: blob.size,
        capturada_en: new Date().toISOString(),
        latitud: ubicacion?.latitud ?? null,
        longitud: ubicacion?.longitud ?? null,
        precision_m: ubicacion?.precision_m ?? null,
        registrada: false,
        url,
      });
    }
    setFotos((f) => [...f, ...nuevas]);
    setOcupado(false);
  };

  const guardar = async () => {
    const faltan = PREGUNTAS_CAMPO.filter((p) => !respuestas[p.clave]);
    if (faltan.length > 0) {
      setError("Contesta todas las preguntas.");
      return;
    }
    if (fotos.length === 0) {
      setError("Toma al menos una foto del lugar.");
      return;
    }
    setOcupado(true);
    const ubicacion = await ubicacionActual();
    await onGuardada({
      cedula: {
        id: crypto.randomUUID(),
        visita_id: visita.visita_id,
        respuestas: Object.fromEntries(
          PREGUNTAS_CAMPO.map((p) => [
            p.clave,
            respuestas[p.clave] as "si" | "no" | "no_verificable",
          ]),
        ),
        domicilio_observado: domicilio.trim() || null,
        observaciones: observaciones.trim() || null,
        capturada_en: new Date().toISOString(),
        evidencias: fotos.map((f) => f.id),
        latitud: ubicacion?.latitud ?? null,
        longitud: ubicacion?.longitud ?? null,
        precision_m: ubicacion?.precision_m ?? null,
      },
      organizacion_id: visita.organizacion_id,
      encargo_id: visita.encargo_id,
      entidad: visita.entidad,
      fotos: fotos.map((f) => {
        const { url, ...local } = f;
        URL.revokeObjectURL(url);
        return local;
      }),
      guardada_en: new Date().toISOString(),
      error: null,
    });
  };

  return (
    <section aria-labelledby={`${id}-t`} className="flex flex-col gap-4">
      <div>
        <button type="button" className="text-xs text-tenue underline" onClick={onCancelar}>
          ← Mis visitas
        </button>
        <h1 id={`${id}-t`} className="mt-1 text-lg font-semibold text-texto">
          Cédula de verificación: {visita.entidad}
        </h1>
        <p className="text-xs text-tenue">
          {visita.rfc ? `${visita.rfc} · ` : ""}
          {visita.encargo}
        </p>
      </div>

      <div className="rounded-md border border-linea bg-panel p-3 text-sm">
        <h2 className="mb-1 font-semibold text-texto">Domicilio a verificar</h2>
        {visita.domicilios && visita.domicilios.length > 0 ? (
          <ul className="list-disc pl-5 text-texto">
            {visita.domicilios.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        ) : (
          <p className="text-tenue">Sin domicilio en las fuentes: anota el que encuentres.</p>
        )}
        {visita.instrucciones ? (
          <p className="mt-2 text-texto">
            <span className="text-tenue">Instrucciones: </span>
            {visita.instrucciones}
          </p>
        ) : null}
        {visita.documentos.length > 0 ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-tenue">
              Documentos de soporte ({visita.documentos.length})
            </summary>
            <ul className="mt-1 flex flex-col gap-1 text-xs text-texto">
              {visita.documentos.map((d) => (
                <li key={d.registro_id}>
                  {[d.tipo, d.fecha, d.resumen].filter(Boolean).join(" · ")}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <button
          type="button"
          className="mt-2 text-xs text-oro underline"
          aria-expanded={verAviso}
          onClick={() => setVerAviso((v) => !v)}
        >
          {verAviso ? "Ocultar aviso de privacidad" : "Mostrar aviso de privacidad a quien atiende"}
        </button>
        {verAviso ? (
          <div className="mt-2 rounded-md border border-linea-2 p-3 text-sm text-texto">
            <p className="mb-1 font-semibold">{AVISO_PRIVACIDAD_SITIO.titulo}</p>
            {AVISO_PRIVACIDAD_SITIO.parrafos.map((p) => (
              <p key={p} className="mb-1">
                {p.replaceAll("{responsable}", visita.organizacion)}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      {PREGUNTAS_CAMPO.map((p) => (
        <fieldset key={p.clave} className="rounded-md border border-linea p-3">
          <legend className="px-1 text-sm text-texto">{p.pregunta}</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {RESPUESTAS.map((r) => (
              <label key={r.valor} className="flex items-center gap-1.5 text-sm text-texto">
                <input
                  type="radio"
                  name={`${id}-${p.clave}`}
                  value={r.valor}
                  checked={respuestas[p.clave] === r.valor}
                  onChange={() => setRespuestas((x) => ({ ...x, [p.clave]: r.valor }))}
                />
                {r.texto}
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-dom`} className="text-sm text-texto">
          Domicilio observado
        </label>
        <input
          id={`${id}-dom`}
          value={domicilio}
          maxLength={500}
          onChange={(e) => setDomicilio(e.target.value)}
          className="rounded-md border border-linea-2 bg-fondo-2 px-3 py-2 text-sm text-texto"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-obs`} className="text-sm text-texto">
          Observaciones
        </label>
        <textarea
          id={`${id}-obs`}
          value={observaciones}
          maxLength={4000}
          rows={4}
          onChange={(e) => setObservaciones(e.target.value)}
          className="rounded-md border border-linea-2 bg-fondo-2 px-3 py-2 text-sm text-texto"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-foto`} className="text-sm text-texto">
          Fotos del lugar (fachada, número exterior, interior si te permiten)
        </label>
        <input
          id={`${id}-foto`}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(e) => {
            // Se copia antes de limpiar el control: vaciarlo vacía también su FileList.
            void agregarFotos(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
          className="text-sm text-tenue"
        />
        {fotos.length > 0 ? (
          <ul aria-label="Fotos tomadas" className="grid grid-cols-3 gap-2">
            {fotos.map((f, i) => (
              <li key={f.id} className="text-[10px] text-tenue">
                {/* eslint-disable-next-line @next/next/no-img-element -- blob local, sin optimizar */}
                <img
                  src={f.url}
                  alt={`Foto ${i + 1}`}
                  className="aspect-square w-full rounded object-cover"
                />
                {f.latitud !== null ? "Con ubicación" : "Sin ubicación"}
                <button
                  type="button"
                  className="ml-1 underline"
                  onClick={() => setFotos((x) => x.filter((y) => y.id !== f.id))}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-peligro/60 px-3 py-2 text-sm text-peligro"
        >
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          className={botonPrincipal}
          disabled={ocupado}
          onClick={() => void guardar()}
        >
          Guardar cédula
        </button>
        <button type="button" className={boton} onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </section>
  );
}
