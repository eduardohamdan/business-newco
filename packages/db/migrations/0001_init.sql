-- =============================================================================
-- Business Evolution OS — esquema inicial (MVP)
-- Regras:
--   * Toda tabela de negócio tem organization_id e RLS FORÇADO.
--   * A aplicação conecta com o papel beos_app (sem BYPASSRLS) e define app.org_id por transação.
--   * Dinheiro em centavos (bigint). Datas em UTC (timestamptz) ou date.
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- Papel da aplicação (sem bypass de RLS). Senha definida fora da migração em produção.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'beos_app') then
    create role beos_app login password 'beos_app';
  end if;
end $$;

-- Função auxiliar: organização da transação corrente (NULL se não definida).
create or replace function app_org_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.org_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- Identidade (globais, sem RLS por organização)
-- ---------------------------------------------------------------------------
create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  name text,
  phone_e164 text,
  is_operator boolean not null default false,
  created_at timestamptz not null default now()
);

create table auth_codes (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on auth_codes (email, created_at desc);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  active_org_id uuid,
  expires_at timestamptz not null,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Organizações
-- ---------------------------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null unique check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
  legal_name text,
  trade_name text not null,
  cnae text,
  sector text,
  revenue_band text not null,
  team_size int not null default 1,
  uf char(2),
  city text,
  stage text,
  locale text not null default 'pt-BR',
  currency char(3) not null default 'BRL',
  timezone text not null default 'America/Sao_Paulo',
  ritual_weekday int not null default 1 check (ritual_weekday between 0 and 6),
  ritual_time time not null default '08:30',
  ritual_channel text not null default 'whatsapp' check (ritual_channel in ('whatsapp','web','email')),
  data_salt text not null default encode(gen_random_bytes(16), 'hex'),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table memberships (
  user_id uuid not null references users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  role text not null check (role in ('owner','manager','member','partner','expert')),
  created_at timestamptz not null default now(),
  primary key (user_id, organization_id)
);
create index on memberships (organization_id);

-- ---------------------------------------------------------------------------
-- Tabelas de negócio (todas com organization_id + RLS)
-- ---------------------------------------------------------------------------
create table consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  kind text not null check (kind in ('terms','privacy','whatsapp_opt_in','open_finance','marketing')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  evidence jsonb not null default '{}'
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('bank_statement','spreadsheet','report','other')),
  filename text not null,
  mime text,
  size_bytes bigint not null,
  sha256 text not null,
  storage_key text not null,
  format text,
  status text not null default 'uploaded' check (status in ('uploaded','processing','processed','failed','blocked')),
  error text,
  meta jsonb not null default '{}',
  uploaded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (organization_id, sha256)
);

create table bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  bank_code text,
  bank_name text,
  account_key text not null,
  account_masked text,
  created_at timestamptz not null default now(),
  unique (organization_id, account_key)
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  bank_account_id uuid references bank_accounts(id) on delete cascade,
  document_id uuid references documents(id) on delete set null,
  posted_at date not null,
  amount_cents bigint not null,
  description text not null,
  counterparty_kind text check (counterparty_kind in ('pf','pj','unknown')),
  counterparty_key text,
  category_code text not null,
  category_source text not null check (category_source in ('org_rule','keyword','model','user','fallback')),
  confidence numeric(4,3) not null,
  personal_suspect boolean not null default false,
  needs_review boolean not null default false,
  dedupe_hash text not null,
  provenance jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (organization_id, dedupe_hash)
);
create index on transactions (organization_id, posted_at);

create table category_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  pattern text not null,
  direction text check (direction in ('inflow','outflow')),
  category_code text not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, pattern, direction)
);

create table raiox_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  reconcile_status text not null,
  result jsonb not null,
  narrative text,
  method_version text not null,
  created_at timestamptz not null default now()
);

create table business_facts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  value jsonb not null,
  fact_type text not null check (fact_type in ('provided','calculated','inferred','decided')),
  source text not null,
  confidence numeric(4,3),
  valid_until date,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on business_facts (organization_id, key, created_at desc);

