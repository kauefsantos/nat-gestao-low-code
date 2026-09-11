-- Regression guard for operational supplies that are neither ingredient nor packaging.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into public.businesses(id,name)
values('abababab-abab-4aba-8aba-abababababab','Supply category test');
insert into private.allowed_auth_emails(email,business_id,role)
values('supply-other@example.invalid','abababab-abab-4aba-8aba-abababababab','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at)
values('66666666-6666-4666-8666-666666666666','supply-other@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role)
values('abababab-abab-4aba-8aba-abababababab','66666666-6666-4666-8666-666666666666','admin');
insert into public.business_settings(business_id,owner_name)
values('abababab-abab-4aba-8aba-abababababab','Supply test');

set local role authenticated;
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
select set_config('request.jwt.claims','{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated","aal":"aal2"}',true);

select lives_ok(
  $$select public.save_supply('abababab-abab-4aba-8aba-abababababab','abababab-0000-4000-8000-000000000001','Papel-manteiga','other',50,'unit',18,current_date)$$,
  'other operational supply can be saved through the authoritative RPC'
);
select is(
  (select category from public.supplies where id='abababab-0000-4000-8000-000000000001'),
  'other'::text,
  'saved operational supply keeps category other'
);
select is(
  (select count(*)::bigint from public.supply_purchases where supply_id='abababab-0000-4000-8000-000000000001'),
  1::bigint,
  'saving another supply also records its purchase history'
);
select throws_ok(
  $$select public.save_supply('abababab-abab-4aba-8aba-abababababab','abababab-0000-4000-8000-000000000002','Inválido','unsupported',1,'unit',1,current_date)$$,
  '22023','Dados da compra inválidos.','unsupported supply category remains rejected'
);

select * from finish();
rollback;
