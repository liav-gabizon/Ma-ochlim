-- הוחל על פרויקט Supabase ma-ochlim (fjsgstkuvqmyrqzsvjef) ב־2.10.2026
create table public.app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);
alter table public.app_state enable row level security;
create policy "app_state_select_own" on public.app_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "app_state_insert_own" on public.app_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "app_state_update_own" on public.app_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "app_state_delete_own" on public.app_state for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger app_state_touch before update on public.app_state for each row execute function public.touch_updated_at();

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error text
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
create policy "push_select_own" on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "push_insert_own" on public.push_subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "push_update_own" on public.push_subscriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "push_delete_own" on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);

create table public.notification_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  status text not null default 'sending',
  detail text,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);
alter table public.notification_events enable row level security;
create policy "events_select_own" on public.notification_events for select to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.app_state to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select on public.notification_events to authenticated;
revoke all on public.app_state, public.push_subscriptions, public.notification_events from anon;
