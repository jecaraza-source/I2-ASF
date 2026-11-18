import { NOMBRE_ACCION_USUARIO, NOMBRE_ROL, puede, rolSchema } from "@sigma/modelo";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { EstadoCargando, EstadoVacio, SinPermiso } from "@/components/estados";
import { Etiqueta, Panel, Titulo } from "@/components/ui";
import { AccionesUsuario, FormularioAltaUsuario } from "@/components/usuarios/formularios";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

export const metadata = { title: "Usuarios y accesos — SIGMA" };

const VISTAS = [
  { clave: "usuarios", texto: "Usuarios" },
  { clave: "accesos", texto: "Bitácora de acceso" },
  { clave: "cambios", texto: "Control de cambios" },
] as const;
type Vista = (typeof VISTAS)[number]["clave"];

const filtrosSchema = z.object({
  vista: z.enum(["usuarios", "accesos", "cambios"]).catch("usuarios"),
  usuario: z.uuid().optional().catch(undefined),
  desde: z.iso.date().optional().catch(undefined),
  hasta: z.iso.date().optional().catch(undefined),
});

const fechaHora = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const cuando = (iso: string | null) => (iso ? fechaHora.format(new Date(iso)) : "—");
const nombreRol = (v: unknown) => {
  const r = rolSchema.safeParse(v);
  return r.success ? NOMBRE_ROL[r.data] : "—";
};
const detalleSchema = z
  .object({
    ip: z.string().optional(),
    navegador: z.string().optional(),
    rol: z.string().optional(),
    antes: z.string().optional(),
    despues: z.string().optional(),
  })
  .catch({});

type Parametros = Promise<Record<string, string | string[] | undefined>>;

