-- ============================================================================
-- KalaPOS (Kafe Kala Single-Cafe Multi-Branch POS) — Production Supabase Schema
-- Project: kalapos-kala (ap-southeast-1)
-- Currency: IDR (BIGINT integer, zero floating-point money fields)
-- Stock/Recipe quantities: NUMERIC(12, 3)
-- Business Rules:
--   1. Single cafe ("Kafe Kala") with strictly 1 official OWNER (partial unique index).
--   2. Hybrid Menu: products.branch_id IS NULL = Central Menu; non-null = Branch-Local Menu.
--   3. Recipes linked for HPP & shift estimates ONLY (NO automatic stock deduction on checkout).
--   4. Strict Server-Only RLS: direct anon/authenticated PostgREST access is denied;
--      Next.js server routes authenticate via HttpOnly HMAC-SHA256 cookies & service_role.
-- ============================================================================

create type public.kalapos_role as enum ('OWNER', 'MANAGER', 'CASHIER', 'BARISTA');
create type public.branch_status as enum ('ACTIVE', 'RENOVATION', 'INACTIVE');
create type public.order_status as enum ('HOLD', 'QUEUED', 'PREPARING', 'READY', 'COMPLETED', 'VOID');
create type public.order_type as enum ('DINE_IN', 'TAKEAWAY');
create type public.payment_method as enum ('CASH', 'QRIS', 'CARD');
create type public.stock_movement_type as enum (
  'SALE_DEDUCT',
  'MANUAL_OUT',
  'RESTOCK',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'WASTE',
  'OPNAME'
);
create type public.shift_status as enum ('OPEN', 'CLOSED');
create type public.stock_transfer_status as enum ('PENDING', 'COMPLETED', 'CANCELLED');
create type public.product_tone as enum ('sand', 'rose', 'olive', 'tan', 'slate');

-- ============================================================================
-- Tables & Indexes
-- ============================================================================

