-- הסודות עצמם (VAPID, cron_secret) נשמרו ב־Vault דרך SQL ישיר ואינם במאגר.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function public.push_config()
returns table (vapid_public text, vapid_private text, vapid_subject text, cron_secret text)
language sql security definer set search_path = '' stable as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_subject'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret');
$$;
revoke execute on function public.push_config() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;

select cron.schedule('ma-ochlim-reminders', '* * * * *', $$
  select net.http_post(
    url := 'https://fjsgstkuvqmyrqzsvjef.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 20000);
$$);
