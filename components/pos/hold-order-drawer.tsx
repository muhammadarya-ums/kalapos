"use client"

import { ArrowRight, Bookmark, Clock3, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Drawer } from "@/components/ui/drawer"
import { formatIDR, formatTimeWIB } from "@/lib/kalapos/format"
import type { Order } from "@/lib/kalapos/types"

export interface HoldOrderDrawerProps {
  open: boolean
  onClose: () => void
  heldOrders: Order[]
  onResume: (order: Order) => void
  onRequestVoid: (order: Order) => void
}

export function HoldOrderDrawer({
  open,
  onClose,
  heldOrders,
  onResume,
  onRequestVoid,
}: HoldOrderDrawerProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="OPEN BILL · PESANAN DITAHAN"
      title={`Daftar Open Bill (${heldOrders.length})`}
      description="Lanjutkan pesanan meja yang belum dibayar atau batalkan dengan otorisasi Supervisor."
      widthClassName="max-w-md"
    >
      {heldOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#D6D2C9] bg-[#FAF9F7] px-6 py-12 text-center">
          <Bookmark className="h-6 w-6 text-[#8E8982]" strokeWidth={1.5} />
          <p className="mt-3 text-xs font-semibold text-[#18181B]">Tidak ada pesanan ditahan</p>
          <p className="mt-1 text-[11px] text-[#8E8982]">
            Tekan tombol Tahan (atau F2) di struk untuk menyimpan Open Bill per meja.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {heldOrders.map((order) => (
            <article
              key={order.id}
              className="rounded-lg border border-[#E5E2DC] bg-white p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-[#18181B]">
                      {order.queue_number}
                    </span>
                    <Badge variant="menipis">Open Bill</Badge>
                    {order.table_number && (
                      <Badge variant="default">Meja {order.table_number}</Badge>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-[#18181B]">
                    {order.customer_name}
                  </p>
                  <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] text-[#8E8982]">
                    <Clock3 className="h-3 w-3" strokeWidth={1.5} />
                    Dibuka {formatTimeWIB(order.created_at)}
                  </p>
                </div>
                <strong className="font-mono text-sm font-semibold tabular-nums text-[#18181B]">
                  {formatIDR(order.total)}
                </strong>
              </div>

              <div className="mt-3 space-y-1 border-t border-[#EFECE7] pt-2.5 text-xs text-[#57534E]">
                {order.items.map((it) => (
                  <p key={it.id} className="truncate">
                    <span className="font-mono font-semibold text-[#18181B]">{it.qty}×</span>{" "}
                    {it.product_name_snapshot}
                    {it.modifiers_snapshot.length > 0 && (
                      <span className="text-[#8E8982]">
                        {" "}
                        · {it.modifiers_snapshot.map((m) => m.option_name).join(", ")}
                      </span>
                    )}
                  </p>
                ))}
              </div>

              <div className="mt-3.5 flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onRequestVoid(order)}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Void
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    onResume(order)
                    onClose()
                  }}
                >
                  Lanjutkan ke Kasir
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Drawer>
  )
}