create table public.branches (
  id text primary key,
  code text not null,
  name text not null,
  address text not null default '',
  phone text not null default '',
  tax_rate integer not null default 10 check (tax_rate between 0 and 100),
  service_charge_rate integer not null default 0 check (service_charge_rate between 0 and 100),
  receipt_footer text not null default 'Terima kasih telah singgah di Kafe Kala.',
  status public.branch_status not null default 'ACTIVE',
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index idx_branches_active_code_unique
  on public.branches (upper(code))
  where deleted_at is null;

create table public.kala_users (
  id text primary key,
  branch_id text references public.branches(id) on delete set null,
  full_name text not null,
  email text not null,
  password_hash text not null,
  role public.kalapos_role not null default 'CASHIER',
  pin_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint chk_owner_no_branch check (
    (role = 'OWNER' and branch_id is null) or role <> 'OWNER'
  )
);

create unique index idx_kala_users_email_lower on public.kala_users (lower(email));
create unique index idx_kala_users_single_owner on public.kala_users (role) where role = 'OWNER';
create index idx_kala_users_branch_id on public.kala_users (branch_id);

create table public.categories (
  id text primary key,
  name text not null,
  sort_order integer not null default 0
);

create unique index idx_categories_name_lower on public.categories (lower(name));

create table public.ingredients (
  id text primary key,
  sku text not null,
  name text not null,
  unit text not null default 'g',
  cost_per_unit bigint not null default 0 check (cost_per_unit >= 0)
);

create unique index idx_ingredients_sku_upper on public.ingredients (upper(sku));

create table public.products (
  id text primary key,
  category_id text not null references public.categories(id) on delete restrict,
  branch_id text references public.branches(id) on delete cascade,
  name text not null,
  base_price bigint not null check (base_price >= 0),
  sku text not null,
  mark text not null default 'MN',
  tone public.product_tone not null default 'sand',
  is_customizable boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index idx_products_sku_upper on public.products (upper(sku));
create index idx_products_category_id on public.products (category_id);
create index idx_products_branch_id on public.products (branch_id);

create table public.branch_products (
  branch_id text not null references public.branches(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  is_available boolean not null default true,
  custom_price bigint check (custom_price is null or custom_price >= 0),
  primary key (branch_id, product_id)
);

create index idx_branch_products_product_id on public.branch_products (product_id);

create table public.modifier_groups (
  id text primary key,
  name text not null,
  required boolean not null default false
);

create table public.modifier_options (
  id text primary key,
  group_id text not null references public.modifier_groups(id) on delete cascade,
  name text not null,
  price_delta bigint not null default 0,
  ingredient_id text references public.ingredients(id) on delete set null,
  qty_required numeric(12, 3) not null default 0 check (qty_required >= 0)
);

create index idx_modifier_options_group_id on public.modifier_options (group_id);
create index idx_modifier_options_ingredient_id on public.modifier_options (ingredient_id);

create table public.product_modifier_groups (
  product_id text not null references public.products(id) on delete cascade,
  group_id text not null references public.modifier_groups(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (product_id, group_id)
);

create index idx_product_modifier_groups_group_id on public.product_modifier_groups (group_id);

create table public.product_recipes (
  product_id text not null references public.products(id) on delete cascade,
  ingredient_id text not null references public.ingredients(id) on delete cascade,
  qty_required numeric(12, 3) not null check (qty_required > 0),
  primary key (product_id, ingredient_id)
);

create index idx_product_recipes_ingredient_id on public.product_recipes (ingredient_id);

create table public.branch_stocks (
  branch_id text not null references public.branches(id) on delete cascade,
  ingredient_id text not null references public.ingredients(id) on delete cascade,
  current_qty numeric(12, 3) not null default 0 check (current_qty >= 0),
  min_threshold numeric(12, 3) not null default 0 check (min_threshold >= 0),
  primary key (branch_id, ingredient_id)
);

create index idx_branch_stocks_ingredient_id on public.branch_stocks (ingredient_id);

create table public.shifts (
  id text primary key,
  branch_id text not null,
  user_id text not null,
  opening_cash bigint not null default 0 check (opening_cash >= 0),
  expected_cash bigint not null default 0 check (expected_cash >= 0),
  actual_cash bigint check (actual_cash is null or actual_cash >= 0),
  status public.shift_status not null default 'OPEN',
  notes text not null default '',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_stocks jsonb not null default '[]'::jsonb,
  closing_stocks jsonb
);

create index idx_shifts_branch_status on public.shifts (branch_id, status);
create index idx_shifts_branch_opened on public.shifts (branch_id, opened_at desc);
create unique index idx_shifts_one_open_per_branch on public.shifts (branch_id) where status = 'OPEN';

create table public.orders (
  id text primary key,
  branch_id text not null,
  shift_id text references public.shifts(id) on delete set null,
  order_number text not null,
  queue_number text not null,
  customer_name text not null default 'Pelanggan',
  order_type public.order_type not null default 'TAKEAWAY',
  table_number text,
  status public.order_status not null default 'HOLD',
  subtotal bigint not null default 0 check (subtotal >= 0),
  tax_amount bigint not null default 0 check (tax_amount >= 0),
  service_charge bigint not null default 0 check (service_charge >= 0),
  discount bigint not null default 0 check (discount >= 0),
  discount_reason text,
  total bigint not null default 0 check (total >= 0),
  payment_method public.payment_method,
  tendered_amount bigint check (tendered_amount is null or tendered_amount >= 0),
  change_amount bigint check (change_amount is null or change_amount >= 0),
  split_payments jsonb,
  void_reason text,
  voided_by text,
  cashier_id text,
  idempotency_key text unique not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (branch_id, order_number)
);

create index idx_orders_branch_created on public.orders (branch_id, created_at desc);
create index idx_orders_branch_status on public.orders (branch_id, status);
create index idx_orders_shift_id on public.orders (shift_id);
create index idx_orders_created_at on public.orders (created_at desc);

create table public.order_items (
  id text primary key,
  order_id text not null references public.orders(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  product_name_snapshot text not null,
  unit_price_snapshot bigint not null check (unit_price_snapshot >= 0),
  unit_cogs_snapshot bigint not null default 0 check (unit_cogs_snapshot >= 0),
  modifiers_snapshot jsonb not null default '[]'::jsonb,
  qty integer not null check (qty > 0),
  subtotal bigint not null check (subtotal >= 0),
  barista_notes text not null default ''
);

create index idx_order_items_order_id on public.order_items (order_id);
create index idx_order_items_product_id on public.order_items (product_id);

create table public.stock_movements (
  id text primary key,
  branch_id text not null,
  shift_id text references public.shifts(id) on delete set null,
  ingredient_id text not null,
  type public.stock_movement_type not null,
  qty_delta numeric(12, 3) not null,
  balance_after numeric(12, 3) not null check (balance_after >= 0),
  reference_id text,
  notes text not null default '',
  created_by text,
  created_at timestamptz not null default now()
);

create index idx_stock_movements_branch_created on public.stock_movements (branch_id, created_at desc);
create index idx_stock_movements_shift_id on public.stock_movements (shift_id);
create index idx_stock_movements_ingredient_id on public.stock_movements (ingredient_id);

create table public.stock_transfers (
  id text primary key,
  from_branch_id text not null,
  to_branch_id text not null,
  ingredient_id text not null,
  qty numeric(12, 3) not null check (qty > 0),
  status public.stock_transfer_status not null default 'COMPLETED',
  notes text not null default '',
  created_by text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint chk_transfer_diff_branches check (from_branch_id <> to_branch_id)
);

create index idx_stock_transfers_from_branch on public.stock_transfers (from_branch_id, created_at desc);
create index idx_stock_transfers_to_branch on public.stock_transfers (to_branch_id, created_at desc);
create index idx_stock_transfers_ingredient_id on public.stock_transfers (ingredient_id);

-- ============================================================================
-- Strict Row-Level Security (Deny direct client access; server uses service_role)
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'branches',
    'kala_users',
    'categories',
    'ingredients',
    'products',
    'branch_products',
    'modifier_groups',
    'modifier_options',
    'product_modifier_groups',
    'product_recipes',
    'branch_stocks',
    'shifts',
    'orders',
    'order_items',
    'stock_movements',
    'stock_transfers'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      t || '_deny_client_direct_access',
      t
    );
  end loop;
end $$;
