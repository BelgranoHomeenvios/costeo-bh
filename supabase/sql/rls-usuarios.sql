-- ============================================================
--  RLS · Acceso para usuarios logueados
--  Pegar en Supabase → SQL Editor → Run.
--
--  Qué hace (idempotente, se puede correr varias veces):
--   1. Da permisos de esquema/tabla al rol "authenticated".
--   2. Enciende RLS en cada tabla de public y rentabilidad.
--   3. Crea una política que permite LEER y ESCRIBIR solo a quien
--      inició sesión (authenticated). Sin login, la base no devuelve nada.
--
--  La anon key sigue siendo pública: NO tiene política, así que sin
--  sesión iniciada no ve ni cambia datos.
-- ============================================================

-- 1) Permisos base para el rol de usuarios logueados
grant usage on schema public, rentabilidad to authenticated;
grant all privileges on all tables    in schema public, rentabilidad to authenticated;
grant all privileges on all sequences in schema public, rentabilidad to authenticated;

-- Que las tablas/secuencias nuevas hereden los permisos
alter default privileges in schema public, rentabilidad
  grant all on tables to authenticated;
alter default privileges in schema public, rentabilidad
  grant all on sequences to authenticated;

-- El rol anon necesita "ver" el esquema para que la app arranque,
-- pero sin política no puede leer ni escribir datos (lo frena el RLS).
grant usage on schema public, rentabilidad to anon;

-- 2) + 3) Encender RLS y crear la política en cada tabla
do $$
declare r record;
begin
  for r in
    select schemaname, tablename
      from pg_tables
     where schemaname in ('public','rentabilidad')
  loop
    execute format('alter table %I.%I enable row level security', r.schemaname, r.tablename);
    execute format('drop policy if exists usuarios_logueados on %I.%I', r.schemaname, r.tablename);
    execute format(
      'create policy usuarios_logueados on %I.%I for all to authenticated using (true) with check (true)',
      r.schemaname, r.tablename);
  end loop;
end $$;
