begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into public.businesses(id,name) values('91919191-9191-4919-8919-919191919191','P0 test');
insert into private.allowed_auth_emails(email,business_id,role) values('p0@example.invalid','91919191-9191-4919-8919-919191919191','admin');
insert into auth.users(id,email,aud,role,created_at,updated_at) values('92929292-9292-4929-8929-929292929292','p0@example.invalid','authenticated','authenticated',now(),now());
insert into public.business_members(business_id,user_id,role) values('91919191-9191-4919-8919-919191919191','92929292-9292-4929-8929-929292929292','admin');
insert into public.business_settings(business_id,owner_name,default_minimum_margin_percent,default_target_margin_percent) values('91919191-9191-4919-8919-919191919191','P0',10,15);

select has_table('public','customers','customers table exists');
select has_column('public','products','labor_cost_per_batch','products has explicit labor cost');
select has_column('public','sales','transaction_type','sales classify commercial and non-commercial movements');
select has_column('public','sales','customer_id','sales may be linked to a customer');

set local role authenticated;
select set_config('request.jwt.claim.sub','92929292-9292-4929-8929-929292929292',true);
select set_config('request.jwt.claims','{"sub":"92929292-9292-4929-8929-929292929292","role":"authenticated","aal":"aal2"}',true);

select is(has_table_privilege(current_user,'public.customers','INSERT'),false,'customers cannot be written directly by authenticated users');

select lives_ok($$
  select public.apply_nat_transition_v2(
    '91919191-9191-4919-8919-919191919191',gen_random_uuid(),
    '[{"type":"save_customer","payload":{"id":"93939393-9393-4939-8939-939393939393","name":"Maria Teste","marketingConsent":false,"active":true}}]'::jsonb
  )
$$,'customer is written through authoritative transition');
select is((select name from public.customers where id='93939393-9393-4939-8939-939393939393'),'Maria Teste','customer is readable for its business');

select lives_ok($$
  select public.apply_nat_transition_v2(
    '91919191-9191-4919-8919-919191919191',gen_random_uuid(),
    '[{"type":"save_supply","payload":{"id":"94949494-9494-4949-8949-949494949494","name":"Ingrediente teste","category":"ingredient","packageQuantity":100,"packageUnit":"g","packagePrice":10,"purchasedAt":"2026-09-11"}},
      {"type":"save_product","payload":{"id":"95959595-9595-4959-8959-959595959595","name":"Produto P0","batchYield":10,"sellingPrice":6,"lossPercent":10,"laborCostPerBatch":20,"productionCostPerBatch":10,"minimumMarginPercent":10,"targetMarginPercent":15,"recipe":[{"id":"96969696-9696-4969-8969-969696969696","supplyId":"94949494-9494-4949-8949-949494949494","quantity":100,"unit":"g"}]}}]'::jsonb
  )
$$,'product saves explicit labor and overhead');
select is((select labor_cost_per_batch from public.products where id='95959595-9595-4959-8959-959595959595'),20::numeric,'labor is stored separately');

select throws_ok($$
  select public.apply_nat_transition_v2(
    '91919191-9191-4919-8919-919191919191',gen_random_uuid(),
    '[{"type":"save_product","payload":{"id":"97979797-9797-4979-8979-979797979797","name":"Margem inválida","batchYield":10,"sellingPrice":6,"lossPercent":0,"laborCostPerBatch":0,"productionCostPerBatch":0,"minimumMarginPercent":20,"targetMarginPercent":10,"recipe":[{"id":"98989898-9898-4989-8989-989898989898","supplyId":"94949494-9494-4949-8949-949494949494","quantity":10,"unit":"g"}]}}]'::jsonb
  )
$$,'22023','A margem recomendada não pode ser menor que a margem mínima.','recommended margin cannot be below minimum');

select lives_ok($$
  select public.apply_nat_transition_v2(
    '91919191-9191-4919-8919-919191919191',gen_random_uuid(),
    '[{"type":"save_sale_items","payload":{"id":"99999999-9999-4999-8999-999999999999","items":[{"productId":"95959595-9595-4959-8959-959595959595","quantity":1}],"totalReceived":0,"paymentMethod":"other","soldAt":"2026-09-11T12:00:00-03:00","customerId":"93939393-9393-4939-8939-939393939393","transactionType":"courtesy"}}]'::jsonb
  )
$$,'courtesy can be linked to customer without revenue');
select is((select transaction_type from public.sales where id='99999999-9999-4999-8999-999999999999'),'courtesy','courtesy keeps its movement type');
select is((select customer_id from public.sales where id='99999999-9999-4999-8999-999999999999'),'93939393-9393-4939-8939-939393939393'::uuid,'movement keeps customer link');
select is((select labor_cost_snapshot from public.sale_items where sale_id='99999999-9999-4999-8999-999999999999'),2::numeric,'sale item freezes labor per unit');

select * from finish();
rollback;
