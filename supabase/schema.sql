-- =====================================================================
-- Oficina GSE · OS e estoque — banco de dados (Supabase / PostgreSQL)
-- Como usar: Supabase > SQL Editor > New query > cole TUDO > Run.
-- Pode rodar de novo sem medo: o script recria só o que é da oficina.
-- Todas as tabelas começam com "oficina_", para não misturar com o resto
-- do projeto GseConnect.
-- =====================================================================

-- ---------- tabelas ----------
create table if not exists oficina_equipamentos (
  id         text primary key,
  kind       text not null check (kind in ('tmx','nbl','gpu','escada','outro')),
  status     text not null default 'ok' check (status in ('ok','down','wait')),
  os_id      int,
  location   text not null default 'operacao' check (location in ('oficina','operacao')),
  hour_meter numeric
);

create table if not exists oficina_pecas (
  id   text primary key,
  name text not null,
  fits text not null default '',
  pn   text not null unique,
  loc  text not null default '',
  qty  int  not null default 0 check (qty >= 0),
  min  int  not null default 0
);

create table if not exists oficina_tecnicos (
  bp   text primary key check (bp ~ '^[0-9]{7}$'),
  name text not null
);

create table if not exists oficina_ordens (
  id               int primary key,
  equip_id         text not null references oficina_equipamentos(id),
  problem          text not null,
  description      text not null default '',
  location         text not null default 'oficina',
  tech             text not null,
  tech_bp          text not null,
  status           text not null default 'open' check (status in ('open','wait','closed')),
  opened_at        bigint not null,
  hour_meter_start numeric,
  closed_at        bigint,
  closed_by        text,
  closed_by_bp     text,
  hour_meter_end   numeric,
  service_done     text,
  photo_count      int not null default 0,
  wait_part_id     text
);
create index if not exists oficina_ordens_aberta_em on oficina_ordens (opened_at desc);

-- peças usadas em cada OS (uma linha por peça)
create table if not exists oficina_ordem_pecas (
  os_id   int  not null references oficina_ordens(id) on delete cascade,
  part_id text not null references oficina_pecas(id),
  qty     int  not null check (qty > 0),
  primary key (os_id, part_id)
);

create table if not exists oficina_fotos (
  id    uuid primary key default gen_random_uuid(),
  os_id int  not null references oficina_ordens(id) on delete cascade,
  stage text not null check (stage in ('abertura','fechamento')),
  data  text not null,
  at    bigint not null,
  by    text not null
);
create index if not exists oficina_fotos_os on oficina_fotos (os_id);

create table if not exists oficina_movimentacoes (
  id   uuid primary key default gen_random_uuid(),
  at   bigint not null,
  kind text not null,
  text text not null
);
create index if not exists oficina_mov_em on oficina_movimentacoes (at desc);

-- contador do número da OS (uma linha só)
create table if not exists oficina_config (
  id      int primary key default 1 check (id = 1),
  next_os int not null default 1041,
  seeded  boolean not null default false
);
insert into oficina_config (id) values (1) on conflict do nothing;

-- ---------- segurança (RLS) ----------
-- Qualquer aparelho pode LER. Para ESCREVER, só pelas funções abaixo,
-- que validam tudo. Protótipo sem login: quem tem a chave do app consegue
-- chamar as funções (inclusive "reiniciar"). Antes de usar com dados reais,
-- ligue o Supabase Auth e restrinja por perfil (veja o README).
alter table oficina_equipamentos  enable row level security;
alter table oficina_pecas         enable row level security;
alter table oficina_tecnicos      enable row level security;
alter table oficina_ordens        enable row level security;
alter table oficina_ordem_pecas   enable row level security;
alter table oficina_fotos         enable row level security;
alter table oficina_movimentacoes enable row level security;
alter table oficina_config        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['oficina_equipamentos','oficina_pecas','oficina_tecnicos','oficina_ordens',
                           'oficina_ordem_pecas','oficina_fotos','oficina_movimentacoes','oficina_config']
  loop
    execute format('drop policy if exists "leitura" on %I', t);
    execute format('create policy "leitura" on %I for select to anon, authenticated using (true)', t);
    execute format('grant select on %I to anon, authenticated', t);
  end loop;
