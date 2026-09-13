-- Any new authenticated public RPC must be reviewed explicitly.
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

select is(
  (
    select array_agg(p.proname order by p.proname)
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and has_function_privilege('authenticated',p.oid,'execute')
  ),
  array[
    'apply_nat_transition_v4',
    'bootstrap_nat_business',
    'cancel_calendar_event_v2',
    'configure_content_ai',
    'content_ai_status',
    'delete_push_subscription',
    'disconnect_content_ai',
    'erase_customer_privacy_v1',
    'get_business_intelligence_snapshot_v1',
    'get_customers_snapshot',
    'get_dashboard_summary',
    'get_financial_funding_snapshot',
    'get_financial_truth_snapshot_v1',
    'get_integration_health',
    'get_inventory_snapshot',
    'get_nat_schema_version',
    'get_owner_cash_movements_snapshot',
    'get_push_public_key',
    'get_supply_purchase_snapshot',
    'list_access_review_status_v1',
    'list_expenses_page',
    'list_sales_page',
    'list_supply_purchases_page',
    'mark_sale_paid_v1',
    'quote_sale_v1',
    'record_access_review_v1',
    'record_inventory_production_v2',
    'save_calendar_event_v3',
    'save_push_subscription',
    'seed_nat_editorial_calendar',
    'set_inventory_balance',
    'set_product_availability',
    'set_product_stock_v2',
    'stage_recipe_import_v1'
  ]::name[],
  'authenticated public RPC surface matches the reviewed allowlist'
);

select * from finish();
rollback;
