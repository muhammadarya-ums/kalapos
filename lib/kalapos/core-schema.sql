-- ============================================================================
-- KalaPOS Multi-Branch Cafe Operations — Core PostgreSQL Schema & Atomic RPCs
-- Currency: IDR (BIGINT integer, zero floating-point money fields)
-- ============================================================================

create extension if not exists pgcrypto;

-- Enums
create type public.kalapos_role as enum ('OWNER', 'MANAGER', 'CASHIER', 'BARISTA');
create type public.branch_status as enum ('ACTIVE', 'RENOVATION', 'INACTIVE');
create type public.order_status as enum ('HOLD', 'QUEUED', 'PREPARING', 'READY', 'COMPLETED', 'VOID');
create type public.order_type as enum ('DINE_IN', 'TAKEAWAY');
create type public.payment_method as enum ('CASH', 'QRIS', 'CARD');
create type public.stock_movement_type as enum (
  'SALE_DEDUCT',
  'RESTOCK',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'WASTE',
  'OPNAME'
);

-- ============================================================================
-- Core Entities
-- ============================================================================

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  address text not null default '',
  phone text not null default '',
  tax_rate integer not null default 10 check (tax_rate between 0 and 100),
  service_charge_rate integer not null default 0 check (service_charge_rate between 0 and 100),
  receipt_footer text not null default 'Terima kasih, sampai jumpa kembali.',
  status public.branch_status not null default 'ACTIVE',
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  branch_id uuid references public.branches(id),
  full_name text not null,
  email text not null unique,
  role public.kalapos_role not null default 'CASHIER',
  pin_hash text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0
);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  unit text not null,
  cost_per_unit bigint not null default 0 check (cost_per_unit >= 0)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id),
  name text not null,
  base_price bigint not null check (base_price >= 0),
  sku text unique,
  is_customizable boolean not null default false,
  is_active boolean not null default true
);

create table public.branch_products (
  branch_id uuid references public.branches(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  is_available boolean not null default true,
  custom_price bigint check (custom_price >= 0),
  primary key (branch_id, product_id)
);

create table public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  required boolean not null default false
);

create table public.modifier_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.modifier_groups(id) on delete cascade,
  name text not null,
  price_delta bigint not null default 0,
  ingredient_id uuid references public.ingredients(id),
  qty_required numeric(12, 3) not null default 0
);

