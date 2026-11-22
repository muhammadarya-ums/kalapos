"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import {
  ACTIVE_BRANCH_STORAGE_KEY,
  adjustBranchStockRequest,
  advanceOrderStatusRequest,
  archiveBranchRequest,
  checkoutOrderRequest,
  clearServerSession,
  closeShiftBlindRequest,
  createBranchRequest,
  createCategoryRequest,
  createIngredientRequest,
  createProductRequest,
  createStaffRequest,
  deleteBranchRequest,
  deleteCategoryRequest,
  deleteIngredientRequest,
  deleteProductRequest,
  deleteStaffRequest,
  fetchServerBranches,
  fetchServerInventory,
  fetchServerMenuCatalog,
  fetchServerOperations,
  fetchServerSession,
  fetchServerStaff,
  holdOrderRequest,
  loginWithEmailRequest,
  loginWithPinRequest,
  openShiftRequest,
  restoreBranchRequest,
  toggleStaffActiveRequest,
  transferBranchStockRequest,
  updateBranchProductOverrideRequest,
  updateBranchRequest,
  updateIngredientRequest,
  updateProductRequest,
  verifySupervisorPinRequest,
  voidOrderRequest,
} from "./auth"
import type { IngredientUpsertServerInput } from "./inventory-server"
import type { ProductUpsertServerInput } from "./menu-server"
import { createSeedState } from "./seed"
import {
  executeAdvanceOrderStatus,
  executeArchiveBranch,
  executeAtomicCheckout,
  executeCloseShiftBlind,
  executeCreateBranch,
  executeDeleteBranch,
  executeFlushOfflineQueue,
  executeHoldOrder,
  executeOpenShift,
  executeRestoreBranch,
  executeUpdateBranch,
  executeVoidOrder,
  getActiveShift,
  type BlindCloseSummary,
  type BranchUpsertInput,
  type CheckoutInput,
  type CreateStaffInput,
  type StoreResult,
} from "./store"
import { createRepository } from "./supabase-adapter"
import type {
  Branch,
  BranchProduct,
  CartDraftItem,
  Category,
  Ingredient,
  KalaPOSState,
  Order,
  OrderStatus,
  OrderType,
  Product,
  SessionUser,
  Shift,
  StockMovement,
  StockTransfer,
  User,
} from "./types"

export interface AuthActionResult {
  ok: boolean
  error?: string
  session?: SessionUser
}

export interface KalaPOSContextValue {
  hydrated: boolean
  repositoryMode: "local" | "supabase"
  state: KalaPOSState
  session: SessionUser | null
  activeBranchId: string
  activeBranch: Branch | undefined
  activeBranches: Branch[]
  activeShift: Shift | null
  isOnline: boolean
  simulatedOffline: boolean
  offlinePendingCount: number
  // Server-Verified Authentication & Staff Management (Single Cafe: Kala)
  loginWithEmail: (
    email: string,
    password: string,
    rememberMe?: boolean
  ) => Promise<AuthActionResult>
  loginWithPin: (pin: string, branchId: string) => Promise<AuthActionResult>
  logout: () => Promise<void>
  setActiveBranchId: (branchId: string) => void
  verifySupervisorPin: (pin: string) => Promise<{
    ok: boolean
    supervisorName?: string
    supervisorId?: string
    error?: string
  }>
  createStaff: (input: CreateStaffInput) => Promise<StoreResult<User>>
  toggleStaffActive: (userId: string) => Promise<StoreResult<User>>
  deleteStaff: (userId: string) => Promise<StoreResult<{ deleted: boolean }>>
  // Network / Offline Sync
  toggleSimulatedOffline: () => void
  flushOfflineQueue: () => number
  // Shift (Server-Synced)
  openShift: (
    openingCash: number,
    notes?: string,
    branchId?: string
  ) => Promise<StoreResult<Shift>>
  closeShiftBlind: (
    shiftId: string,
    actualCash: number,
    notes?: string
  ) => Promise<StoreResult<BlindCloseSummary>>
  // POS & KDS (Server-Synced with Offline Fallback)
  checkoutOrder: (
    input: Omit<CheckoutInput, "branch_id" | "cashier_id" | "is_offline"> & { branch_id?: string }
  ) => Promise<StoreResult<Order>>
  holdOrder: (input: {
    customer_name: string
    order_type: OrderType
    table_number: string | null
    discount: number
    discount_reason: string | null
    items: CartDraftItem[]
    existing_hold_id?: string | null
  }) => Promise<StoreResult<Order>>
  advanceOrderStatus: (orderId: string, nextStatus: OrderStatus) => Promise<StoreResult<Order>>
  voidOrder: (orderId: string, reason: string, supervisorPin: string) => Promise<StoreResult<Order>>
  // Menu CRUD (Owner & Branch Manager Only, Server-Synced)
  createCategory: (name: string) => Promise<StoreResult<Category>>
  deleteCategory: (categoryId: string) => Promise<StoreResult<{ deleted: boolean }>>
  createProduct: (input: ProductUpsertServerInput) => Promise<StoreResult<Product>>
  updateProduct: (productId: string, input: ProductUpsertServerInput) => Promise<StoreResult<Product>>
  deleteProduct: (productId: string) => Promise<StoreResult<{ deleted: boolean }>>
  updateBranchProductOverride: (payload: {
    branchId: string
    productId: string
    isAvailable: boolean
    customPrice: number | null
  }) => Promise<StoreResult<BranchProduct>>
  // Inventory & Stock CRUD (Server-Synced + Shift-Tracked)
  createIngredient: (input: IngredientUpsertServerInput) => Promise<StoreResult<Ingredient>>
  updateIngredient: (
    ingredientId: string,
    input: {
      sku: string
      name: string
      unit: string
      cost_per_unit: number
      branch_id?: string | null
      min_threshold?: number
    }
  ) => Promise<StoreResult<Ingredient>>
  deleteIngredient: (ingredientId: string) => Promise<StoreResult<{ deleted: boolean }>>
  recordRestock: (
    ingredientId: string,
    qty: number,
    notes: string,
    branchId?: string
  ) => Promise<StoreResult<StockMovement>>
  recordManualOut: (
    ingredientId: string,
    qty: number,
    notes: string,
    branchId?: string
  ) => Promise<StoreResult<StockMovement>>
  recordWaste: (
    ingredientId: string,
    qty: number,
    notes: string,
    branchId?: string
  ) => Promise<StoreResult<StockMovement>>
  recordStockOpname: (
    ingredientId: string,
    countedQty: number,
    notes: string,
    supervisorPin: string,
    branchId?: string
  ) => Promise<StoreResult<StockMovement>>
  transferStock: (input: {
    from_branch_id: string
    to_branch_id: string
    ingredient_id: string
    qty: number
    notes: string
  }) => Promise<StoreResult<StockTransfer>>
  // Branches CRUD (Owner Only, Server-Synced)
  createBranch: (input: BranchUpsertInput) => Promise<StoreResult<Branch>>
  updateBranch: (branchId: string, input: BranchUpsertInput) => Promise<StoreResult<Branch>>
  archiveBranch: (
    branchId: string
  ) => Promise<StoreResult<{ archived: boolean; hasHistory: boolean }>>
  restoreBranch: (branchId: string) => Promise<StoreResult<Branch>>
  deleteBranch: (branchId: string) => Promise<StoreResult<{ deleted: boolean }>>
}