export default function PaginaUsuarios({ searchParams }: { searchParams: Parametros }) {
  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Suspense fallback={<EstadoCargando texto="Cargando usuarios…" />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Contenido({ searchParams }: { searchParams: Parametros }) {
  const sesion = await requerirOrganizacion();
  if (!puede(sesion.activa.rol, "usuarios.administrar")) {
    return (
      <>
        <Titulo>Usuarios y accesos</Titulo>
        <SinPermiso texto="Solo un administrador de la organización gestiona los usuarios y consulta sus accesos." />
      </>
    );
  }
  const f = filtrosSchema.parse(await searchParams);
  const org = sesion.activa.organizacionId;
  const supabase = await clienteServidor();
  const { data: usuarios, error } = await supabase.rpc("usuarios_organizacion", {
    p_organizacion_id: org,
  });

  return (
    <>
      <Titulo>Usuarios y accesos</Titulo>
      <p className="-mt-3 mb-5 text-sm text-tenue">{sesion.activa.nombre}</p>
      <nav aria-label="Secciones" className="mb-6 flex flex-wrap gap-2 border-b border-linea pb-3">
        {VISTAS.map((v) => (
          <Link
            key={v.clave}
            href={v.clave === "usuarios" ? "/usuarios" : `/usuarios?vista=${v.clave}`}
            aria-current={f.vista === v.clave ? "page" : undefined}
            className="rounded-md border border-linea-2 px-3 py-1.5 text-sm text-texto hover:border-oro aria-[current=page]:border-oro aria-[current=page]:text-oro"
          >
            {v.texto}
          </Link>
        ))}
      </nav>
      {error ? (
        <SinPermiso texto="No se pudo leer la lista de usuarios. Intenta de nuevo." />
      ) : f.vista === "usuarios" ? (
        <div className="flex flex-col gap-6">
          <Panel>
            <h2 className="mb-4 text-base font-semibold text-texto">Agregar usuario</h2>
            <FormularioAltaUsuario />
          </Panel>
          <section
            aria-label="Usuarios de la organización"
            className="overflow-x-auto rounded-lg border border-linea"
          >
            <table className="w-full text-left text-sm">
              <thead className="bg-panel-2 text-xs tracking-wide text-tenue uppercase">
                <tr>
                  {["Correo", "Rol", "Estado", "Último acceso", "Alta", "Acciones"].map((t) => (
                    <th key={t} scope="col" className="px-4 py-2">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-linea">
                {(usuarios ?? []).map((u) => {
                  const rol = rolSchema.safeParse(u.rol);
                  return (
                    <tr key={u.miembro_id} className={u.activo ? "" : "opacity-70"}>
                      <th scope="row" className="px-4 py-3 font-normal text-texto">
                        {u.correo}
                        {u.usuario_id === sesion.usuario.id ? (
                          <span className="ml-2 text-xs text-tenue">(tú)</span>
                        ) : null}
                      </th>
                      <td className="px-4 py-3 text-texto">{nombreRol(u.rol)}</td>
                      <td className="px-4 py-3">
                        {!u.activo ? (
                          <Etiqueta>De baja</Etiqueta>
                        ) : u.pendiente ? (
                          <Etiqueta tono="oro">Sin primer acceso</Etiqueta>
                        ) : (
                          <Etiqueta tono="ok">Activo</Etiqueta>
                        )}
                      </td>
                      <td className="px-4 py-3 text-tenue">{cuando(u.ultimo_acceso)}</td>
                      <td className="px-4 py-3 text-tenue">{cuando(u.creado_en)}</td>
                      <td className="px-4 py-3">
                        {rol.success ? (
                          <AccionesUsuario
                            miembroId={u.miembro_id}
                            correo={u.correo}
                            rol={rol.data}
                            activo={u.activo}
                            esPropio={u.usuario_id === sesion.usuario.id}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>
      ) : (
        <Bitacora
          vista={f.vista}
          org={org}
          usuario={f.usuario}
          desde={f.desde}
          hasta={f.hasta}
          usuarios={(usuarios ?? []).map((u) => ({ id: u.usuario_id, correo: u.correo }))}
        />
      )}
    </>
  );
}

async function Bitacora({
  vista,
  org,
  usuario,
  desde,
  hasta,
  usuarios,
}: {
  vista: Exclude<Vista, "usuarios">;
  org: string;
  usuario?: string;
  desde?: string;
  hasta?: string;
  usuarios: { id: string; correo: string }[];
}) {
  const supabase = await clienteServidor();
  const LIMITE = 300;
  const { data, error } = await supabase.rpc("bitacora_usuarios", {
    p_organizacion_id: org,
    p_clase: vista === "accesos" ? "acceso" : "cambios",
    p_usuario_id: usuario,
    p_desde: desde,
    p_hasta: hasta,
    p_limite: LIMITE,
  });
  const filas = data ?? [];
  const clase =
    "rounded-md border border-linea-2 bg-fondo-2 px-2 py-1.5 text-sm text-texto focus:border-oro focus:outline-none";
  const titulo = vista === "accesos" ? "Bitácora de acceso" : "Control de cambios";
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-tenue">
        {vista === "accesos"
          ? "Inicios y cierres de sesión e intentos fallidos, con la dirección IP y el navegador desde los que se hicieron."
          : "Altas, cambios de rol, bajas y reactivaciones: quién lo hizo, cuándo y qué cambió. Este registro no se puede editar ni borrar."}
      </p>
      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filtros">
        <input type="hidden" name="vista" value={vista} />
        <label className="flex flex-col gap-1 text-xs text-tenue">
          Usuario
          <select name="usuario" defaultValue={usuario ?? ""} className={clase}>
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.correo}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-tenue">
          Desde
          <input type="date" name="desde" defaultValue={desde} className={clase} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-tenue">
          Hasta
          <input type="date" name="hasta" defaultValue={hasta} className={clase} />
        </label>
        <button
          type="submit"
          className="rounded-md border border-linea-2 px-3 py-1.5 text-sm text-texto hover:border-oro"
        >
          Filtrar
        </button>
      </form>
      {error ? (
        <SinPermiso texto="No se pudo leer la bitácora. Intenta de nuevo." />
      ) : !filas.length ? (
        <EstadoVacio titulo="Sin movimientos con esos filtros." />
      ) : (
        <section aria-label={titulo} className="overflow-x-auto rounded-lg border border-linea">
          <table className="w-full text-left text-sm">
            <thead className="bg-panel-2 text-xs tracking-wide text-tenue uppercase">
              <tr>
                {(vista === "accesos"
                  ? ["Fecha y hora", "Usuario", "Evento", "IP", "Navegador"]
                  : ["Fecha y hora", "Usuario", "Cambio", "Detalle", "Hecho por"]
                ).map((t) => (
                  <th key={t} scope="col" className="px-4 py-2">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {filas.map((b) => {
                const d = detalleSchema.parse(b.detalle);
                return (
                  <tr key={b.id}>
                    <td className="px-4 py-2 whitespace-nowrap text-tenue">{cuando(b.en)}</td>
                    <td className="px-4 py-2 text-texto">
                      {b.usuario_correo ?? "Usuario eliminado"}
                    </td>
                    <td className="px-4 py-2">
                      {b.accion === "sesion.fallo" || b.accion === "usuario.baja" ? (
                        <span className="text-peligro">{NOMBRE_ACCION_USUARIO[b.accion]}</span>
                      ) : (
                        <span className="text-texto">
                          {NOMBRE_ACCION_USUARIO[b.accion] ?? b.accion}
                        </span>
                      )}
                    </td>
                    {vista === "accesos" ? (
                      <>
                        <td className="px-4 py-2 font-mono text-xs text-tenue">{d.ip ?? "—"}</td>
                        <td
                          className="max-w-md truncate px-4 py-2 text-xs text-tenue"
                          title={d.navegador}
                        >
                          {d.navegador ?? "—"}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-tenue">
                          {b.accion === "usuario.rol"
                            ? `${nombreRol(d.antes)} → ${nombreRol(d.despues)}`
                            : `Rol: ${nombreRol(d.rol)}`}
                        </td>
                        <td className="px-4 py-2 text-tenue">{b.actor_correo ?? "Sistema"}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filas.length >= LIMITE ? (
            <p className="px-4 py-2 text-xs text-tenue">
              Se muestran los {LIMITE} movimientos más recientes. Acota las fechas para ver otros.
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
