import {
  MOTIVO_BLOQUEO_IA,
  NOMBRE_PROVEEDOR_IA,
  PROVEEDORES_IA,
  puede,
  type ProveedorIA,
  formatoMonto,
} from "@sigma/modelo";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { eliminarPrecioIA } from "@/acciones/ia";
import { EstadoCargando } from "@/components/estados";
import {
  FormularioConfiguracionIA,
  FormularioIAEncargo,
  FormularioPrecioIA,
  FormularioTopeProveedor,
} from "@/components/ia/formularios";
import { Etiqueta, Panel, Titulo } from "@/components/ui";
import { formatoFecha } from "@/lib/datos";
import { estadoProveedor } from "@/lib/ia/control";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

const numero = z.coerce.number().catch(0);
const usd = z.coerce.number().nullable().catch(null);
const fila = { llamadas: numero, tokens: numero, usd };
const resumenSchema = z.object({
  hoy: z.object(fila),
  mes: z.object({ ...fila, errores: numero, bloqueadas: numero }),
  por_modelo: z.array(
    z.object({
      ...fila,
      proveedor: z.string(),
      modelo: z.string(),
      tokens_entrada: numero,
      tokens_salida: numero,
    }),
  ),
  por_encargo: z.array(
    z.object({ ...fila, encargo_id: z.string().nullable(), nombre: z.string().nullable() }),
  ),
  por_funcion: z.array(z.object({ ...fila, funcion: z.string() })),
  por_dia: z.array(z.object({ dia: z.string(), tokens: numero, llamadas: numero })),
  recientes: z.array(
    z.object({
      id: z.string(),
      creado_en: z.string(),
      proveedor: z.string(),
      modelo: z.string(),
      funcion: z.string(),
      resultado: z.string(),
      codigo_error: z.string().nullable(),
      tokens: numero,
    }),
  ),
});

const n = new Intl.NumberFormat("es-MX");
const dinero = (v: number | null) => (v === null ? "sin precio" : formatoMonto(v, "USD"));
const numeroONulo = (v: number | null | undefined) =>
  v === null || v === undefined ? null : Number(v);
const TOPES = { diario: 2_000_000, mensual: 30_000_000 };