const KalaPOSContext = createContext<KalaPOSContextValue | null>(null)

export function KalaPOSProvider({ children }: { children: React.ReactNode }) {
  const repoRef = useRef<ReturnType<typeof createRepository> | null>(null)
  if (!repoRef.current) {
    repoRef.current = createRepository()
  }

  const [state, setState] = useState<KalaPOSState>(() => createSeedState())
  const [hydrated, setHydrated] = useState(false)
  const [session, setSession] = useState<SessionUser | null>(null)
  const [activeBranchId, setActiveBranchIdState] = useState<string>("")
  const [browserOnline, setBrowserOnline] = useState(true)
  const [simulatedOffline, setSimulatedOffline] = useState(false)

  const stateRef = useRef(state)
  stateRef.current = state

  const isOnline = browserOnline && !simulatedOffline

  const commitState = useCallback((next: KalaPOSState) => {
    stateRef.current = next
    setState(next)
    void repoRef.current?.saveState(next)
  }, [])

  const syncServerDirectory = useCallback(
    async (baseState: KalaPOSState, currentSession: SessionUser | null): Promise<KalaPOSState> => {
      if (!currentSession) return baseState
      const [serverBranches, serverStaff, serverMenu, serverInv, serverOps] = await Promise.all([
        fetchServerBranches(),
        fetchServerStaff(),
        fetchServerMenuCatalog(),
        fetchServerInventory(),
        fetchServerOperations(),
      ])
      let merged = baseState
      let changed = false
      if (serverBranches !== null) {
        merged = { ...merged, branches: serverBranches }
        changed = true
      }
      if (serverStaff !== null) {
        merged = { ...merged, users: serverStaff }
        changed = true
      }
      if (serverMenu !== null) {
        merged = {
          ...merged,
          categories: serverMenu.categories,
          products: serverMenu.products,
          branch_products: serverMenu.branch_products,
          modifier_groups: serverMenu.modifier_groups,
          modifier_options: serverMenu.modifier_options,
          product_modifier_groups: serverMenu.product_modifier_groups,
          product_recipes: serverMenu.product_recipes,
        }
        changed = true
      }
      if (serverInv !== null) {
        merged = {
          ...merged,
          ingredients: serverInv.ingredients,
          branch_stocks: serverInv.branch_stocks,
          stock_movements: serverInv.stock_movements,
          stock_transfers: serverInv.stock_transfers,
        }
        changed = true
      }
      if (serverOps !== null) {
        merged = {
          ...merged,
          shifts: serverOps.shifts,
          orders: serverOps.orders,
        }
        changed = true
      }
      if (changed) {
        commitState(merged)
      }
      return merged
    },
    [commitState]
  )

  // Hydrate offline state from IndexedDB/localStorage + verify HttpOnly session from server
  useEffect(() => {
    let active = true
    const repo = repoRef.current!

    let savedBranch: string | null = null
    try {
      savedBranch = localStorage.getItem(ACTIVE_BRANCH_STORAGE_KEY)
    } catch {
      /* ignore */
    }

    void Promise.all([repo.loadState(), fetchServerSession()]).then(
      async ([loadedState, serverSession]) => {
        if (!active) return
        setSession(serverSession)

        const syncedState = await syncServerDirectory(loadedState, serverSession)
        if (!active) return

        stateRef.current = syncedState
        setState(syncedState)

        const validBranches = syncedState.branches.filter(
          (b) => !b.deleted_at && b.status !== "INACTIVE"
        )
        const preferredBranch =
          serverSession?.branchId ||
          (savedBranch && validBranches.some((b) => b.id === savedBranch) ? savedBranch : null) ||
          validBranches[0]?.id ||
          ""
        setActiveBranchIdState(preferredBranch)
        setHydrated(true)
      }
    )

    const unsub = repo.subscribe((externalState) => {
      if (!active) return
      stateRef.current = externalState
      setState(externalState)
    })

    if (typeof window !== "undefined") {
      setBrowserOnline(navigator.onLine)
      const onOnline = () => setBrowserOnline(true)
      const onOffline = () => setBrowserOnline(false)
      window.addEventListener("online", onOnline)
      window.addEventListener("offline", onOffline)
      return () => {
        active = false
        unsub()
        window.removeEventListener("online", onOnline)
        window.removeEventListener("offline", onOffline)
      }
    }

    return () => {
      active = false
      unsub()
    }
  }, [syncServerDirectory])

  // Auto-flush offline queue when connection is restored
  useEffect(() => {
    if (!hydrated || !isOnline) return
    if (stateRef.current.offline_queue.length > 0) {
      const timer = window.setTimeout(() => {
        const flushed = executeFlushOfflineQueue(stateRef.current)
        commitState(flushed)
      }, 900)
      return () => window.clearTimeout(timer)
    }
  }, [hydrated, isOnline, commitState])

  const activeBranches = useMemo(
    () => state.branches.filter((b) => !b.deleted_at && b.status !== "INACTIVE"),
    [state.branches]
  )

  useEffect(() => {
    if (!hydrated) return
    if (session?.branchId && session.role !== "OWNER") {
      if (activeBranchId !== session.branchId) {
        setActiveBranchIdState(session.branchId)
      }
      return
    }
    if (activeBranches.length === 0) {
      if (activeBranchId !== "") setActiveBranchIdState("")
      return
    }
    if (!activeBranches.some((b) => b.id === activeBranchId)) {
      setActiveBranchIdState(activeBranches[0].id)
    }
  }, [hydrated, activeBranches, activeBranchId, session])

  const activeBranch = useMemo(
    () => activeBranches.find((b) => b.id === activeBranchId) ?? activeBranches[0],
    [activeBranches, activeBranchId]
  )

  const activeShift = useMemo(
    () => (activeBranch ? getActiveShift(state, activeBranch.id) : null),
    [state, activeBranch]
  )

  const setActiveBranchId = useCallback(
    (branchId: string) => {
      if (session && session.role !== "OWNER" && session.branchId && branchId !== session.branchId) {
        return
      }
      setActiveBranchIdState(branchId)
      try {
        localStorage.setItem(ACTIVE_BRANCH_STORAGE_KEY, branchId)
      } catch {
        /* ignore */
      }
    },
    [session]
  )

  const persistActiveBranch = (branchId: string | null) => {
    if (!branchId) return
    setActiveBranchIdState(branchId)
    try {
      localStorage.setItem(ACTIVE_BRANCH_STORAGE_KEY, branchId)
    } catch {
      /* ignore */
    }
  }

  const loginWithEmail = useCallback(
    async (email: string, password: string, rememberMe = true): Promise<AuthActionResult> => {
      const res = await loginWithEmailRequest(email, password, rememberMe)
      if (!res.ok || !res.session) {
        return { ok: false, error: res.error || "Email atau kata sandi tidak sesuai." }
      }
      setSession(res.session)
      const synced = await syncServerDirectory(stateRef.current, res.session)
      if (res.session.branchId) {
        persistActiveBranch(res.session.branchId)
      } else {
        const firstActive = synced.branches.find((b) => !b.deleted_at && b.status !== "INACTIVE")
        if (firstActive) persistActiveBranch(firstActive.id)
      }
      return { ok: true, session: res.session }
    },
    [syncServerDirectory]
  )

  const loginWithPin = useCallback(
    async (pin: string, branchId: string): Promise<AuthActionResult> => {
      const res = await loginWithPinRequest(pin, branchId)
      if (!res.ok || !res.session) {
        return { ok: false, error: res.error || "PIN tidak cocok untuk cabang yang dipilih." }
      }
      setSession(res.session)
      await syncServerDirectory(stateRef.current, res.session)
      persistActiveBranch(res.session.branchId ?? branchId)
      return { ok: true, session: res.session }
    },
    [syncServerDirectory]
  )

  const logout = useCallback(async () => {
    await clearServerSession()
    setSession(null)
    setActiveBranchIdState("")
    commitState({ ...stateRef.current, users: [] })
  }, [commitState])

  const verifySupervisorPin = useCallback(
    async (pin: string) => {
      return verifySupervisorPinRequest(pin, activeBranch?.id ?? session?.branchId ?? null)
    },
    [activeBranch?.id, session?.branchId]
  )

  const createStaff = useCallback(
    async (input: CreateStaffInput): Promise<StoreResult<User>> => {
      const res = await createStaffRequest(input)
      if (!res.ok || !res.user) {
        return { ok: false, error: res.error || "Gagal menambahkan akun staf." }
      }
      if (res.users) {
        commitState({ ...stateRef.current, users: res.users })
      }
      return { ok: true, data: res.user }
    },
    [commitState]
  )

  const toggleStaffActive = useCallback(
    async (userId: string): Promise<StoreResult<User>> => {
      const res = await toggleStaffActiveRequest(userId)
      if (!res.ok || !res.user) {
        return { ok: false, error: res.error || "Gagal mengubah status staf." }
      }
      if (res.users) {
        commitState({ ...stateRef.current, users: res.users })
      }
      return { ok: true, data: res.user }
    },
    [commitState]
  )

  const deleteStaff = useCallback(
    async (userId: string): Promise<StoreResult<{ deleted: boolean }>> => {
      const res = await deleteStaffRequest(userId)
      if (!res.ok) {
        return { ok: false, error: res.error || "Gagal menghapus akun staf." }
      }
      if (res.users) {
        commitState({ ...stateRef.current, users: res.users })
      }
      return { ok: true, data: { deleted: true } }
    },
    [commitState]
  )

  const toggleSimulatedOffline = useCallback(() => {
    setSimulatedOffline((prev) => !prev)
  }, [])

  const flushOfflineQueue = useCallback(() => {
    const count = stateRef.current.offline_queue.length
    if (count === 0) return 0
    const flushed = executeFlushOfflineQueue(stateRef.current)
    commitState(flushed)
    return count
  }, [commitState])

  const openShift = useCallback(
    async (openingCash: number, notes?: string, branchId?: string): Promise<StoreResult<Shift>> => {
      if (!session) return { ok: false, error: "Sesi autentikasi tidak ditemukan." }
      const targetBranch = branchId || activeBranch?.id || activeBranchId
      if (!targetBranch) return { ok: false, error: "Belum ada cabang aktif untuk membuka shift." }

      if (!isOnline) {
        const localRes = executeOpenShift(
          stateRef.current,
          targetBranch,
          session.userId,
          openingCash,
          notes
        )
        if (localRes.ok && localRes.nextState) commitState(localRes.nextState)
        return localRes
      }

      const res = await openShiftRequest({ branchId: targetBranch, openingCash, notes })
      if (!res.ok || !res.shift) return { ok: false, error: res.error }
      if (res.shifts) {
        commitState({ ...stateRef.current, shifts: res.shifts })
      }
      return { ok: true, data: res.shift }
    },
    [activeBranch?.id, activeBranchId, session, isOnline, commitState]
  )

  const closeShiftBlind = useCallback(
    async (
      shiftId: string,
      actualCash: number,
      notes?: string
    ): Promise<StoreResult<BlindCloseSummary>> => {
      if (!isOnline) {
        const localRes = executeCloseShiftBlind(stateRef.current, shiftId, actualCash, notes)
        if (localRes.ok && localRes.nextState) commitState(localRes.nextState)
        return localRes
      }

      const res = await closeShiftBlindRequest({ shiftId, actualCash, notes })
      if (!res.ok || !res.summary) return { ok: false, error: res.error }
      if (res.shifts) {
        commitState({ ...stateRef.current, shifts: res.shifts })
      }
      return { ok: true, data: res.summary }
    },
    [isOnline, commitState]
  )

  const checkoutOrder = useCallback(
    async (
      input: Omit<CheckoutInput, "branch_id" | "cashier_id" | "is_offline"> & { branch_id?: string }
    ): Promise<StoreResult<Order>> => {
      if (!session) return { ok: false, error: "Sesi autentikasi tidak ditemukan." }
      const targetBranch = input.branch_id || activeBranch?.id || activeBranchId
      if (!targetBranch) return { ok: false, error: "Belum ada cabang aktif." }

      if (!isOnline) {
        const localRes = executeAtomicCheckout(stateRef.current, {
          ...input,
          branch_id: targetBranch,
          cashier_id: session.userId,
          is_offline: true,
        })
        if (localRes.ok && localRes.nextState) commitState(localRes.nextState)
        return localRes
      }

      const res = await checkoutOrderRequest({
        ...input,
        branch_id: targetBranch,
      })
      if (!res.ok || !res.order) return { ok: false, error: res.error }
      commitState({
        ...stateRef.current,
        orders: res.orders ?? [res.order, ...stateRef.current.orders],
        shifts: res.shifts ?? stateRef.current.shifts,
      })
      return { ok: true, data: res.order }
    },
    [activeBranch?.id, activeBranchId, session, isOnline, commitState]
  )

  const holdOrder = useCallback(
    async (input: {
      customer_name: string
      order_type: OrderType
      table_number: string | null
      discount: number
      discount_reason: string | null
      items: CartDraftItem[]
      existing_hold_id?: string | null
    }): Promise<StoreResult<Order>> => {
      if (!session) return { ok: false, error: "Sesi autentikasi tidak ditemukan." }
      const targetBranch = activeBranch?.id || activeBranchId
      if (!targetBranch) return { ok: false, error: "Belum ada cabang aktif." }

      if (!isOnline) {
        const localRes = executeHoldOrder(stateRef.current, {
          ...input,
          branch_id: targetBranch,
          cashier_id: session.userId,
        })
        if (localRes.ok && localRes.nextState) commitState(localRes.nextState)
        return localRes
      }

      const res = await holdOrderRequest({
        ...input,
        branch_id: targetBranch,
      })
      if (!res.ok || !res.order) return { ok: false, error: res.error }
      commitState({
        ...stateRef.current,
        orders: res.orders ?? stateRef.current.orders,
        shifts: res.shifts ?? stateRef.current.shifts,
      })
      return { ok: true, data: res.order }
    },
    [activeBranch?.id, activeBranchId, session, isOnline, commitState]
  )

  const advanceOrderStatus = useCallback(
    async (orderId: string, nextStatus: OrderStatus): Promise<StoreResult<Order>> => {
      if (!isOnline) {
        const localRes = executeAdvanceOrderStatus(stateRef.current, orderId, nextStatus)
        if (localRes.ok && localRes.nextState) commitState(localRes.nextState)
        return localRes
      }

      const res = await advanceOrderStatusRequest({ orderId, nextStatus })
      if (!res.ok || !res.order) return { ok: false, error: res.error }
      if (res.orders) {
        commitState({ ...stateRef.current, orders: res.orders })
      }
      return { ok: true, data: res.order }
    },
    [isOnline, commitState]
  )

  const voidOrder = useCallback(
    async (orderId: string, reason: string, supervisorPin: string): Promise<StoreResult<Order>> => {
      const targetBranch = activeBranch?.id ?? session?.branchId ?? null
      if (!isOnline) {
        const auth = await verifySupervisorPinRequest(supervisorPin, targetBranch)
        if (!auth.ok || !auth.supervisorId) {
          return { ok: false, error: auth.error || "PIN Supervisor tidak valid." }
        }
        const localRes = executeVoidOrder(stateRef.current, orderId, reason, auth.supervisorId)
        if (localRes.ok && localRes.nextState) commitState(localRes.nextState)
        return localRes
      }

      const res = await voidOrderRequest({
        orderId,
        reason,
        supervisorPin,
        branchId: targetBranch,
      })
      if (!res.ok || !res.order) return { ok: false, error: res.error }
      commitState({
        ...stateRef.current,
        orders: res.orders ?? stateRef.current.orders,
        shifts: res.shifts ?? stateRef.current.shifts,
      })
      return { ok: true, data: res.order }
    },
    [activeBranch?.id, session?.branchId, isOnline, commitState]
  )

  // ============================================================================
  // Menu CRUD (Server-Synced)
  // ============================================================================

  const applyCatalogSnapshot = useCallback(
    (catalog: {
      categories: Category[]
      products: Product[]
      branch_products: BranchProduct[]
      modifier_groups: KalaPOSState["modifier_groups"]
      modifier_options: KalaPOSState["modifier_options"]
      product_modifier_groups: KalaPOSState["product_modifier_groups"]
      product_recipes: KalaPOSState["product_recipes"]
    }) => {
      commitState({
        ...stateRef.current,
        categories: catalog.categories,
        products: catalog.products,
        branch_products: catalog.branch_products,
        modifier_groups: catalog.modifier_groups,
        modifier_options: catalog.modifier_options,
        product_modifier_groups: catalog.product_modifier_groups,
        product_recipes: catalog.product_recipes,
      })
    },
    [commitState]
  )

  const createCategory = useCallback(
    async (name: string): Promise<StoreResult<Category>> => {
      const res = await createCategoryRequest(name)
      if (!res.ok || !res.category) return { ok: false, error: res.error }
      if (res.catalog) applyCatalogSnapshot(res.catalog)
      return { ok: true, data: res.category }
    },
    [applyCatalogSnapshot]
  )

  const deleteCategory = useCallback(
    async (categoryId: string): Promise<StoreResult<{ deleted: boolean }>> => {
      const res = await deleteCategoryRequest(categoryId)
      if (!res.ok) return { ok: false, error: res.error }
      if (res.catalog) applyCatalogSnapshot(res.catalog)
      return { ok: true, data: { deleted: true } }
    },
    [applyCatalogSnapshot]
  )

  const createProduct = useCallback(
    async (input: ProductUpsertServerInput): Promise<StoreResult<Product>> => {
      const res = await createProductRequest(input)
      if (!res.ok || !res.product) return { ok: false, error: res.error }
      if (res.catalog) applyCatalogSnapshot(res.catalog)
      return { ok: true, data: res.product }
    },
    [applyCatalogSnapshot]
  )

  const updateProduct = useCallback(
    async (productId: string, input: ProductUpsertServerInput): Promise<StoreResult<Product>> => {
      const res = await updateProductRequest(productId, input)
      if (!res.ok || !res.product) return { ok: false, error: res.error }
      if (res.catalog) applyCatalogSnapshot(res.catalog)
      return { ok: true, data: res.product }
    },
    [applyCatalogSnapshot]
  )

  const deleteProduct = useCallback(
    async (productId: string): Promise<StoreResult<{ deleted: boolean }>> => {
      const res = await deleteProductRequest(productId)
      if (!res.ok) return { ok: false, error: res.error }
      if (res.catalog) applyCatalogSnapshot(res.catalog)
      return { ok: true, data: { deleted: true } }
    },
    [applyCatalogSnapshot]
  )

  const updateBranchProductOverride = useCallback(
    async (payload: {
      branchId: string
      productId: string
      isAvailable: boolean
      customPrice: number | null
    }): Promise<StoreResult<BranchProduct>> => {
      const res = await updateBranchProductOverrideRequest(payload)
      if (!res.ok || !res.branchProduct) return { ok: false, error: res.error }
      if (res.catalog) applyCatalogSnapshot(res.catalog)
      return { ok: true, data: res.branchProduct }
    },
    [applyCatalogSnapshot]
  )

  // ============================================================================
  // Inventory & Stock CRUD (Server-Synced + Shift-Tracked)
  // ============================================================================

  const applyInventorySnapshot = useCallback(
    (inv: {
      ingredients: Ingredient[]
      branch_stocks: KalaPOSState["branch_stocks"]
      stock_movements: StockMovement[]
      stock_transfers: StockTransfer[]
    }) => {
      commitState({
        ...stateRef.current,
        ingredients: inv.ingredients,
        branch_stocks: inv.branch_stocks,
        stock_movements: inv.stock_movements,
        stock_transfers: inv.stock_transfers,
      })
    },
    [commitState]
  )

  const createIngredient = useCallback(
    async (input: IngredientUpsertServerInput): Promise<StoreResult<Ingredient>> => {
      const targetBranchId = input.branch_id ?? activeBranch?.id ?? null
      const openShiftId = targetBranchId
        ? getActiveShift(stateRef.current, targetBranchId)?.id ?? null
        : null
      const res = await createIngredientRequest({
        ...input,
        shift_id: input.shift_id ?? openShiftId,
      })
      if (!res.ok || !res.ingredient) return { ok: false, error: res.error }
      if (res.inventory) applyInventorySnapshot(res.inventory)
      return { ok: true, data: res.ingredient }
    },
    [activeBranch?.id, applyInventorySnapshot]
  )

  const updateIngredient = useCallback(
    async (
      ingredientId: string,
      input: {
        sku: string
        name: string
        unit: string
        cost_per_unit: number
        branch_id?: string | null
        min_threshold?: number
      }
    ): Promise<StoreResult<Ingredient>> => {
      const res = await updateIngredientRequest(ingredientId, input)
      if (!res.ok || !res.ingredient) return { ok: false, error: res.error }
      if (res.inventory) applyInventorySnapshot(res.inventory)
      return { ok: true, data: res.ingredient }
    },
    [applyInventorySnapshot]
  )

  const deleteIngredient = useCallback(
    async (ingredientId: string): Promise<StoreResult<{ deleted: boolean }>> => {
      const res = await deleteIngredientRequest(ingredientId)
      if (!res.ok) return { ok: false, error: res.error }
      if (res.inventory) {
        commitState({
          ...stateRef.current,
          ingredients: res.inventory.ingredients,
          branch_stocks: res.inventory.branch_stocks,
          stock_movements: res.inventory.stock_movements,
          stock_transfers: res.inventory.stock_transfers,
          product_recipes: stateRef.current.product_recipes.filter(
            (r) => r.ingredient_id !== ingredientId
          ),
        })
      }
      return { ok: true, data: { deleted: true } }
    },
    [commitState]
  )

  const runStockAdjustment = useCallback(
    async (
      type: "RESTOCK" | "MANUAL_OUT" | "WASTE" | "OPNAME",
      ingredientId: string,
      qty: number,
      notes: string,
      branchId?: string,
      supervisorPin?: string
    ): Promise<StoreResult<StockMovement>> => {
      const targetBranch = branchId || activeBranch?.id || activeBranchId
      if (!targetBranch) return { ok: false, error: "Belum ada cabang aktif." }
      const openShiftId = getActiveShift(stateRef.current, targetBranch)?.id ?? null

      const res = await adjustBranchStockRequest({
        branchId: targetBranch,
        shiftId: openShiftId,
        ingredientId,
        type,
        qty,
        notes,
        supervisorPin,
      })
      if (!res.ok || !res.movement) return { ok: false, error: res.error }
      if (res.inventory) applyInventorySnapshot(res.inventory)
      return { ok: true, data: res.movement }
    },
    [activeBranch?.id, activeBranchId, applyInventorySnapshot]
  )

  const recordRestock = useCallback(
    (ingredientId: string, qty: number, notes: string, branchId?: string) =>
      runStockAdjustment("RESTOCK", ingredientId, qty, notes, branchId),
    [runStockAdjustment]
  )

  const recordManualOut = useCallback(
    (ingredientId: string, qty: number, notes: string, branchId?: string) =>
      runStockAdjustment("MANUAL_OUT", ingredientId, qty, notes, branchId),
    [runStockAdjustment]
  )

  const recordWaste = useCallback(
    (ingredientId: string, qty: number, notes: string, branchId?: string) =>
      runStockAdjustment("WASTE", ingredientId, qty, notes, branchId),
    [runStockAdjustment]
  )

  const recordStockOpname = useCallback(
    (
      ingredientId: string,
      countedQty: number,
      notes: string,
      supervisorPin: string,
      branchId?: string
    ) => runStockAdjustment("OPNAME", ingredientId, countedQty, notes, branchId, supervisorPin),
    [runStockAdjustment]
  )

  const transferStock = useCallback(
    async (input: {
      from_branch_id: string
      to_branch_id: string
      ingredient_id: string
      qty: number
      notes: string
    }): Promise<StoreResult<StockTransfer>> => {
      const res = await transferBranchStockRequest({
        fromBranchId: input.from_branch_id,
        toBranchId: input.to_branch_id,
        ingredientId: input.ingredient_id,
        qty: input.qty,
        notes: input.notes,
      })
      if (!res.ok || !res.transfer) return { ok: false, error: res.error }
      if (res.inventory) applyInventorySnapshot(res.inventory)
      return { ok: true, data: res.transfer }
    },
    [applyInventorySnapshot]
  )

  // ============================================================================
  // Branches CRUD (Owner Only, Server-Synced)
  // ============================================================================

  const createBranch = useCallback(
    async (input: BranchUpsertInput): Promise<StoreResult<Branch>> => {
      const serverRes = await createBranchRequest(input)
      if (!serverRes.ok || !serverRes.branch) {
        return { ok: false, error: serverRes.error || "Gagal menambahkan cabang." }
      }
      const localRes = executeCreateBranch(stateRef.current, input, {
        id: serverRes.branch.id,
        created_at: serverRes.branch.created_at,
      })
      const freshInv = await fetchServerInventory()
      if (localRes.ok && localRes.nextState) {
        commitState({
          ...localRes.nextState,
          branches: serverRes.branches ?? localRes.nextState.branches,
          branch_stocks: freshInv?.branch_stocks ?? localRes.nextState.branch_stocks,
        })
      } else if (serverRes.branches) {
        commitState({
          ...stateRef.current,
          branches: serverRes.branches,
          branch_stocks: freshInv?.branch_stocks ?? stateRef.current.branch_stocks,
        })
      }
      return { ok: true, data: serverRes.branch }
    },
    [commitState]
  )

  const updateBranch = useCallback(
    async (branchId: string, input: BranchUpsertInput): Promise<StoreResult<Branch>> => {
      const serverRes = await updateBranchRequest(branchId, input)
      if (!serverRes.ok || !serverRes.branch) {
        return { ok: false, error: serverRes.error || "Gagal memperbarui cabang." }
      }
      const localRes = executeUpdateBranch(stateRef.current, branchId, input)
      if (localRes.ok && localRes.nextState) {
        commitState({
          ...localRes.nextState,
          branches: serverRes.branches ?? localRes.nextState.branches,
        })
      } else if (serverRes.branches) {
        commitState({ ...stateRef.current, branches: serverRes.branches })
      }
      return { ok: true, data: serverRes.branch }
    },
    [commitState]
  )

  const archiveBranch = useCallback(
    async (
      branchId: string
    ): Promise<StoreResult<{ archived: boolean; hasHistory: boolean }>> => {
      const serverRes = await archiveBranchRequest(branchId)
      if (!serverRes.ok) {
        return { ok: false, error: serverRes.error || "Gagal mengarsipkan cabang." }
      }
      const localRes = executeArchiveBranch(stateRef.current, branchId)
      if (localRes.ok && localRes.nextState) {
        commitState({
          ...localRes.nextState,
          branches: serverRes.branches ?? localRes.nextState.branches,
        })
        return { ok: true, data: localRes.data }
      }
      if (serverRes.branches) {
        commitState({ ...stateRef.current, branches: serverRes.branches })
      }
      return { ok: true, data: { archived: true, hasHistory: false } }
    },
    [commitState]
  )

  const restoreBranch = useCallback(
    async (branchId: string): Promise<StoreResult<Branch>> => {
      const serverRes = await restoreBranchRequest(branchId)
      if (!serverRes.ok) {
        return { ok: false, error: serverRes.error || "Gagal memulihkan cabang." }
      }
      const localRes = executeRestoreBranch(stateRef.current, branchId)
      if (localRes.ok && localRes.nextState) {
        commitState({
          ...localRes.nextState,
          branches: serverRes.branches ?? localRes.nextState.branches,
        })
      } else if (serverRes.branches) {
        commitState({ ...stateRef.current, branches: serverRes.branches })
      }
      return { ok: true, data: serverRes.branch ?? localRes.data }
    },
    [commitState]
  )

  const deleteBranch = useCallback(
    async (branchId: string): Promise<StoreResult<{ deleted: boolean }>> => {
      const serverRes = await deleteBranchRequest(branchId)
      if (!serverRes.ok) {
        return { ok: false, error: serverRes.error || "Gagal menghapus cabang." }
      }
      const localRes = executeDeleteBranch(stateRef.current, branchId)
      const [freshStaff, freshMenu, freshInv] = await Promise.all([
        fetchServerStaff(),
        fetchServerMenuCatalog(),
        fetchServerInventory(),
      ])
      const base = localRes.ok && localRes.nextState ? localRes.nextState : stateRef.current
      commitState({
        ...base,
        branches: serverRes.branches ?? base.branches,
        users: freshStaff ?? base.users,
        products: freshMenu?.products ?? base.products,
        branch_products: freshMenu?.branch_products ?? base.branch_products,
        product_recipes: freshMenu?.product_recipes ?? base.product_recipes,
        branch_stocks: freshInv?.branch_stocks ?? base.branch_stocks,
      })
      return { ok: true, data: { deleted: true } }
    },
    [commitState]
  )

  const value = useMemo<KalaPOSContextValue>(
    () => ({
      hydrated,
      repositoryMode: repoRef.current?.mode ?? "local",
      state,
      session,
      activeBranchId: activeBranch?.id ?? activeBranchId,
      activeBranch,
      activeBranches,
      activeShift,
      isOnline,
      simulatedOffline,
      offlinePendingCount: state.offline_queue.length,
      loginWithEmail,
      loginWithPin,
      logout,
      setActiveBranchId,
      verifySupervisorPin,
      createStaff,
      toggleStaffActive,
      deleteStaff,
      toggleSimulatedOffline,
      flushOfflineQueue,
      openShift,
      closeShiftBlind,
      checkoutOrder,
      holdOrder,
      advanceOrderStatus,
      voidOrder,
      createCategory,
      deleteCategory,
      createProduct,
      updateProduct,
      deleteProduct,
      updateBranchProductOverride,
      createIngredient,
      updateIngredient,
      deleteIngredient,
      recordRestock,
      recordManualOut,
      recordWaste,
      recordStockOpname,
      transferStock,
      createBranch,
      updateBranch,
      archiveBranch,
      restoreBranch,
      deleteBranch,
    }),
    [
      hydrated,
      state,
      session,
      activeBranch,
      activeBranchId,
      activeBranches,
      activeShift,
      isOnline,
      simulatedOffline,
      loginWithEmail,
      loginWithPin,
      logout,
      setActiveBranchId,
      verifySupervisorPin,
      createStaff,
      toggleStaffActive,
      deleteStaff,
      toggleSimulatedOffline,
      flushOfflineQueue,
      openShift,
      closeShiftBlind,
      checkoutOrder,
      holdOrder,
      advanceOrderStatus,
      voidOrder,
      createCategory,
      deleteCategory,
      createProduct,
      updateProduct,
      deleteProduct,
      updateBranchProductOverride,
      createIngredient,
      updateIngredient,
      deleteIngredient,
      recordRestock,
      recordManualOut,
      recordWaste,
      recordStockOpname,
      transferStock,
      createBranch,
      updateBranch,
      archiveBranch,
      restoreBranch,
      deleteBranch,
    ]
  )

  return <KalaPOSContext.Provider value={value}>{children}</KalaPOSContext.Provider>
}

export function useKalaPOS(): KalaPOSContextValue {
  const ctx = useContext(KalaPOSContext)
  if (!ctx) {
    throw new Error("useKalaPOS must be used inside <KalaPOSProvider>")
  }
  return ctx
}