end $$;

-- ---------- funções (a regra de negócio fica aqui, dentro do banco) ----------

-- Abrir OS
create or replace function oficina_abrir_os(
  p_equip text, p_problem text, p_description text, p_location text,
  p_hour numeric, p_photos text[], p_bp text, p_who text
) returns int
language plpgsql security definer set search_path = public as $$
declare
  eq oficina_equipamentos;
  v_id int;
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_photo text;
begin
  select * into eq from oficina_equipamentos where id = p_equip for update;
  if not found then raise exception 'Equipamento não encontrado.'; end if;
  if eq.os_id is not null then raise exception 'O % já tem a OS % aberta.', p_equip, eq.os_id; end if;

  update oficina_config set next_os = next_os + 1 where id = 1 returning next_os - 1 into v_id;

  insert into oficina_ordens (id, equip_id, problem, description, location, tech, tech_bp, status,
                              opened_at, hour_meter_start, photo_count)
  values (v_id, p_equip, p_problem, coalesce(p_description, ''), p_location, p_who, p_bp, 'open',
          v_now, p_hour, coalesce(array_length(p_photos, 1), 0));

  update oficina_equipamentos
     set status = 'down', os_id = v_id, location = p_location, hour_meter = coalesce(p_hour, hour_meter)
   where id = p_equip;

  foreach v_photo in array coalesce(p_photos, '{}') loop
    insert into oficina_fotos (os_id, stage, data, at, by) values (v_id, 'abertura', v_photo, v_now, p_who);
  end loop;

  insert into oficina_movimentacoes (at, kind, text)
  values (v_now, 'open', format('%s abriu a OS %s para o %s (%s)', p_who, v_id, p_equip, p_problem));
  return v_id;
end $$;

-- Retirar peça (devolve quanto sobrou no estoque)
create or replace function oficina_retirar_peca(p_os int, p_part text, p_qty int, p_who text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  o oficina_ordens;
  p oficina_pecas;
begin
  select * into o from oficina_ordens where id = p_os for update;
  if not found then raise exception 'A OS % não foi encontrada.', p_os; end if;
  if o.status = 'closed' then raise exception 'A OS % já foi fechada.', p_os; end if;
  select * into p from oficina_pecas where id = p_part for update;
  if not found then raise exception 'Peça não encontrada no estoque.'; end if;
  if p_qty is null or p_qty < 1 then raise exception 'Informe a quantidade.'; end if;
  if p.qty < p_qty then
    if p.qty = 0 then raise exception '% está em falta.', p.name; end if;
    raise exception 'Só há % de % no estoque.', p.qty, p.name;
  end if;

  update oficina_pecas set qty = qty - p_qty where id = p_part;
  insert into oficina_ordem_pecas (os_id, part_id, qty) values (p_os, p_part, p_qty)
  on conflict (os_id, part_id) do update set qty = oficina_ordem_pecas.qty + excluded.qty;
  insert into oficina_movimentacoes (at, kind, text)
  values ((extract(epoch from clock_timestamp()) * 1000)::bigint, 'pick',
          format('%s retirou %s × %s para a OS %s', p_who, p_qty, p.name, p_os));
  return p.qty - p_qty;
end $$;

-- Desfazer retirada
create or replace function oficina_desfazer_retirada(p_os int, p_part text, p_qty int, p_who text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  p oficina_pecas;
  usado int;
begin
  perform 1 from oficina_ordens where id = p_os for update;
  if not found then raise exception 'Não foi possível desfazer.'; end if;
  select * into p from oficina_pecas where id = p_part for update;
  if not found then raise exception 'Não foi possível desfazer.'; end if;
  select qty into usado from oficina_ordem_pecas where os_id = p_os and part_id = p_part;
  if usado is null or usado < p_qty then raise exception 'Não foi possível desfazer.'; end if;

  update oficina_pecas set qty = qty + p_qty where id = p_part;
  if usado = p_qty then
    delete from oficina_ordem_pecas where os_id = p_os and part_id = p_part;
  else
    update oficina_ordem_pecas set qty = qty - p_qty where os_id = p_os and part_id = p_part;
  end if;
  insert into oficina_movimentacoes (at, kind, text)
  values ((extract(epoch from clock_timestamp()) * 1000)::bigint, 'undo',
          format('%s desfez a retirada de %s × %s da OS %s', p_who, p_qty, p.name, p_os));
end $$;

-- Marcar a OS como aguardando peça
create or replace function oficina_aguardar_peca(p_os int, p_part text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  o oficina_ordens;
  p oficina_pecas;
begin
  select * into o from oficina_ordens where id = p_os for update;
  if not found then raise exception 'A OS % não foi encontrada.', p_os; end if;
  if o.status = 'closed' then raise exception 'A OS % já foi fechada.', p_os; end if;
  select * into p from oficina_pecas where id = p_part;
  if not found then raise exception 'Peça não encontrada.'; end if;

  update oficina_ordens set status = 'wait', wait_part_id = p_part where id = p_os;
  update oficina_equipamentos set status = 'wait' where id = o.equip_id;
  insert into oficina_movimentacoes (at, kind, text)
  values ((extract(epoch from clock_timestamp()) * 1000)::bigint, 'wait',
          format('A OS %s do %s está aguardando %s', p_os, o.equip_id, p.name));
end $$;

-- Fechar OS
create or replace function oficina_fechar_os(
  p_os int, p_service text, p_hour numeric, p_photos text[], p_bp text, p_who text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  o oficina_ordens;
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_photo text;
begin
  select * into o from oficina_ordens where id = p_os for update;
  if not found then raise exception 'A OS % não foi encontrada.', p_os; end if;
  if o.status = 'closed' then raise exception 'A OS % já foi fechada.', p_os; end if;
  if coalesce(trim(p_service), '') = '' then raise exception 'Descreva o serviço executado.'; end if;
  if p_hour is not null and o.hour_meter_start is not null and p_hour < o.hour_meter_start then
    raise exception 'O horímetro final não pode ser menor que o da abertura (% h).', o.hour_meter_start;
  end if;

  update oficina_ordens
     set status = 'closed', closed_at = v_now, closed_by = p_who, closed_by_bp = p_bp,
         hour_meter_end = p_hour, service_done = trim(p_service),
         photo_count = photo_count + coalesce(array_length(p_photos, 1), 0)
   where id = p_os;
  update oficina_equipamentos
     set status = 'ok', os_id = null, location = 'operacao', hour_meter = coalesce(p_hour, hour_meter)
   where id = o.equip_id;
  foreach v_photo in array coalesce(p_photos, '{}') loop
    insert into oficina_fotos (os_id, stage, data, at, by) values (p_os, 'fechamento', v_photo, v_now, p_who);
  end loop;
  insert into oficina_movimentacoes (at, kind, text)
  values (v_now, 'close', format('%s fechou a OS %s e liberou o %s', p_who, p_os, o.equip_id));
end $$;

-- Cadastrar equipamento
create or replace function oficina_cadastrar_equipamento(p_id text, p_kind text, p_location text, p_hour numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare k_label text;
begin
  if length(p_id) < 3 or length(p_id) > 12 or p_id !~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' then
    raise exception 'Use de 3 a 12 letras, números e hífen no prefixo, como TMX-09.';
  end if;
  if exists (select 1 from oficina_equipamentos where id = p_id) then
    raise exception 'O % já está cadastrado.', p_id;
  end if;
  insert into oficina_equipamentos (id, kind, status, location, hour_meter)
  values (p_id, p_kind, 'ok', p_location, p_hour);
  k_label := case p_kind when 'tmx' then 'Rebocador TMX 150' when 'nbl' then 'Esteira TLD NBL'
             when 'gpu' then 'GPU (fonte de energia)' when 'escada' then 'Escada de embarque'
             else 'Outro equipamento' end;
  insert into oficina_movimentacoes (at, kind, text)
  values ((extract(epoch from clock_timestamp()) * 1000)::bigint, 'register',
          format('Equipamento %s cadastrado (%s)', p_id, k_label));
end $$;

-- Cadastrar técnico
create or replace function oficina_cadastrar_tecnico(p_bp text, p_name text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_bp !~ '^[0-9]{7}$' then raise exception 'O BP tem 7 números.'; end if;
  if length(trim(coalesce(p_name, ''))) < 3 then raise exception 'Escreva o nome completo do técnico.'; end if;
  if exists (select 1 from oficina_tecnicos where bp = p_bp) then
    raise exception 'O BP % já está cadastrado.', p_bp;
  end if;
  insert into oficina_tecnicos (bp, name) values (p_bp, trim(p_name));
  insert into oficina_movimentacoes (at, kind, text)
  values ((extract(epoch from clock_timestamp()) * 1000)::bigint, 'register',
          format('Técnico %s (BP %s) cadastrado', trim(p_name), p_bp));
end $$;

-- Reiniciar: apaga tudo e grava os dados de exemplo enviados pelo app
-- (também é chamada sozinha na primeira vez que o app abre).
create or replace function oficina_reiniciar(p jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from oficina_fotos where true;
  delete from oficina_ordem_pecas where true;
  delete from oficina_ordens where true;
  delete from oficina_movimentacoes where true;
  delete from oficina_equipamentos where true;
  delete from oficina_pecas where true;
  delete from oficina_tecnicos where true;

  insert into oficina_tecnicos (bp, name)
  select t->>'bp', t->>'name' from jsonb_array_elements(p->'technicians') t;

  insert into oficina_equipamentos (id, kind, status, os_id, location, hour_meter)
  select e->>'id', e->>'kind', e->>'status', (e->>'osId')::int, e->>'location', (e->>'hourMeter')::numeric
    from jsonb_array_elements(p->'equipment') e;

  insert into oficina_pecas (id, name, fits, pn, loc, qty, min)
  select x->>'id', x->>'name', x->>'fits', x->>'pn', x->>'loc', (x->>'qty')::int, (x->>'min')::int
    from jsonb_array_elements(p->'parts') x;

  insert into oficina_ordens (id, equip_id, problem, description, location, tech, tech_bp, status, opened_at,
                              hour_meter_start, closed_at, closed_by, closed_by_bp, hour_meter_end,
                              service_done, photo_count, wait_part_id)
  select (o->>'id')::int, o->>'equipId', o->>'problem', o->>'description', o->>'location', o->>'tech',
         o->>'techBp', o->>'status', (o->>'openedAt')::bigint, (o->>'hourMeterStart')::numeric,
         (o->>'closedAt')::bigint, o->>'closedBy', o->>'closedByBp', (o->>'hourMeterEnd')::numeric,
         o->>'serviceDone', coalesce((o->>'photoCount')::int, 0), o->>'waitPartId'
    from jsonb_array_elements(p->'orders') o;

  insert into oficina_ordem_pecas (os_id, part_id, qty)
  select (o->>'id')::int, x->>'partId', (x->>'qty')::int
    from jsonb_array_elements(p->'orders') o, jsonb_array_elements(o->'parts') x;

  insert into oficina_movimentacoes (at, kind, text)
  select (l->>'at')::bigint, l->>'kind', l->>'text' from jsonb_array_elements(p->'log') l;

  update oficina_config set next_os = (p->>'nextOs')::int, seeded = true where id = 1;
end $$;

-- Quem pode chamar as funções (o app usa a chave "anon")
do $$
declare f text;
begin
  foreach f in array array[
    'oficina_abrir_os(text,text,text,text,numeric,text[],text,text)',
    'oficina_retirar_peca(int,text,int,text)',
    'oficina_desfazer_retirada(int,text,int,text)',
    'oficina_aguardar_peca(int,text)',
    'oficina_fechar_os(int,text,numeric,text[],text,text)',
    'oficina_cadastrar_equipamento(text,text,text,numeric)',
    'oficina_cadastrar_tecnico(text,text)',
    'oficina_reiniciar(jsonb)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

-- ---------- tempo real ----------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['oficina_equipamentos','oficina_pecas','oficina_tecnicos','oficina_ordens',
                             'oficina_ordem_pecas','oficina_movimentacoes']
    loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table %I', t);
      end if;
    end loop;
  end if;
end $$;