create table public.product_modifier_groups (
  product_id uuid references public.products(id) on delete cascade,
  group_id uuid references public.modifier_groups(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (product_id, group_id)
);

create table public.product_recipes (
  product_id uuid references public.products(id) on delete cascade,
  ingredient_id uuid references public.ingredients(id),
  qty_required numeric(12, 3) not null check (qty_required > 0),
  primary key (product_id, ingredient_id)
);

create table public.branch_stocks (
  branch_id uuid references public.branches(id),
  ingredient_id uuid references public.ingredients(id),
  current_qty numeric(12, 3) not null default 0,
  min_threshold numeric(12, 3) not null default 0,
  primary key (branch_id, ingredient_id)
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  user_id uuid not null references public.users(id),
  opening_cash bigint not null default 0,
  expected_cash bigint not null default 0,
  actual_cash bigint,
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  shift_id uuid references public.shifts(id),
  order_number text not null,
  queue_number text not null,
  customer_name text not null default 'Pelanggan',
  order_type public.order_type not null default 'TAKEAWAY',
  table_number text,
  status public.order_status not null default 'HOLD',
  subtotal bigint not null default 0,
  tax_amount bigint not null default 0,
  service_charge bigint not null default 0,
  discount bigint not null default 0,
  total bigint not null default 0,
  payment_method public.payment_method,
  void_reason text,
  voided_by uuid references public.users(id),
  cashier_id uuid references public.users(id),
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (branch_id, order_number)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name_snapshot text not null,
  unit_price_snapshot bigint not null,
  modifiers_snapshot jsonb not null default '[]'::jsonb,
  qty integer not null check (qty > 0),
  subtotal bigint not null,
  barista_notes text not null default ''
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  ingredient_id uuid not null references public.ingredients(id),
  type public.stock_movement_type not null,
  qty_delta numeric(12, 3) not null,
  balance_after numeric(12, 3) not null,
  reference_id uuid,
  notes text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  from_branch_id uuid not null references public.branches(id),
  to_branch_id uuid not null references public.branches(id),
  ingredient_id uuid not null references public.ingredients(id),
  qty numeric(12, 3) not null check (qty > 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'COMPLETED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Indexes for operational queries
create index idx_orders_branch_created on public.orders (branch_id, created_at desc);
create index idx_orders_branch_status on public.orders (branch_id, status);
create index idx_stock_movements_branch_created on public.stock_movements (branch_id, created_at desc);
create index idx_shifts_branch_status on public.shifts (branch_id, status);

-- ============================================================================
-- Row-Level Security (Multi-Branch Isolation)
-- ============================================================================

create or replace function public.kalapos_is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'OWNER'
      and u.is_active
  )
$$;

create or replace function public.kalapos_branch_allowed(target_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.kalapos_is_owner() or exists(
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.branch_id = target_branch
      and u.is_active
  )
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'branches',
    'users',
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
  end loop;
end $$;

grant select, insert, update, delete on
  public.branches,
  public.users,
  public.categories,
  public.ingredients,
  public.products,
  public.branch_products,
  public.modifier_groups,
  public.modifier_options,
  public.product_modifier_groups,
  public.product_recipes,
  public.branch_stocks,
  public.shifts,
  public.orders,
  public.order_items,
  public.stock_movements,
  public.stock_transfers
to authenticated;

create policy branches_read on public.branches for select to authenticated
  using (public.kalapos_is_owner() or (public.kalapos_branch_allowed(id) and deleted_at is null));
create policy branches_owner_write on public.branches for all to authenticated
  using (public.kalapos_is_owner()) with check (public.kalapos_is_owner());

create policy users_read on public.users for select to authenticated
  using (public.kalapos_is_owner() or id = auth.uid() or public.kalapos_branch_allowed(branch_id));
create policy users_owner_write on public.users for all to authenticated
  using (public.kalapos_is_owner()) with check (public.kalapos_is_owner());

create policy global_catalog_read on public.categories for select to authenticated using (true);
create policy global_catalog_write on public.categories for all to authenticated
  using (public.kalapos_is_owner()) with check (public.kalapos_is_owner());

create policy ingredient_read on public.ingredients for select to authenticated using (true);
create policy ingredient_write on public.ingredients for all to authenticated
  using (public.kalapos_is_owner()) with check (public.kalapos_is_owner());

create policy product_read on public.products for select to authenticated using (true);
create policy product_write on public.products for all to authenticated
  using (public.kalapos_is_owner()) with check (public.kalapos_is_owner());

create policy global_catalog_data_read on public.modifier_groups for select to authenticated using (true);
create policy global_catalog_data_write on public.modifier_groups for all to authenticated
  using (public.kalapos_is_owner()) with check (public.kalapos_is_owner());

create policy global_options_read on public.modifier_options for select to authenticated using (true);
create policy global_options_write on public.modifier_options for all to authenticated
  using (public.kalapos_is_owner()) with check (public.kalapos_is_owner());

create policy product_groups_read on public.product_modifier_groups for select to authenticated using (true);
create policy product_groups_write on public.product_modifier_groups for all to authenticated
  using (public.kalapos_is_owner()) with check (public.kalapos_is_owner());

create policy product_recipes_read on public.product_recipes for select to authenticated using (true);
create policy product_recipes_write on public.product_recipes for all to authenticated
  using (public.kalapos_is_owner()) with check (public.kalapos_is_owner());

create policy branch_products_scope on public.branch_products for all to authenticated
  using (public.kalapos_branch_allowed(branch_id)) with check (public.kalapos_branch_allowed(branch_id));

create policy branch_stocks_scope on public.branch_stocks for all to authenticated
  using (public.kalapos_branch_allowed(branch_id)) with check (public.kalapos_branch_allowed(branch_id));

create policy shifts_scope on public.shifts for all to authenticated
  using (public.kalapos_branch_allowed(branch_id)) with check (public.kalapos_branch_allowed(branch_id));

create policy orders_scope on public.orders for all to authenticated
  using (public.kalapos_branch_allowed(branch_id)) with check (public.kalapos_branch_allowed(branch_id));

create policy items_scope on public.order_items for all to authenticated
  using (exists(select 1 from public.orders o where o.id = order_id and public.kalapos_branch_allowed(o.branch_id)))
  with check (exists(select 1 from public.orders o where o.id = order_id and public.kalapos_branch_allowed(o.branch_id)));

create policy movements_scope on public.stock_movements for all to authenticated
  using (public.kalapos_branch_allowed(branch_id)) with check (public.kalapos_branch_allowed(branch_id));

create policy transfers_scope on public.stock_transfers for all to authenticated
  using (public.kalapos_branch_allowed(from_branch_id) or public.kalapos_branch_allowed(to_branch_id))
  with check (public.kalapos_branch_allowed(from_branch_id) or public.kalapos_branch_allowed(to_branch_id));

-- ============================================================================
-- Atomic RPC: process_pos_checkout
-- Uses SELECT ... FOR UPDATE on branch_stocks to prevent concurrent stock races
-- ============================================================================

create or replace function public.process_pos_checkout(
  p_branch_id uuid,
  p_cashier_id uuid,
  p_customer_name text,
  p_order_type public.order_type,
  p_table_number text,
  p_payment_method public.payment_method,
  p_discount bigint default 0,
  p_idempotency_key text default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_order public.orders%rowtype;
  v_branch public.branches%rowtype;
  v_shift public.shifts%rowtype;
  v_order_id uuid := gen_random_uuid();
  v_order_seq integer;
  v_daily_seq integer;
  v_order_number text;
  v_queue_number text;
  v_subtotal bigint := 0;
  v_tax_amount bigint := 0;
  v_service_charge bigint := 0;
  v_total bigint := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_custom_price bigint;
  v_unit_price bigint;
  v_mod_total bigint;
  v_mod_snapshot jsonb;
  v_mod_id uuid;
  v_mod_opt public.modifier_options%rowtype;
  v_mod_group_name text;
  v_qty integer;
  v_line_subtotal bigint;
  v_usage record;
  v_stock public.branch_stocks%rowtype;
  v_new_balance numeric(12, 3);
begin
  -- 0. Branch access check
  if not public.kalapos_branch_allowed(p_branch_id) then
    raise exception 'Akses cabang ditolak.';
  end if;

  -- 1. Idempotency check for offline sync replays
  if p_idempotency_key is not null then
    select * into v_existing_order
    from public.orders
    where idempotency_key = p_idempotency_key;

    if found then
      return jsonb_build_object(
        'order_id', v_existing_order.id,
        'order_number', v_existing_order.order_number,
        'queue_number', v_existing_order.queue_number,
        'total', v_existing_order.total,
        'idempotent_replay', true
      );
    end if;
  end if;

  -- 2. Validate active branch
  select * into v_branch
  from public.branches
  where id = p_branch_id and deleted_at is null and status <> 'INACTIVE';

  if not found then
    raise exception 'Cabang tidak ditemukan atau sedang nonaktif.';
  end if;

  -- 3. Validate active OPEN shift (lock shift row for cash increment)
  select * into v_shift
  from public.shifts
  where branch_id = p_branch_id and status = 'OPEN'
  order by opened_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Shift belum dibuka. Buka shift terlebih dahulu sebelum menerima transaksi.';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang pesanan kosong.';
  end if;

  -- 4. Compute sequential branch order_number & daily queue_number
  select count(*) + 1 into v_order_seq
  from public.orders
  where branch_id = p_branch_id;

  select count(*) + 1 into v_daily_seq
  from public.orders
  where branch_id = p_branch_id
    and created_at >= date_trunc('day', now());

  v_order_number := replace(v_branch.code, '-', '') || '-' || lpad(v_order_seq::text, 4, '0');
  v_queue_number := 'A-' || lpad(v_daily_seq::text, 3, '0');

  -- 5. Create temporary ingredient usage accumulator
  create temp table if not exists tmp_ingredient_usage (
    ingredient_id uuid primary key,
    qty_needed numeric(12, 3) not null default 0
  ) on commit drop;
  truncate table tmp_ingredient_usage;

  -- Insert order shell first (totals updated after item calculation)
  insert into public.orders (
    id, branch_id, shift_id, order_number, queue_number,
    customer_name, order_type, table_number, status,
    discount, payment_method, cashier_id, idempotency_key
  ) values (
    v_order_id, p_branch_id, v_shift.id, v_order_number, v_queue_number,
    coalesce(nullif(trim(p_customer_name), ''), 'Pelanggan'),
    p_order_type, p_table_number, 'QUEUED',
    greatest(0, coalesce(p_discount, 0)), p_payment_method, p_cashier_id, p_idempotency_key
  );

  -- 6. Snapshot order items and accumulate BOM + modifier ingredient usage
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, (v_item->>'qty')::integer);

    select * into v_product
    from public.products
    where id = (v_item->>'product_id')::uuid and is_active = true;

    if not found then
      raise exception 'Produk % tidak tersedia.', v_item->>'product_id';
    end if;

    select custom_price into v_custom_price
    from public.branch_products
    where branch_id = p_branch_id and product_id = v_product.id;

    v_unit_price := coalesce(v_custom_price, v_product.base_price);
    v_mod_total := 0;
    v_mod_snapshot := '[]'::jsonb;

    if v_item ? 'modifier_option_ids' then
      for v_mod_id in
        select (value)::uuid from jsonb_array_elements_text(v_item->'modifier_option_ids')
      loop
        select mo.*, mg.name as grp_name
        into v_mod_opt
        from public.modifier_options mo
        join public.modifier_groups mg on mg.id = mo.group_id
        where mo.id = v_mod_id;

        if found then
          select name into v_mod_group_name
          from public.modifier_groups where id = v_mod_opt.group_id;

          v_mod_total := v_mod_total + v_mod_opt.price_delta;
          v_mod_snapshot := v_mod_snapshot || jsonb_build_object(
            'group_name', v_mod_group_name,
            'option_id', v_mod_opt.id,
            'option_name', v_mod_opt.name,
            'price_delta', v_mod_opt.price_delta,
            'ingredient_id', v_mod_opt.ingredient_id,
            'qty_required', v_mod_opt.qty_required
          );

          if v_mod_opt.ingredient_id is not null and v_mod_opt.qty_required > 0 then
            insert into tmp_ingredient_usage (ingredient_id, qty_needed)
            values (v_mod_opt.ingredient_id, v_mod_opt.qty_required * v_qty)
            on conflict (ingredient_id)
            do update set qty_needed = tmp_ingredient_usage.qty_needed + excluded.qty_needed;
          end if;
        end if;
      end loop;
    end if;

    -- Accumulate base product recipe BOM
    insert into tmp_ingredient_usage (ingredient_id, qty_needed)
    select pr.ingredient_id, pr.qty_required * v_qty
    from public.product_recipes pr
    where pr.product_id = v_product.id
    on conflict (ingredient_id)
    do update set qty_needed = tmp_ingredient_usage.qty_needed + excluded.qty_needed;

    v_line_subtotal := (v_unit_price + v_mod_total) * v_qty;
    v_subtotal := v_subtotal + v_line_subtotal;

    insert into public.order_items (
      order_id, product_id, product_name_snapshot, unit_price_snapshot,
      modifiers_snapshot, qty, subtotal, barista_notes
    ) values (
      v_order_id, v_product.id, v_product.name, v_unit_price + v_mod_total,
      v_mod_snapshot, v_qty, v_line_subtotal, coalesce(v_item->>'barista_notes', '')
    );
  end loop;

  -- 7. Calculate integer IDR tax, service charge, and total
  v_service_charge := round(greatest(0, v_subtotal - greatest(0, coalesce(p_discount, 0))) * v_branch.service_charge_rate / 100.0)::bigint;
  v_tax_amount := round((greatest(0, v_subtotal - greatest(0, coalesce(p_discount, 0))) + v_service_charge) * v_branch.tax_rate / 100.0)::bigint;
  v_total := greatest(0, v_subtotal - greatest(0, coalesce(p_discount, 0))) + v_service_charge + v_tax_amount;

  update public.orders
  set subtotal = v_subtotal,
      service_charge = v_service_charge,
      tax_amount = v_tax_amount,
      total = v_total
  where id = v_order_id;

  -- 8. Row-locked stock deduction (SELECT ... FOR UPDATE prevents concurrent oversell/races)
  for v_usage in
    select ingredient_id, qty_needed
    from tmp_ingredient_usage
    order by ingredient_id -- consistent lock ordering prevents deadlocks
  loop
    select * into v_stock
    from public.branch_stocks
    where branch_id = p_branch_id and ingredient_id = v_usage.ingredient_id
    for update;

    if found then
      v_new_balance := greatest(0, v_stock.current_qty - v_usage.qty_needed);
      update public.branch_stocks
      set current_qty = v_new_balance
      where branch_id = p_branch_id and ingredient_id = v_usage.ingredient_id;

      insert into public.stock_movements (
        branch_id, ingredient_id, type, qty_delta, balance_after,
        reference_id, notes, created_by
      ) values (
        p_branch_id, v_usage.ingredient_id, 'SALE_DEDUCT', -v_usage.qty_needed,
        v_new_balance, v_order_id, 'Pemotongan otomatis ' || v_order_number, p_cashier_id
      );
    end if;
  end loop;

  -- 9. Increment expected_cash for CASH payments
  if p_payment_method = 'CASH' then
    update public.shifts
    set expected_cash = expected_cash + v_total
    where id = v_shift.id;
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'queue_number', v_queue_number,
    'subtotal', v_subtotal,
    'service_charge', v_service_charge,
    'tax_amount', v_tax_amount,
    'total', v_total,
    'idempotent_replay', false
  );
end;
$$;

-- ============================================================================
-- Atomic RPC: transfer_branch_stock
-- Locks both source & destination branch_stocks rows in deterministic order
-- ============================================================================

create or replace function public.transfer_branch_stock(
  p_from_branch_id uuid,
  p_to_branch_id uuid,
  p_ingredient_id uuid,
  p_qty numeric(12, 3),
  p_notes text default null,
  p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer_id uuid := gen_random_uuid();
  v_from_stock public.branch_stocks%rowtype;
  v_to_stock public.branch_stocks%rowtype;
  v_from_balance numeric(12, 3);
  v_to_balance numeric(12, 3);
begin
  if not public.kalapos_is_owner() then
    raise exception 'Hanya Owner yang dapat melakukan transfer stok antar cabang.';
  end if;

  if p_from_branch_id = p_to_branch_id then
    raise exception 'Cabang asal dan tujuan tidak boleh sama.';
  end if;

  if p_qty <= 0 then
    raise exception 'Jumlah transfer harus lebih dari 0.';
  end if;

  -- Deterministic lock order to prevent deadlocks
  if p_from_branch_id < p_to_branch_id then
    select * into v_from_stock from public.branch_stocks
      where branch_id = p_from_branch_id and ingredient_id = p_ingredient_id for update;
    select * into v_to_stock from public.branch_stocks
      where branch_id = p_to_branch_id and ingredient_id = p_ingredient_id for update;
  else
    select * into v_to_stock from public.branch_stocks
      where branch_id = p_to_branch_id and ingredient_id = p_ingredient_id for update;
    select * into v_from_stock from public.branch_stocks
      where branch_id = p_from_branch_id and ingredient_id = p_ingredient_id for update;
  end if;

  if not found or v_from_stock.current_qty < p_qty then
    raise exception 'Stok cabang asal tidak mencukupi untuk transfer.';
  end if;

  v_from_balance := v_from_stock.current_qty - p_qty;
  update public.branch_stocks
  set current_qty = v_from_balance
  where branch_id = p_from_branch_id and ingredient_id = p_ingredient_id;

  insert into public.branch_stocks (branch_id, ingredient_id, current_qty, min_threshold)
  values (p_to_branch_id, p_ingredient_id, p_qty, coalesce(v_from_stock.min_threshold, 0))
  on conflict (branch_id, ingredient_id)
  do update set current_qty = public.branch_stocks.current_qty + p_qty
  returning current_qty into v_to_balance;

  insert into public.stock_transfers (
    id, from_branch_id, to_branch_id, ingredient_id, qty, status, completed_at
  ) values (
    v_transfer_id, p_from_branch_id, p_to_branch_id, p_ingredient_id, p_qty, 'COMPLETED', now()
  );

  insert into public.stock_movements (
    branch_id, ingredient_id, type, qty_delta, balance_after, reference_id, notes, created_by
  ) values
    (p_from_branch_id, p_ingredient_id, 'TRANSFER_OUT', -p_qty, v_from_balance, v_transfer_id, coalesce(p_notes, 'Transfer keluar antar cabang'), p_user_id),
    (p_to_branch_id, p_ingredient_id, 'TRANSFER_IN', p_qty, v_to_balance, v_transfer_id, coalesce(p_notes, 'Transfer masuk antar cabang'), p_user_id);

  return v_transfer_id;
end;
$$;
