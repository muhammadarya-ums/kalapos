import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  getAuthenticatedServerSession,
  verifySupervisorPinServer,
} from "@/lib/kalapos/auth-server"
import {
  advanceOrderStatusServer,
  checkoutOrderServer,
  getOperationsSnapshotServer,
  holdOrderServer,
  voidOrderServer,
} from "@/lib/kalapos/operations-server"
import type {
  CartDraftItem,
  OrderStatus,
  OrderType,
  PaymentMethod,
  SplitPaymentPart,
} from "@/lib/kalapos/types"

export async function GET() {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }

  const ops = await getOperationsSnapshotServer(
    session.role === "OWNER" ? null : session.branchId
  )
  return NextResponse.json({ ok: true, orders: ops.orders, shifts: ops.shifts }, { status: 200 })
}

export async function POST(request: NextRequest) {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      action?: "checkout" | "hold"
      branch_id?: string
      customer_name?: string
      order_type?: OrderType
      table_number?: string | null
      payment_method?: PaymentMethod
      tendered_amount?: number | null
      discount?: number
      discount_reason?: string | null
      items?: CartDraftItem[]
      split_payments?: SplitPaymentPart[] | null
      held_order_id?: string | null
      existing_hold_id?: string | null
      idempotency_key?: string
    }

    const targetBranchId =
      session.role === "OWNER" ? (body.branch_id ?? "").trim() : session.branchId ?? ""

    if (!targetBranchId) {
      return NextResponse.json({ ok: false, error: "Cabang aktif tidak valid." }, { status: 400 })
    }

    if (body.action === "hold") {
      const res = await holdOrderServer({
        branch_id: targetBranchId,
        cashier_id: session.userId,
        customer_name: body.customer_name ?? "",
        order_type: body.order_type === "DINE_IN" ? "DINE_IN" : "TAKEAWAY",
        table_number: body.table_number ?? null,
        discount: Number(body.discount ?? 0),
        discount_reason: body.discount_reason ?? null,
        items: Array.isArray(body.items) ? body.items : [],
        existing_hold_id: body.existing_hold_id ?? null,
      })

      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })
      const scopedOrders =
        session.role === "OWNER"
          ? res.operations.orders
          : res.operations.orders.filter((o) => o.branch_id === session.branchId)
      const scopedShifts =
        session.role === "OWNER"
          ? res.operations.shifts
          : res.operations.shifts.filter((s) => s.branch_id === session.branchId)

      return NextResponse.json(
        { ok: true, order: res.order, orders: scopedOrders, shifts: scopedShifts },
        { status: 201 }
      )
    }

    // Default: checkout
    const res = await checkoutOrderServer({
      branch_id: targetBranchId,
      cashier_id: session.userId,
      customer_name: body.customer_name ?? "Pelanggan",
      order_type: body.order_type === "DINE_IN" ? "DINE_IN" : "TAKEAWAY",
      table_number: body.table_number ?? null,
      payment_method: body.payment_method ?? "CASH",
      tendered_amount: body.tendered_amount ?? null,
      discount: Number(body.discount ?? 0),
      discount_reason: body.discount_reason ?? null,
      items: Array.isArray(body.items) ? body.items : [],
      split_payments: body.split_payments ?? null,
      held_order_id: body.held_order_id ?? null,
      idempotency_key: body.idempotency_key,
    })

    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })
    const scopedOrders =
      session.role === "OWNER"
        ? res.operations.orders
        : res.operations.orders.filter((o) => o.branch_id === session.branchId)
    const scopedShifts =
      session.role === "OWNER"
        ? res.operations.shifts
        : res.operations.shifts.filter((s) => s.branch_id === session.branchId)

    return NextResponse.json(
      { ok: true, order: res.order, orders: scopedOrders, shifts: scopedShifts },
      { status: 201 }
    )
  } catch {
    return NextResponse.json({ ok: false, error: "Data transaksi tidak valid." }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getAuthenticatedServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: "Autentikasi diperlukan." }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      action?: "advance_status" | "void"
      orderId?: string
      nextStatus?: OrderStatus
      reason?: string
      supervisorPin?: string
      branchId?: string | null
    }

    if (!body.orderId) {
      return NextResponse.json({ ok: false, error: "ID pesanan wajib diisi." }, { status: 400 })
    }

    if (body.action === "void") {
      const pinCheck = await verifySupervisorPinServer(
        body.supervisorPin ?? "",
        body.branchId ?? session.branchId ?? null
      )
      if (!pinCheck.ok) {
        return NextResponse.json(
          { ok: false, error: pinCheck.error || "PIN Supervisor tidak valid." },
          { status: 401 }
        )
      }

      const res = await voidOrderServer({
        orderId: body.orderId,
        reason: body.reason ?? "",
        supervisorId: pinCheck.supervisor.id,
        actor: { role: session.role, branchId: session.branchId },
      })
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })

      const scopedOrders =
        session.role === "OWNER"
          ? res.operations.orders
          : res.operations.orders.filter((o) => o.branch_id === session.branchId)
      const scopedShifts =
        session.role === "OWNER"
          ? res.operations.shifts
          : res.operations.shifts.filter((s) => s.branch_id === session.branchId)

      return NextResponse.json(
        { ok: true, order: res.order, orders: scopedOrders, shifts: scopedShifts },
        { status: 200 }
      )
    }

    if (body.action === "advance_status" && body.nextStatus) {
      const res = await advanceOrderStatusServer({
        orderId: body.orderId,
        nextStatus: body.nextStatus,
        actor: { role: session.role, branchId: session.branchId },
      })
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 })

      const scopedOrders =
        session.role === "OWNER"
          ? res.operations.orders
          : res.operations.orders.filter((o) => o.branch_id === session.branchId)

      return NextResponse.json(
        { ok: true, order: res.order, orders: scopedOrders },
        { status: 200 }
      )
    }

    return NextResponse.json({ ok: false, error: "Aksi pesanan tidak valid." }, { status: 400 })
  } catch {
    return NextResponse.json({ ok: false, error: "Permintaan pembaruan pesanan tidak valid." }, { status: 400 })
  }
}