create table metric_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  metric_code text not null,
  period_start date not null,
  period_end date not null,
  value numeric not null,
  source text not null check (source in ('raiox','manual','ritual','system')),
  document_id uuid references documents(id) on delete set null,
  recorded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on metric_values (organization_id, metric_code, period_end desc);

create table assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  method_version text not null,
  answers jsonb not null,
  dimension_scores jsonb not null,
  maturity_avg numeric(5,1),
  coverage numeric(4,3) not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table diagnoses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  assessment_id uuid not null references assessments(id) on delete cascade,
  raiox_id uuid references raiox_snapshots(id) on delete set null,
  method_version text not null,
  stage text not null,
  coverage numeric(4,3) not null,
  confidence numeric(4,3) not null,
  sufficient boolean not null,
  result jsonb not null,
  suggested_tracks jsonb not null default '[]',
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  diagnosis_id uuid references diagnoses(id) on delete set null,
  method_version text not null,
  status text not null default 'active' check (status in ('active','closed','abandoned')),
  starts_on date not null,
  ends_on date not null,
  closing jsonb,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
-- No máximo um ciclo ativo por organização.
create unique index cycles_one_active on cycles (organization_id) where status = 'active';

create table priorities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  cycle_id uuid not null references cycles(id) on delete cascade,
  position int not null check (position between 1 and 3),
  track_code text not null,
  track_version int not null,
  title text not null,
  dimension text not null,
  metric_code text not null,
  baseline numeric,
  target numeric,
  owner_user_id uuid references users(id) on delete set null,
  status text not null default 'active' check (status in ('active','replaced','done')),
  rationale jsonb not null default '{}',
  replaced_reason text,
  created_at timestamptz not null default now()
);
-- No máximo 3 prioridades ativas por ciclo (posição única entre as ativas).
create unique index priorities_active_position on priorities (cycle_id, position) where status = 'active';

create table milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  priority_id uuid not null references priorities(id) on delete cascade,
  code text not null,
  title text not null,
  week int not null,
  due_date date not null,
  evidence_required text not null,
  status text not null default 'open' check (status in ('open','done','late')),
  evidence text,
  completed_at timestamptz
);

create table actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  priority_id uuid not null references priorities(id) on delete cascade,
  milestone_id uuid references milestones(id) on delete cascade,
  action_key text not null,
  title text not null,
  week int not null,
  due_date date not null,
  role text not null default 'owner',
  assignee_user_id uuid references users(id) on delete set null,
  status text not null default 'todo' check (status in ('todo','doing','done','blocked','skipped')),
  done_at timestamptz,
  evidence text
);
create index on actions (organization_id, priority_id, week);

create table ritual_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  cycle_id uuid not null references cycles(id) on delete cascade,
  week int not null,
  channel text not null check (channel in ('whatsapp','web','email')),
  status text not null default 'scheduled' check (status in ('scheduled','sent','in_progress','answered','missed')),
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  answered_at timestamptz,
  duration_seconds int,
  questions jsonb not null default '[]',
  answers jsonb not null default '{}',
  outcome jsonb,
  created_at timestamptz not null default now(),
  unique (cycle_id, week)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','email','web')),
  direction text not null check (direction in ('outbound','inbound')),
  user_id uuid references users(id) on delete set null,
  template text,
  body text,
  payload jsonb not null default '{}',
  provider_message_id text,
  status text not null default 'queued',
  ritual_session_id uuid references ritual_sessions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on messages (provider_message_id);

create table recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('diagnosis','plan','ritual','advisor','raiox')),
  competency text,
  question text,
  content text not null,
  sources jsonb not null default '[]',
  confidence numeric(4,3),
  status text not null default 'shown' check (status in ('shown','accepted','rejected','blocked')),
  feedback text,
  method_version text not null,
  prompt_version text,
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  plan_code text not null check (plan_code in ('start','pro','scale')),
  billing_cycle text not null check (billing_cycle in ('monthly','annual')),
  status text not null check (status in ('pending','active','past_due','canceled')),
  provider text not null,
  provider_customer_id text,
  provider_subscription_id text,
  checkout_url text,
  current_period_end date,
  canceled_at timestamptz,
  created_at timestamptz not null default now()
);

