import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { TrendingUp, ArrowUpDown, BarChart3, XCircle, Activity, ShoppingCart } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/share-marketplace/")({
  component: ShareMarketplacePage,
});

function ShareMarketplacePage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated, navigate]);

  const [selectedShareClass, setSelectedShareClass] = useState<number | null>(null);
  const [orderForm, setOrderForm] = useState({ side: "BUY" as "BUY" | "SELL", quantity: 1, pricePerShare: 0 });
  const [tab, setTab] = useState<"market" | "my-orders" | "trades" | "history">("market");

  const overviewQuery = useQuery(trpc.getMarketplaceOverview.queryOptions({}));
  const orderBookQuery = useQuery({ ...trpc.getOrderBook.queryOptions({ shareClassId: selectedShareClass ?? 0 }), enabled: !!selectedShareClass });
  const myOrdersQuery = useQuery({ ...trpc.getMyOrders.queryOptions({ authToken: authToken ?? "" }), enabled: !!authToken });
  const tradesQuery = useQuery({ ...trpc.getTradeHistory.queryOptions({ shareClassId: selectedShareClass ?? 0 }), enabled: !!selectedShareClass });
  const priceHistoryQuery = useQuery({ ...trpc.getSharePriceHistory.queryOptions({ shareClassId: selectedShareClass ?? 0 }), enabled: !!selectedShareClass });

  const placeOrderMutation = useMutation(trpc.placeShareOrder.mutationOptions({
    onSuccess: () => { toast.success("Order placed"); qc.invalidateQueries({ queryKey: trpc.getOrderBook.queryKey() }); qc.invalidateQueries({ queryKey: trpc.getMyOrders.queryKey() }); setOrderForm({ side: "BUY", quantity: 1, pricePerShare: 0 }); },
    onError: (e: any) => toast.error(e.message),
  }));

  const cancelMutation = useMutation(trpc.cancelShareOrder.mutationOptions({
    onSuccess: () => { toast.success("Order cancelled"); qc.invalidateQueries({ queryKey: trpc.getOrderBook.queryKey() }); qc.invalidateQueries({ queryKey: trpc.getMyOrders.queryKey() }); },
    onError: (e: any) => toast.error(e.message),
  }));

  const overview = (overviewQuery.data ?? []) as any[];
  const orderBook = orderBookQuery.data as any;
  const myOrders = (myOrdersQuery.data ?? []) as any[];
  const trades = (tradesQuery.data ?? []) as any[];
  const priceHistory = priceHistoryQuery.data as any;

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Share Marketplace</h1>
          <p className="mt-1 text-gray-500">Buy and sell fractional property shares on the secondary market</p>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {overviewQuery.isLoading && <div className="col-span-full flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" /></div>}
          {overview.map((item: any) => (
            <div key={item.id} onClick={() => setSelectedShareClass(item.id)}
              className={`${selectedShareClass === item.id ? "border-gold-500 ring-2 ring-gold-200" : "border-navy-800/50"} cursor-pointer rounded-lg border bg-navy-900/50 p-4 transition hover:shadow-md`}>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-gray-900">{item.name}</span>
                <TrendingUp size={16} className="text-green-500" />
              </div>
              <p className="text-xs text-gray-500">{item.property?.title}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div><p className="text-xs text-gray-500">Price</p><p className="font-bold text-gray-900">R{Number(item.pricePerShare ?? 0).toFixed(2)}</p></div>
                <div><p className="text-xs text-gray-500">Best Bid</p><p className="font-bold text-green-400">{item.bestBid ? `R${Number(item.bestBid).toFixed(2)}` : "\u2014"}</p></div>
                <div><p className="text-xs text-gray-500">Best Ask</p><p className="font-bold text-red-600">{item.bestAsk ? `R${Number(item.bestAsk).toFixed(2)}` : "\u2014"}</p></div>
              </div>
            </div>
          ))}
          {overview.length === 0 && !overviewQuery.isLoading && (
            <div className="col-span-full rounded-lg border-2 border-dashed border-navy-700 py-12 text-center text-gray-500">
              <ArrowUpDown className="mx-auto mb-3" size={48} /><p className="text-lg font-medium">No share classes available for trading yet</p>
            </div>
          )}
        </div>

        {selectedShareClass && (
          <>
            <div className="mb-4 flex gap-1 rounded-lg bg-navy-900/50 p-1">
              {([{ key: "market" as const, label: "Order Book", icon: BarChart3 }, { key: "my-orders" as const, label: "My Orders", icon: ShoppingCart }, { key: "trades" as const, label: "Recent Trades", icon: Activity }, { key: "history" as const, label: "Price History", icon: TrendingUp }]).map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium ${tab === key ? "bg-navy-800 text-gray-900 shadow" : "text-gray-500"}`}><Icon size={14} /> {label}</button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="rounded-lg border border-navy-800/50 bg-navy-900/50 p-6 lg:col-span-1">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">Place Order</h3>
                <div className="mb-4 flex gap-1 rounded-lg bg-navy-800 p-1">
                  {(["BUY", "SELL"] as const).map((s) => (
                    <button key={s} onClick={() => setOrderForm({ ...orderForm, side: s })} className={`flex-1 rounded-md py-2 text-sm font-medium ${orderForm.side === s ? (s === "BUY" ? "bg-green-600 text-white" : "bg-red-600 text-white") : "text-gray-500"}`}>{s}</button>
                  ))}
                </div>
                <div className="space-y-3">
                  <div><label className="mb-1 block text-sm text-gray-500">Quantity</label><input type="number" min={1} value={orderForm.quantity} onChange={(e) => setOrderForm({ ...orderForm, quantity: parseInt(e.target.value) || 1 })} className="w-full rounded-lg border border-navy-800/50 bg-navy-800/30 p-2 text-gray-900" /></div>
                  <div><label className="mb-1 block text-sm text-gray-500">Price per Share (R)</label><input type="number" min={0} step={0.01} value={orderForm.pricePerShare} onChange={(e) => setOrderForm({ ...orderForm, pricePerShare: parseFloat(e.target.value) || 0 })} className="w-full rounded-lg border border-navy-800/50 bg-navy-800/30 p-2 text-gray-900" /></div>
                  <div className="rounded-lg bg-navy-800/50 p-3"><div className="flex justify-between text-sm"><span className="text-gray-500">Total</span><span className="font-bold text-gray-900">R{(orderForm.quantity * orderForm.pricePerShare).toFixed(2)}</span></div></div>
                  <button onClick={() => { if (!orderForm.pricePerShare) { toast.error("Set a price"); return; } (placeOrderMutation.mutate as any)({ authToken: authToken ?? "", shareClassId: selectedShareClass, side: orderForm.side, quantity: orderForm.quantity, pricePerShare: orderForm.pricePerShare }); }} disabled={placeOrderMutation.isPending} className={`w-full rounded-lg py-2.5 text-sm font-semibold text-white ${orderForm.side === "BUY" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"} disabled:opacity-50`}>
                    {placeOrderMutation.isPending ? "Placing..." : `${orderForm.side} Shares`}
                  </button>
                </div>
              </div>

              <div className="lg:col-span-2">
                {tab === "market" && (
                  <div className="rounded-lg border border-navy-800/50 bg-navy-900/50">
                    {orderBookQuery.isLoading ? <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" /></div> : orderBook ? (
                      <>
                        <div className="grid grid-cols-2 divide-x divide-navy-700">
                          <div>
                            <div className="border-b border-navy-700 bg-green-900/20 px-4 py-2"><span className="text-sm font-medium text-green-300">Bids (Buy)</span></div>
                            <div className="divide-y divide-navy-800">
                              {orderBook.buyLevels?.map((b: any, i: number) => (<div key={i} className="grid grid-cols-3 px-4 py-2 text-sm"><span className="font-medium text-green-400">R{Number(b.pricePerShare).toFixed(2)}</span><span className="text-center text-gray-500">{b._sum?.quantity ?? b._count}</span><span className="text-right text-gray-500">{b._count}</span></div>))}
                              {!orderBook.buyLevels?.length && <p className="px-4 py-6 text-center text-xs text-gray-500">No bids</p>}
                            </div>
                          </div>
                          <div>
                            <div className="border-b border-navy-700 bg-red-900/20 px-4 py-2"><span className="text-sm font-medium text-red-300">Asks (Sell)</span></div>
                            <div className="divide-y divide-navy-800">
                              {orderBook.sellLevels?.map((a: any, i: number) => (<div key={i} className="grid grid-cols-3 px-4 py-2 text-sm"><span className="font-medium text-red-600">R{Number(a.pricePerShare).toFixed(2)}</span><span className="text-center text-gray-500">{a._sum?.quantity ?? a._count}</span><span className="text-right text-gray-500">{a._count}</span></div>))}
                              {!orderBook.sellLevels?.length && <p className="px-4 py-6 text-center text-xs text-gray-500">No asks</p>}
                            </div>
                          </div>
                        </div>
                        {orderBook.spread != null && <div className="border-t border-navy-700 bg-navy-900 px-4 py-2 text-center text-sm text-gray-500">Spread: <span className="font-medium text-gray-900">R{Number(orderBook.spread).toFixed(2)}</span></div>}
                      </>
                    ) : null}
                  </div>
                )}
                {tab === "my-orders" && (
                  <div className="overflow-x-auto rounded-lg border border-navy-800/50 bg-navy-900/50">
                    <table className="w-full text-sm">
                      <thead className="border-b border-navy-700 bg-navy-900 text-left text-gray-500"><tr><th className="px-4 py-3">Side</th><th className="px-4 py-3">Share Class</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr></thead>
                      <tbody className="divide-y divide-navy-800">
                        {myOrders.map((o: any) => (<tr key={o.id}><td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${o.side === "BUY" ? "bg-green-500/10 text-green-400" : "bg-red-50 text-red-600"}`}>{o.side}</span></td><td className="px-4 py-3 text-gray-600">{o.shareClass?.name}</td><td className="px-4 py-3 text-white">R{Number(o.pricePerShare).toFixed(2)}</td><td className="px-4 py-3 text-gray-600">{o.quantity}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${o.status === "OPEN" ? "bg-blue-50 text-blue-600" : "bg-green-500/10 text-green-400"}`}>{o.status}</span></td><td className="px-4 py-3">{o.status === "OPEN" && <button onClick={() => (cancelMutation.mutate as any)({ authToken: authToken ?? "", orderId: o.id })} className="text-red-600 hover:text-red-300"><XCircle size={16} /></button>}</td></tr>))}
                      </tbody>
                    </table>
                    {myOrders.length === 0 && <p className="py-8 text-center text-gray-500">No orders placed yet</p>}
                  </div>
                )}
                {tab === "trades" && (
                  <div className="overflow-x-auto rounded-lg border border-navy-800/50 bg-navy-900/50">
                    <table className="w-full text-sm">
                      <thead className="border-b border-navy-700 bg-navy-900 text-left text-gray-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Total</th></tr></thead>
                      <tbody className="divide-y divide-navy-800">
                        {trades.map((t: any) => (<tr key={t.id}><td className="px-4 py-3 text-gray-500">{new Date(t.executedAt).toLocaleString()}</td><td className="px-4 py-3 font-medium text-gray-900">R{Number(t.pricePerShare).toFixed(2)}</td><td className="px-4 py-3 text-gray-600">{t.quantity}</td><td className="px-4 py-3 text-gold-600">R{(t.quantity * Number(t.pricePerShare)).toFixed(2)}</td></tr>))}
                      </tbody>
                    </table>
                    {trades.length === 0 && <p className="py-8 text-center text-gray-500">No trades yet</p>}
                  </div>
                )}
                {tab === "history" && (
                  <div className="rounded-lg border border-navy-800/50 bg-navy-900/50 p-6">
                    <h3 className="mb-4 font-medium text-gray-900">Price History</h3>
                    {priceHistory?.history?.length ? (
                      <div className="space-y-1">
                        <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
                          <div className="rounded-lg bg-blue-50 p-3"><p className="text-xs text-gray-500">Base</p><p className="text-lg font-bold text-blue-600">R{Number(priceHistory.basePrice).toFixed(2)}</p></div>
                          <div className="rounded-lg bg-green-500/10 p-3"><p className="text-xs text-gray-500">Current</p><p className="text-lg font-bold text-green-400">R{Number(priceHistory.currentPrice).toFixed(2)}</p></div>
                          <div className="rounded-lg bg-purple-50 p-3"><p className="text-xs text-gray-500">Last Trade</p><p className="text-lg font-bold text-purple-600">{priceHistory.lastTradePrice ? `R${Number(priceHistory.lastTradePrice).toFixed(2)}` : "\u2014"}</p></div>
                        </div>
                        {(() => { const maxP = Math.max(...priceHistory.history.map((p: any) => Number(p.price))); return priceHistory.history.slice(-30).map((p: any, i: number) => (<div key={i} className="flex items-center gap-2 text-sm"><span className="w-24 text-xs text-gray-500">{new Date(p.recordedAt).toLocaleDateString()}</span><div className="flex-1"><div className="h-4 rounded bg-gold-500" style={{ width: `${(Number(p.price) / maxP) * 100}%` }} /></div><span className="w-20 text-right font-medium text-white">R{Number(p.price).toFixed(2)}</span></div>)); })()}
                      </div>
                    ) : <p className="text-center text-gray-500">No price history available</p>}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
