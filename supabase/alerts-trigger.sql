-- Run once (after deploying the "notify" Edge Function and installing Integrations -> Database Webhooks).
-- Sends every new activity event to the notify function, which emails the client(s).
-- Replace the project ref in the URL if you ever move to a new Supabase project.
drop trigger if exists notify_on_event on public.events;
create trigger notify_on_event
  after insert on public.events
  for each row execute function supabase_functions.http_request(
    'https://ugrbmpvtyixowqxwylou.supabase.co/functions/v1/notify',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );
