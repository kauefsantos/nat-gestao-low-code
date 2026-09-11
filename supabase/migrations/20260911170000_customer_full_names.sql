begin;

-- Reserved migration version.
-- Any production-only correction of customer data is performed administratively
-- and intentionally stays out of this public repository.
select 1;

commit;
