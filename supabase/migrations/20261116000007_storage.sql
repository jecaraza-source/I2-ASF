-- Tarea 01 · Migración 7: bucket privado de originales.
-- docs/ESPECIFICACION.md §4. Ruta {organizacion}/{encargo}/{sha256}.
-- INSERT y SELECT para miembros; sin políticas de UPDATE ni DELETE (regla 2).

insert into storage.buckets (id, name, public)
values ('originales', 'originales', false)
on conflict (id) do update set public = false;

-- Organización dueña de una ruta del bucket, o null si la ruta no es válida.
create function privado.organizacion_de_ruta(p_ruta text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_ruta ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}$'
    then split_part(p_ruta, '/', 1)::uuid
  end;
$$;

-- Puede subir: la ruta es válida, el encargo es de esa organización y el
-- usuario es admin o auditor en ella.
create function privado.puede_subir_original(p_ruta text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privado.organizacion_de_ruta(p_ruta) is not null
    and exists (
      select 1
      from public.encargo e
      where e.organizacion_id = privado.organizacion_de_ruta(p_ruta)
        and e.id = split_part(p_ruta, '/', 2)::uuid
    )
    and public.es_miembro(privado.organizacion_de_ruta(p_ruta), '{admin,auditor}');
$$;

revoke all on function privado.organizacion_de_ruta(text) from public, anon;
revoke all on function privado.puede_subir_original(text) from public, anon;
grant execute on function privado.organizacion_de_ruta(text) to authenticated, service_role;
grant execute on function privado.puede_subir_original(text) to authenticated, service_role;

create policy originales_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'originales' and (select privado.puede_subir_original(name)));

create policy originales_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'originales'
    and (select public.es_miembro(privado.organizacion_de_ruta(name)))
  );
