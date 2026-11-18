import { moduloPorClave, recorridoPorClave, formatoNumero } from "@sigma/modelo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { EnlaceBoton, Panel, Titulo } from "@/components/ui";
import { avanceEncargo } from "@/lib/avance";
import { obtenerEncargo } from "@/lib/datos";
import { clienteServidor } from "@/lib/supabase/servidor";

const etapaSchema = z.coerce.number().int().min(1).catch(1);

export default async function PaginaRecorrido({
  params,
  searchParams,
}: {
  params: Promise<{ encargo: string; recorrido: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { encargo: id, recorrido: clave } = await params;
  const recorrido = recorridoPorClave(clave);
  if (!recorrido) notFound();
  const encargo = await obtenerEncargo(id);
  const supabase = await clienteServidor();
  const avance = await avanceEncargo(supabase, encargo.id);

  const base = `/encargos/${encargo.id}`;
  const propia = `${base}/recorridos/${recorrido.clave}`;
  const etapas = recorrido.etapas.map((e) => ({
    ...e,
    modulo: moduloPorClave(e.modulo),
    hecha: e.senal ? avance[e.senal] > 0 : null,
    cantidad: e.senal ? avance[e.senal] : null,
  }));
  // Sin `?etapa`, se abre en la primera etapa que aún no está cubierta.
  const pedida = (await searchParams).etapa;
  const sugerida = etapas.findIndex((e) => e.hecha === false) + 1 || 1;
  const numero = pedida ? Math.min(etapaSchema.parse(pedida), etapas.length) : sugerida;
  const actual = etapas[numero - 1] ?? etapas[0];
  if (!actual) notFound();
  const estado = (e: (typeof etapas)[number]) =>
    e.hecha === null ? "De consulta" : e.hecha ? "Hecha" : "Pendiente";

  return (
    <main className="flex-1 px-8 py-8">
      <Titulo
        accion={
          <EnlaceBoton variante="secundario" href={`${base}/recorridos`}>
            Todos los recorridos
          </EnlaceBoton>
        }
      >
        {recorrido.nombre}
      </Titulo>
      <p className="-mt-3 mb-6 max-w-3xl text-sm text-tenue">{recorrido.objetivo}</p>

      <ol aria-label="Etapas" className="mb-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {etapas.map((e, i) => (
          <li key={e.titulo}>
            <Link
              href={`${propia}?etapa=${i + 1}`}
              aria-current={i + 1 === numero ? "step" : undefined}
              className="flex h-full items-start gap-3 rounded-lg border border-linea bg-panel p-3 hover:border-oro focus-visible:outline-2 focus-visible:outline-oro aria-[current=step]:border-oro aria-[current=step]:bg-panel-2"
            >
              <span
                aria-hidden
                className={`flex size-7 flex-none items-center justify-center rounded-full border text-sm font-semibold ${
                  e.hecha ? "border-ok text-ok" : "border-linea-2 text-texto"
                }`}
              >
                {e.hecha ? "✓" : i + 1}
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-medium text-texto">
                  <span className="sr-only">Etapa {i + 1}: </span>
                  {e.titulo}
                </span>
                <span className={`text-xs ${e.hecha ? "text-ok" : "text-tenue"}`}>{estado(e)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel>
          <p className="text-[10px] tracking-[2px] text-oro uppercase">
            Etapa {numero} de {etapas.length}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-texto">{actual.titulo}</h2>
          <p className="mt-2 text-sm text-texto">{actual.descripcion}</p>
          {actual.ayuda ? <p className="mt-2 text-sm text-tenue">{actual.ayuda}</p> : null}
          <p className="mt-4 text-sm text-tenue" data-testid="estado-etapa">
            {actual.hecha === null
              ? "Esta etapa es de consulta: no deja un dato que medir."
              : actual.hecha
                ? `Ya está cubierta en este encargo (${formatoNumero(actual.cantidad)}).`
                : "Aún no hay nada de esta etapa en el encargo."}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {actual.modulo.listo ? (
              <EnlaceBoton href={`${base}${actual.modulo.ruta}`}>{actual.accion}</EnlaceBoton>
            ) : (
              <span
                aria-disabled="true"
                className="rounded-md border border-linea-2 px-3.5 py-2 text-sm text-tenue-2"
              >
                {actual.modulo.nombre}: próximamente
              </span>
            )}
            {numero > 1 ? (
              <EnlaceBoton variante="secundario" href={`${propia}?etapa=${numero - 1}`}>
                ← Anterior
              </EnlaceBoton>
            ) : null}
            {numero < etapas.length ? (
              <EnlaceBoton variante="secundario" href={`${propia}?etapa=${numero + 1}`}>
                Siguiente: {etapas[numero]?.titulo} →
              </EnlaceBoton>
            ) : null}
          </div>
          <p className="mt-4 text-xs text-tenue-2">
            {actual.modulo.nombre}: {actual.modulo.descripcion} Al terminar, vuelve con «Regresar».
          </p>
        </Panel>
        <aside aria-label="¿Qué sigue?" className="rounded-lg border border-linea bg-panel p-5">
          <h2 className="text-base font-semibold text-texto">¿Qué sigue?</h2>
          <ol className="mt-3 flex flex-col gap-2 text-sm">
            {etapas.map((e, i) => (
              <li
                key={e.titulo}
                className={
                  i + 1 === numero ? "text-oro" : i + 1 < numero ? "text-tenue" : "text-texto"
                }
              >
                {i + 1}. {e.titulo}
                {i + 1 === numero ? " (estás aquí)" : ""}
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-linea pt-3 text-sm text-tenue">
            <span className="text-texto">Resultado:</span> {recorrido.resultado}
          </p>
          <p className="mt-2 text-xs text-tenue-2">
            Las etapas no son obligatorias ni tienen que ir en orden: puedes empezar con la
            información que tengas.
          </p>
        </aside>
      </div>
    </main>
  );
}
