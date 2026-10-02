revoke insert, update, delete, truncate, references, trigger on public.notification_events from authenticated;
revoke truncate, references, trigger on public.app_state, public.push_subscriptions from authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
