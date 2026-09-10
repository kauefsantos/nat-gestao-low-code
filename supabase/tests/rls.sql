-- NAT Gestão RLS regression tests. Run against a disposable/local database.
begin;

insert into private.allowed_auth_emails(email) values
  ('rls-a@example.invalid'), ('rls-b@example.invalid')
on conflict do nothing;

insert into auth.users(id,email,aud,role,created_at,updated_at) values
  ('11111111-1111-4111-8111-111111111111','rls-a@example.invalid','authenticated','authenticated',now(),now()),
  ('22222222-2222-4222-8222-222222222222','rls-b@example.invalid','authenticated','authenticated',now(),now());
insert into public.businesses(id,name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Tenant A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Tenant B');
insert into public.business_members(business_id,user_id,role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','admin'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','admin');
insert into public.supplies(id,business_id,name,category) values
  ('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Chocolate A','ingredient'),
  ('bbbbbbbb-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Chocolate B','ingredient');
insert into public.products(id,business_id,name,batch_yield) values
  ('aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Brownie A',12),
  ('bbbbbbbb-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Brownie B',12);

do $$ begin
  if has_table_privilege('anon','public.sales','select') then raise exception 'anon has SELECT on sales'; end if;
  if has_table_privilege('anon','public.sales','insert') then raise exception 'anon has INSERT on sales'; end if;
  if has_table_privilege('authenticated','public.audit_log','insert') then raise exception 'authenticated can write audit_log'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',true);
do $$ declare n integer; begin select count(*) into n from public.supplies; if n <> 0 then raise exception 'AAL1 saw protected rows'; end if; end $$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',true);
do $$ declare n integer; begin select count(*) into n from public.supplies; if n <> 1 then raise exception 'tenant isolation failed'; end if; end $$;
do $$ begin begin insert into public.supplies(business_id,name,category) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Blocked','ingredient'); raise exception 'cross tenant insert succeeded'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin update public.supplies set business_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where id='aaaaaaaa-0000-4000-8000-000000000001'; raise exception 'cross tenant move succeeded'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin insert into public.recipe_items(business_id,product_id,supply_id,quantity,unit) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000001',10,'g'); raise exception 'cross tenant FK succeeded'; exception when foreign_key_violation then null; end; end $$;
do $$ begin begin update public.business_members set role='member' where business_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id='11111111-1111-4111-8111-111111111111'; raise exception 'sole admin demotion succeeded'; exception when check_violation then null; end; end $$;
rollback;