create table ai_call_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  task text not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_micro_brl bigint not null default 0,
  latency_ms int not null default 0,
  guard_status text not null default 'ok',
  error text,
  created_at timestamptz not null default now()
);
create index on ai_call_logs (organization_id, created_at);

create table audit_events (
  id bigserial primary key,
  organization_id uuid references organizations(id) on delete set null,
  actor_user_id uuid references users(id) on delete set null,
  action text not null,
  target text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'consents','documents','bank_accounts','transactions','category_rules','raiox_snapshots',
    'business_facts','metric_values','assessments','diagnoses','cycles','priorities','milestones',
    'actions','ritual_sessions','messages','recommendations','subscriptions'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format($p$create policy tenant_isolation on %I
      using (organization_id = app_org_id())
      with check (organization_id = app_org_id())$p$, t);
  end loop;
end $$;

-- organizations: só enxerga a organização da transação.
alter table organizations enable row level security;
alter table organizations force row level security;
create policy org_self on organizations using (id = app_org_id()) with check (id = app_org_id());
-- Criação de organização acontece pelo caminho de sistema (função security definer abaixo).

-- ai_call_logs e audit_events: escrita com org (ou nula para sistema); leitura só da própria org.
alter table ai_call_logs enable row level security;
alter table ai_call_logs force row level security;
create policy ai_logs_rw on ai_call_logs using (organization_id = app_org_id()) with check (organization_id is null or organization_id = app_org_id());
alter table audit_events enable row level security;
alter table audit_events force row level security;
create policy audit_insert on audit_events for insert with check (organization_id is null or organization_id = app_org_id());
create policy audit_read on audit_events for select using (organization_id = app_org_id());

-- Criação de organização + vínculo do dono numa operação atômica (caminho de sistema).
create or replace function create_organization(
  p_user_id uuid, p_cnpj text, p_trade_name text, p_revenue_band text, p_team_size int,
  p_sector text, p_uf text, p_city text, p_legal_name text, p_cnae text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into organizations (cnpj, trade_name, revenue_band, team_size, sector, uf, city, legal_name, cnae)
  values (p_cnpj, p_trade_name, p_revenue_band, p_team_size, p_sector, p_uf, p_city, p_legal_name, p_cnae)
  returning id into v_id;
  insert into memberships (user_id, organization_id, role) values (p_user_id, v_id, 'owner');
  return v_id;
end $$;

-- Exclusão de conta (RF17): apaga a organização e tudo em cascata, deixando trilha de auditoria.
create or replace function delete_organization(p_org uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_events (organization_id, actor_user_id, action, target) values (null, p_actor, 'organization.deleted', p_org::text);
  delete from organizations where id = p_org;
end $$;

-- Permissões do papel da aplicação
grant usage on schema public to beos_app;
grant select, insert, update, delete on all tables in schema public to beos_app;
grant usage, select on all sequences in schema public to beos_app;
revoke update, delete on audit_events from beos_app;
grant execute on function create_organization(uuid,text,text,text,int,text,text,text,text,text) to beos_app;
grant execute on function delete_organization(uuid,uuid) to beos_app;
grant execute on function app_org_id() to beos_app;

-- Lista as organizações de um usuário (para o seletor), sem abrir RLS de organizations.
create or replace function user_organizations(p_user uuid)
returns table (id uuid, trade_name text, cnpj text, role text)
language sql security definer set search_path = public stable as $$
  select o.id, o.trade_name, o.cnpj, m.role
  from memberships m join organizations o on o.id = m.organization_id
  where m.user_id = p_user and o.deleted_at is null
  order by o.created_at
$$;
grant execute on function user_organizations(uuid) to beos_app;
