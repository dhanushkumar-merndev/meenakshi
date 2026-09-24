# IP stock search pagination

The IP fulfilment picker now offers **Show more items**, 25 at a time. Search text resets pagination. The API reads one extra row to detect the next page; identical display names are ordered by stock ID as a final tie-breaker.

## Release order

1. Apply `supabase/migrations/20260924120000_paginate_ip_stock_catalog.sql` to staging and run `supabase/tests/ip_stock_pagination.test.sql` there.
2. Apply that reviewed migration to the deployment database before releasing the updated app.
3. Deploy the application and verify the picker without submitting a fulfilment.

The migration adds only a read-only function and its permissions. It does not insert, update, or delete hospital records. The existing search function remains unchanged. The new function allows active admin/pharmacy roles through the existing role check.

No migration has been applied by this change. The SQL test has not run locally because a local PostgreSQL/Supabase test database is unavailable. The test creates isolated fixture rows inside a rolled-back transaction and must only run against local/staging databases.
