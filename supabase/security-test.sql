-- Security test: paste into Supabase SQL Editor and Run. Simulates two clients, a stranger and the agent,
-- prints pass/fail values next to what is expected, and deletes its own test data. Safe to run any time.
create temp table if not exists sec_test(step int, who text, check_name text, result text);
truncate sec_test;
do $$
declare a_tx uuid; b_tx uuid; n int; ag boolean; res text[] := '{}';
begin
  insert into public.transactions(side,client_name,client_emails) values('seller','SECURITY TEST A',array['clienta@test.invalid']) returning id into a_tx;
  insert into public.transactions(side,client_name,client_emails) values('buyer','SECURITY TEST B',array['clientb@test.invalid']) returning id into b_tx;
  insert into public.steps(transaction_id,position,title) values (a_tx,1,'A step'),(b_tx,1,'B step');
  insert into public.feedback(transaction_id,comments) values (a_tx,'A feedback'),(b_tx,'B feedback');

  -- ===== Client A =====
  perform set_config('request.jwt.claims','{"email":"clienta@test.invalid","role":"authenticated"}',true);
  set local role authenticated;
  select count(*) into n from public.transactions; res := res || ('Client A' || ' | ' || 'homes visible (expect 1)' || ' | ' || (n)::text);
  select count(*) into n from public.transactions where id=b_tx; res := res || ('Client A' || ' | ' || 'can see Client B home (expect 0)' || ' | ' || (n)::text);
  select count(*) into n from public.steps where transaction_id=b_tx; res := res || ('Client A' || ' | ' || 'can see Client B steps (expect 0)' || ' | ' || (n)::text);
  select count(*) into n from public.feedback; res := res || ('Client A' || ' | ' || 'feedback rows visible (expect 1, own only)' || ' | ' || (n)::text);
  update public.transactions set client_name='hacked' where id=a_tx; get diagnostics n=row_count; res := res || ('Client A' || ' | ' || 'can edit own home (expect 0)' || ' | ' || (n)::text);
  update public.transactions set client_emails=array['clienta@test.invalid'] where id=b_tx; get diagnostics n=row_count; res := res || ('Client A' || ' | ' || 'can add self to Client B home (expect 0)' || ' | ' || (n)::text);
  update public.steps set done=true where transaction_id=a_tx; get diagnostics n=row_count; res := res || ('Client A' || ' | ' || 'can check off own steps (expect 0)' || ' | ' || (n)::text);
  begin insert into public.agents values('clienta@test.invalid'); res := res || ('Client A' || ' | ' || 'can make self agent (expect blocked)' || ' | ' || ('ALLOWED - PROBLEM')::text);
  exception when others then res := res || ('Client A' || ' | ' || 'can make self agent (expect blocked)' || ' | ' || ('blocked')::text); end;
  select public.is_agent() into ag; res := res || ('Client A' || ' | ' || 'is agent (expect false)' || ' | ' || (ag)::text);
  reset role;

  -- ===== Client B =====
  perform set_config('request.jwt.claims','{"email":"clientb@test.invalid","role":"authenticated"}',true);
  set local role authenticated;
  select count(*) into n from public.transactions; res := res || ('Client B' || ' | ' || 'homes visible (expect 1)' || ' | ' || (n)::text);
  select count(*) into n from public.transactions where id=a_tx; res := res || ('Client B' || ' | ' || 'can see Client A home (expect 0)' || ' | ' || (n)::text);
  select count(*) into n from public.feedback where transaction_id=a_tx; res := res || ('Client B' || ' | ' || 'can see Client A feedback (expect 0)' || ' | ' || (n)::text);
  reset role;

  -- ===== Stranger with an account but no home =====
  perform set_config('request.jwt.claims','{"email":"stranger@test.invalid","role":"authenticated"}',true);
  set local role authenticated;
  select count(*) into n from public.transactions; res := res || ('Stranger' || ' | ' || 'homes visible (expect 0)' || ' | ' || (n)::text);
  select count(*) into n from public.events; res := res || ('Stranger' || ' | ' || 'activity visible (expect 0)' || ' | ' || (n)::text);
  delete from public.transactions where id=a_tx; get diagnostics n=row_count; res := res || ('Stranger' || ' | ' || 'can delete a home (expect 0)' || ' | ' || (n)::text);
  reset role;

  -- ===== Agent (Landon) =====
  perform set_config('request.jwt.claims','{"email":"landonfarley@kw.com","role":"authenticated"}',true);
  set local role authenticated;
  select public.is_agent() into ag; res := res || ('Agent' || ' | ' || 'is agent (expect true)' || ' | ' || (ag)::text);
  select count(*) into n from public.transactions where id in (a_tx,b_tx); res := res || ('Agent' || ' | ' || 'sees both test homes (expect 2)' || ' | ' || (n)::text);
  update public.steps set done=true where transaction_id=a_tx; get diagnostics n=row_count; res := res || ('Agent' || ' | ' || 'can check off a step (expect 1)' || ' | ' || (n)::text);
  reset role;

  perform set_config('request.jwt.claims','',true);
  delete from public.transactions where id in (a_tx,b_tx);
  select count(*) into n from public.transactions where client_name like 'SECURITY TEST%'; res := res || ('Cleanup' || ' | ' || 'test homes left behind (expect 0)' || ' | ' || (n)::text);
  delete from pg_temp.sec_test; insert into pg_temp.sec_test(step, who) select ord, r from unnest(res) with ordinality as t(r, ord);
end $$;
select who as result from pg_temp.sec_test order by step;
