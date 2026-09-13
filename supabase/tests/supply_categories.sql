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
  $$select public.apply_nat_transition_v4('abababab-abab-4aba-8aba-abababababab','abababab-1000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('type','save_supply','payload',jsonb_build_object('id','abababab-0000-4000-8000-000000000001','name','Papel-manteiga','category','other','packageQuantity',50,'packageUnit','unit','packagePrice',18,'purchasedAt',current_date::text))))$$,
  'other operational supply can be saved through the authoritative transition'
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
  $$select public.apply_nat_transition_v4('abababab-abab-4aba-8aba-abababababab','abababab-1000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object('type','save_supply','payload',jsonb_build_object('id','abababab-0000-4000-8000-000000000002','name','Inválido','category','unsupported','packageQuantity',1,'packageUnit','unit','packagePrice',1,'purchasedAt',current_date::text))))$$,
  '22023','Dados da compra inválidos.','unsupported supply category remains rejected'
);

select * from finish();
rollback;