function Barra({ valor, tope, etiqueta }: { valor: number; tope: number; etiqueta: string }) {
  const pct = tope > 0 ? Math.min(100, Math.round((valor / tope) * 100)) : 100;
  return (
    <div
      role="meter"
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={tope}
      aria-valuenow={Math.min(valor, tope)}
      className="h-2 w-full overflow-hidden rounded bg-fondo-2"
    >
      <div
        className={`h-full ${pct >= 90 ? "bg-peligro" : pct >= 70 ? "bg-oro" : "bg-ok"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function UsoIA() {
  return (
    <main className="flex-1 px-8 py-8">
      <Titulo>Uso de IA</Titulo>
      <Suspense fallback={<EstadoCargando texto="Cargando el consumo…" />}>
        <Contenido />
      </Suspense>
    </main>
  );
}

async function Contenido() {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "ia.administrar")) {
    return (
      <Panel className="max-w-xl">
        <p className="text-sm text-tenue">
          Solo los administradores de la organización ven y controlan el uso de IA.
        </p>
      </Panel>
    );
  }
  const supabase = await clienteServidor();
  const [
    { data: crudo },
    { data: config },
    { data: precios },
    { data: encargos },
    { data: topes },
  ] = await Promise.all([
    supabase.rpc("resumen_uso_ia", { p_organizacion: activa.organizacionId }),
    supabase
      .from("configuracion_ia")
      .select("activa, tope_diario_tokens, tope_mensual_tokens, actualizado_en")
      .eq("organizacion_id", activa.organizacionId)
      .maybeSingle(),
    supabase
      .from("precio_ia")
      .select("id, proveedor, modelo, usd_millon_entrada, usd_millon_salida")
      .eq("organizacion_id", activa.organizacionId)
      .order("proveedor")
      .order("modelo"),
    supabase
      .from("encargo")
      .select("id, nombre, estado, ia_proveedores")
      .eq("organizacion_id", activa.organizacionId)
      .order("creado_en", { ascending: false })
      .limit(200),
    supabase
      .from("tope_proveedor_ia")
      .select("proveedor, tope_diario_tokens, tope_mensual_tokens")
      .eq("organizacion_id", activa.organizacionId),
  ]);
  const r = resumenSchema.safeParse(crudo);
  if (!r.success) {
    return (
      <Panel className="max-w-xl">
        <p role="alert" className="text-sm text-texto">
          No se pudo leer el consumo. Intenta de nuevo.
        </p>
      </Panel>
    );
  }
  const d = r.data;
  const iaActiva = config?.activa ?? true;
  const topeDiario = Number(config?.tope_diario_tokens ?? TOPES.diario);
  const topeMensual = Number(config?.tope_mensual_tokens ?? TOPES.mensual);
  const proveedores = PROVEEDORES_IA.map(estadoProveedor);
  const maxDia = Math.max(1, ...d.por_dia.map((x) => x.tokens));
  const esProveedor = (p: string): p is ProveedorIA =>
    (PROVEEDORES_IA as readonly string[]).includes(p);

  return (
    <div className="flex max-w-6xl flex-col gap-8">
      <p className="-mt-3 max-w-3xl text-sm text-tenue">
        Aquí se registra cada llamada a un proveedor de IA: cuántos tokens usó y si salió bien.
        Nunca se guarda el contenido de los documentos. Un encargo solo envía documentos a los
        proveedores que tenga marcados.
      </p>

      <section aria-label="Estado" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-linea bg-panel px-4 py-3" data-testid="ia-estado">
          <p className="text-xs text-tenue">Organización</p>
          <p className={`text-xl font-semibold ${iaActiva ? "text-ok" : "text-peligro"}`}>
            {iaActiva ? "IA activa" : "IA apagada"}
          </p>
          <p className="mt-1 text-xs text-tenue">
            {(encargos ?? []).filter((e) => e.ia_proveedores.length).length} de{" "}
            {(encargos ?? []).length} encargos con IA
          </p>
        </div>
        <div className="rounded-lg border border-linea bg-panel px-4 py-3" data-testid="ia-hoy">
          <p className="text-xs text-tenue">Hoy</p>
          <p className="text-xl font-semibold text-texto">{n.format(d.hoy.tokens)} tokens</p>
          <Barra
            valor={d.hoy.tokens}
            tope={topeDiario}
            etiqueta="Consumo de hoy contra el tope diario"
          />
          <p className="mt-1 text-xs text-tenue">
            de {n.format(topeDiario)} · {n.format(d.hoy.llamadas)} llamadas
          </p>
        </div>
        <div className="rounded-lg border border-linea bg-panel px-4 py-3" data-testid="ia-mes">
          <p className="text-xs text-tenue">Este mes</p>
          <p className="text-xl font-semibold text-texto">{n.format(d.mes.tokens)} tokens</p>
          <Barra
            valor={d.mes.tokens}
            tope={topeMensual}
            etiqueta="Consumo del mes contra el tope mensual"
          />
          <p className="mt-1 text-xs text-tenue">
            de {n.format(topeMensual)} · {n.format(d.mes.llamadas)} llamadas
          </p>
        </div>
        <div className="rounded-lg border border-linea bg-panel px-4 py-3" data-testid="ia-costo">
          <p className="text-xs text-tenue">Costo estimado del mes</p>
          <p className="text-xl font-semibold text-texto">{dinero(d.mes.usd)}</p>
          <p className="mt-1 text-xs text-tenue">
            {n.format(d.mes.errores)} con error · {n.format(d.mes.bloqueadas)} bloqueadas
          </p>
        </div>
      </section>

      <section aria-label="Proveedores" className="grid gap-3 md:grid-cols-2">
        {proveedores.map((p, i) => (
          <Panel key={p.proveedor}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-texto">
                {NOMBRE_PROVEEDOR_IA[p.proveedor]}
              </h2>
              <Etiqueta tono={p.llave ? "ok" : "oro"}>
                {p.llave ? "Llave configurada" : "Sin llave"}
              </Etiqueta>
            </div>
            <p className="mt-2 text-xs text-tenue">
              Variable <span className="font-mono">{p.variableLlave}</span> en el servidor
              {p.llave ? "" : " (falta: sin ella este proveedor no se usa)"}.
            </p>
            <p className="text-xs text-tenue">
              Modelo (<span className="font-mono">{p.variableModelo}</span>):{" "}
              <span className="font-mono text-texto">{p.modelo ?? "sin definir"}</span>
              {p.esfuerzo ? <span> · esfuerzo {p.esfuerzo}</span> : null}
            </p>
            <p className="mt-2 text-xs text-tenue">
              {i === 0
                ? "Proveedor principal: lee todos los documentos mientras no llegue a su límite."
                : "Respaldo: solo se usa cuando el principal llegó a su límite (tope propio, saturación, cuota o crédito) y el encargo lo permite."}
            </p>
            <FormularioTopeProveedor
              proveedor={p.proveedor}
              topeDiario={numeroONulo(
                topes?.find((t) => t.proveedor === p.proveedor)?.tope_diario_tokens,
              )}
              topeMensual={numeroONulo(
                topes?.find((t) => t.proveedor === p.proveedor)?.tope_mensual_tokens,
              )}
            />
          </Panel>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-4 text-base font-semibold text-texto">Interruptor y topes</h2>
          <FormularioConfiguracionIA
            activa={iaActiva}
            topeDiario={topeDiario}
            topeMensual={topeMensual}
          />
        </Panel>
        <Panel>
          <h2 className="mb-3 text-base font-semibold text-texto">Últimos 30 días</h2>
          {d.por_dia.length === 0 ? (
            <p className="text-sm text-tenue">Aún no hay llamadas registradas.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-xs text-tenue" aria-label="Tokens por día">
              {d.por_dia.slice(-14).map((x) => (
                <li
                  key={x.dia}
                  className="grid grid-cols-[4.5rem_minmax(0,1fr)_6rem] items-center gap-2"
                >
                  <span>
                    {x.dia.slice(8, 10)}/{x.dia.slice(5, 7)}
                  </span>
                  <span className="h-2 rounded bg-fondo-2">
                    <span
                      className="block h-full rounded bg-azul-claro"
                      style={{ width: `${Math.max(2, (x.tokens / maxDia) * 100)}%` }}
                    />
                  </span>
                  <span className="text-right text-texto">{n.format(x.tokens)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <section aria-label="Consumo del mes" className="grid gap-6 lg:grid-cols-2">
        <Tabla
          titulo="Por modelo"
          columnas={["Modelo", "Llamadas", "Entrada", "Salida", "Costo"]}
          filas={d.por_modelo.map((m) => [
            `${esProveedor(m.proveedor) ? NOMBRE_PROVEEDOR_IA[m.proveedor] : m.proveedor} · ${m.modelo}`,
            n.format(m.llamadas),
            n.format(m.tokens_entrada),
            n.format(m.tokens_salida),
            dinero(m.usd),
          ])}
        />
        <Tabla
          titulo="Por encargo"
          columnas={["Encargo", "Llamadas", "Tokens", "Costo"]}
          filas={d.por_encargo.map((e) => [
            e.nombre ?? "Sin encargo",
            n.format(e.llamadas),
            n.format(e.tokens),
            dinero(e.usd),
          ])}
        />
        <Tabla
          titulo="Por función"
          columnas={["Función", "Llamadas", "Tokens", "Costo"]}
          filas={d.por_funcion.map((f) => [
            f.funcion,
            n.format(f.llamadas),
            n.format(f.tokens),
            dinero(f.usd),
          ])}
        />
        <Tabla
          titulo="Errores y bloqueos recientes"
          columnas={["Cuándo", "Modelo", "Función", "Qué pasó"]}
          filas={d.recientes.map((x) => [
            formatoFecha(x.creado_en),
            x.modelo,
            x.funcion,
            x.resultado === "bloqueada"
              ? `Bloqueada: ${MOTIVO_BLOQUEO_IA[x.codigo_error ?? ""] ?? x.codigo_error ?? "sin motivo"}`
              : `Error ${x.codigo_error ?? ""}`.trim(),
          ])}
        />
      </section>

      <Panel>
        <h2 className="mb-1 text-base font-semibold text-texto">IA por encargo</h2>
        <p className="mb-4 text-xs text-tenue">
          Marca a qué proveedores puede enviar documentos cada encargo. Sin marcas, la IA está
          apagada en ese encargo y sus documentos esperan captura manual.
        </p>
        <ul className="flex flex-col divide-y divide-linea" aria-label="Encargos">
          {(encargos ?? []).map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <Link href={`/encargos/${e.id}`} className="text-sm text-azul-claro hover:underline">
                {e.nombre}
              </Link>
              <FormularioIAEncargo
                encargoId={e.id}
                nombre={e.nombre}
                proveedores={e.ia_proveedores.filter(esProveedor)}
              />
            </li>
          ))}
          {(encargos ?? []).length === 0 ? (
            <li className="py-3 text-sm text-tenue">Aún no hay encargos.</li>
          ) : null}
        </ul>
      </Panel>

      <Panel>
        <h2 className="mb-1 text-base font-semibold text-texto">Precios para estimar el costo</h2>
        <p className="mb-4 text-xs text-tenue">
          Captura el precio vigente de cada modelo (dólares por millón de tokens) según la página
          del proveedor. El costo es una estimación; la factura del proveedor es la que manda.
        </p>
        {(precios ?? []).length ? (
          <ul className="mb-4 flex flex-col gap-1 text-sm" aria-label="Precios">
            {(precios ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3">
                <span className="text-texto">
                  {esProveedor(p.proveedor) ? NOMBRE_PROVEEDOR_IA[p.proveedor] : p.proveedor} ·{" "}
                  <span className="font-mono">{p.modelo}</span>
                </span>
                <span className="text-tenue">
                  entrada {formatoMonto(Number(p.usd_millon_entrada), "USD")} · salida{" "}
                  {formatoMonto(Number(p.usd_millon_salida), "USD")}
                </span>
                <form action={eliminarPrecioIA}>
                  <input type="hidden" name="id" value={p.id} />
                  <button
                    type="submit"
                    className="text-xs text-tenue hover:text-texto"
                    aria-label={`Quitar precio de ${p.modelo}`}
                  >
                    Quitar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        <FormularioPrecioIA />
      </Panel>
    </div>
  );
}

function Tabla({
  titulo,
  columnas,
  filas,
}: {
  titulo: string;
  columnas: string[];
  filas: string[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-linea">
      <table className="w-full text-left text-sm">
        <caption className="px-4 py-2 text-left text-sm font-semibold text-texto">{titulo}</caption>
        <thead className="bg-panel-2 text-xs tracking-wide text-tenue uppercase">
          <tr>
            {columnas.map((c) => (
              <th key={c} scope="col" className="px-4 py-2">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className="border-t border-linea">
              {f.map((v, j) => (
                <td key={j} className={`px-4 py-2 ${j === 0 ? "text-texto" : "text-tenue"}`}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
          {filas.length === 0 ? (
            <tr>
              <td colSpan={columnas.length} className="px-4 py-5 text-center text-sm text-tenue">
                Sin datos este mes.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
