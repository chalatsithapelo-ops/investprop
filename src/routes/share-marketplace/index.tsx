import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
// Secondary market: order book + direct peer-to-peer transfer
import { TrendingUp, ArrowUpDown, BarChart3, XCircle, Activity, ShoppingCart, AlertTriangle, Send, Loader2, UserCheck } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/share-marketplace/")({
  component: ShareMarketplacePage,
});

function ShareMarketplacePage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const [selectedShareClass, setSelectedShareClass] = useState<number | null>(null);
  const [orderForm, setOrderForm] = useState({ side: "BUY" as "BUY" | "SELL", quantity: 1, pricePerShare: 0 });
  const [tab, setTab] = useState<"market" | "my-orders" | "trades" | "history">("market");
  const [transferOpen, setTransferOpen] = useState(false);


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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Share Marketplace</h1>
            <p className="mt-1 text-gray-500 dark:text-gray-400">Buy and sell fractional property shares on the secondary market</p>
          </div>
          <button
            onClick={() => setTransferOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-600 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:bg-gray-800 dark:text-blue-300 dark:hover:bg-gray-700"
          >
            <Send size={16} /> Direct Transfer
          </button>
        </div>


        {/* Liquidity disclaimer (Phase 10) */}
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 flex-shrink-0" size={18} />
          <div>
            <p className="font-semibold">Liquidity warning</p>
            <p className="mt-0.5">
              Secondary-market liquidity is not guaranteed. You may be unable to sell shares quickly or at the expected price.
              Spreads can be wide and trading volumes thin. Prices shown are indicative and subject to market conditions.
            </p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {overviewQuery.isLoading && <div className="col-span-full flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" /></div>}
          {overview.map((item: any) => (
            <div key={item.id} onClick={() => setSelectedShareClass(item.id)}
              className={`cursor-pointer rounded-lg border p-4 transition hover:shadow-md ${selectedShareClass === item.id ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200 dark:border-gray-700"} bg-white dark:bg-gray-800`}>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-gray-900 dark:text-white">{item.name}</span>
                <TrendingUp size={16} className="text-green-500" />
              </div>
              <p className="text-xs text-gray-500">{item.property?.title}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div><p className="text-xs text-gray-500">Price</p><p className="font-bold text-gray-900 dark:text-white">R{Number(item.pricePerShare ?? 0).toFixed(2)}</p></div>
                <div><p className="text-xs text-gray-500">Best Bid</p><p className="font-bold text-green-600">{item.bestBid ? `R${Number(item.bestBid).toFixed(2)}` : "—"}</p></div>
                <div><p className="text-xs text-gray-500">Best Ask</p><p className="font-bold text-red-600">{item.bestAsk ? `R${Number(item.bestAsk).toFixed(2)}` : "—"}</p></div>
              </div>
            </div>
          ))}
          {overview.length === 0 && !overviewQuery.isLoading && (
            <div className="col-span-full rounded-lg border-2 border-dashed py-12 text-center text-gray-500 dark:border-gray-600">
              <ArrowUpDown className="mx-auto mb-3" size={48} /><p className="text-lg font-medium">No share classes available for trading yet</p>
            </div>
          )}
        </div>

        {selectedShareClass && (
          <>
            <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
              {([{ key: "market" as const, label: "Order Book", icon: BarChart3 }, { key: "my-orders" as const, label: "My Orders", icon: ShoppingCart }, { key: "trades" as const, label: "Recent Trades", icon: Activity }, { key: "history" as const, label: "Price History", icon: TrendingUp }]).map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium ${tab === key ? "bg-white text-gray-900 shadow dark:bg-gray-700 dark:text-white" : "text-gray-500"}`}><Icon size={14} /> {label}</button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="rounded-lg border bg-white p-6 dark:border-gray-700 dark:bg-gray-800 lg:col-span-1">
                <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Place Order</h3>
                <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-700">
                  {(["BUY", "SELL"] as const).map((s) => (
                    <button key={s} onClick={() => setOrderForm({ ...orderForm, side: s })} className={`flex-1 rounded-md py-2 text-sm font-medium ${orderForm.side === s ? (s === "BUY" ? "bg-green-600 text-white" : "bg-red-600 text-white") : "text-gray-500"}`}>{s}</button>
                  ))}
                </div>
                <div className="space-y-3">
                  <div><label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">Quantity</label><input type="number" min={1} value={orderForm.quantity} onChange={(e) => setOrderForm({ ...orderForm, quantity: parseInt(e.target.value) || 1 })} className="w-full rounded-lg border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white" /></div>
                  <div><label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">Price per Share (R)</label><input type="number" min={0} step={0.01} value={orderForm.pricePerShare} onChange={(e) => setOrderForm({ ...orderForm, pricePerShare: parseFloat(e.target.value) || 0 })} className="w-full rounded-lg border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white" /></div>
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700"><div className="flex justify-between text-sm"><span className="text-gray-500">Total</span><span className="font-bold text-gray-900 dark:text-white">R{(orderForm.quantity * orderForm.pricePerShare).toFixed(2)}</span></div></div>
                  <button onClick={() => { if (!orderForm.pricePerShare) { toast.error("Set a price"); return; } (placeOrderMutation.mutate as any)({ authToken: authToken ?? "", shareClassId: selectedShareClass, side: orderForm.side, quantity: orderForm.quantity, pricePerShare: orderForm.pricePerShare }); }} disabled={placeOrderMutation.isPending} className={`w-full rounded-lg py-2.5 text-sm font-semibold text-white ${orderForm.side === "BUY" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"} disabled:opacity-50`}>
                    {placeOrderMutation.isPending ? "Placing..." : `${orderForm.side} Shares`}
                  </button>
                </div>
              </div>

              <div className="lg:col-span-2">
                {tab === "market" && (
                  <div className="rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
                    {orderBookQuery.isLoading ? <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" /></div> : orderBook ? (
                      <>
                        <div className="grid grid-cols-2 divide-x dark:divide-gray-700">
                          <div>
                            <div className="border-b bg-green-50 px-4 py-2 dark:border-gray-700 dark:bg-green-900/20"><span className="text-sm font-medium text-green-800 dark:text-green-300">Bids (Buy)</span></div>
                            <div className="divide-y dark:divide-gray-700">
                              {orderBook.buyLevels?.map((b: any, i: number) => (<div key={i} className="grid grid-cols-3 px-4 py-2 text-sm"><span className="font-medium text-green-600">R{Number(b.pricePerShare).toFixed(2)}</span><span className="text-center">{b._sum?.quantity ?? b._count}</span><span className="text-right text-gray-500">{b._count}</span></div>))}
                              {!orderBook.buyLevels?.length && <p className="px-4 py-6 text-center text-xs text-gray-400">No bids</p>}
                            </div>
                          </div>
                          <div>
                            <div className="border-b bg-red-50 px-4 py-2 dark:border-gray-700 dark:bg-red-900/20"><span className="text-sm font-medium text-red-800 dark:text-red-300">Asks (Sell)</span></div>
                            <div className="divide-y dark:divide-gray-700">
                              {orderBook.sellLevels?.map((a: any, i: number) => (<div key={i} className="grid grid-cols-3 px-4 py-2 text-sm"><span className="font-medium text-red-600">R{Number(a.pricePerShare).toFixed(2)}</span><span className="text-center">{a._sum?.quantity ?? a._count}</span><span className="text-right text-gray-500">{a._count}</span></div>))}
                              {!orderBook.sellLevels?.length && <p className="px-4 py-6 text-center text-xs text-gray-400">No asks</p>}
                            </div>
                          </div>
                        </div>
                        {orderBook.spread != null && <div className="border-t bg-gray-50 px-4 py-2 text-center text-sm dark:border-gray-700 dark:bg-gray-900">Spread: <span className="font-medium">R{Number(orderBook.spread).toFixed(2)}</span></div>}
                        {(() => {
                          const buyCount = orderBook.buyLevels?.length ?? 0;
                          const sellCount = orderBook.sellLevels?.length ?? 0;
                          const thin = buyCount < 2 || sellCount < 2;
                          const refPrice = Number(orderBook.buyLevels?.[0]?.pricePerShare ?? orderBook.sellLevels?.[0]?.pricePerShare ?? 0);
                          const wideSpread = orderBook.spread != null && refPrice > 0 && Number(orderBook.spread) / refPrice > 0.05;
                          if (!thin && !wideSpread) return null;
                          return (
                            <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                              <AlertTriangle className="mr-1 inline" size={12} />
                              {thin && "Low order-book depth — trades may take longer to fill. "}
                              {wideSpread && "Wide bid/ask spread — execution price uncertainty is elevated."}
                            </div>
                          );
                        })()}
                      </>
                    ) : null}
                  </div>
                )}
                {tab === "my-orders" && (
                  <div className="overflow-x-auto rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-gray-50 text-left text-gray-500 dark:border-gray-700 dark:bg-gray-900"><tr><th className="px-4 py-3">Side</th><th className="px-4 py-3">Share Class</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr></thead>
                      <tbody className="divide-y dark:divide-gray-700">
                        {myOrders.map((o: any) => (<tr key={o.id}><td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${o.side === "BUY" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{o.side}</span></td><td className="px-4 py-3">{o.shareClass?.name}</td><td className="px-4 py-3">R{Number(o.pricePerShare).toFixed(2)}</td><td className="px-4 py-3">{o.quantity}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${o.status === "OPEN" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}`}>{o.status}</span></td><td className="px-4 py-3">{o.status === "OPEN" && <button onClick={() => (cancelMutation.mutate as any)({ authToken: authToken ?? "", orderId: o.id })} className="text-red-600 hover:text-red-800"><XCircle size={16} /></button>}</td></tr>))}
                      </tbody>
                    </table>
                    {myOrders.length === 0 && <p className="py-8 text-center text-gray-500">No orders placed yet</p>}
                  </div>
                )}
                {tab === "trades" && (
                  <div className="overflow-x-auto rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-gray-50 text-left text-gray-500 dark:border-gray-700 dark:bg-gray-900"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Total</th></tr></thead>
                      <tbody className="divide-y dark:divide-gray-700">
                        {trades.map((t: any) => (<tr key={t.id}><td className="px-4 py-3 text-gray-500">{new Date(t.executedAt).toLocaleString()}</td><td className="px-4 py-3 font-medium">R{Number(t.pricePerShare).toFixed(2)}</td><td className="px-4 py-3">{t.quantity}</td><td className="px-4 py-3">R{(t.quantity * Number(t.pricePerShare)).toFixed(2)}</td></tr>))}
                      </tbody>
                    </table>
                    {trades.length === 0 && <p className="py-8 text-center text-gray-500">No trades yet</p>}
                  </div>
                )}
                {tab === "history" && (
                  <div className="rounded-lg border bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                    <h3 className="mb-4 font-medium text-gray-900 dark:text-white">Price History</h3>
                    {priceHistory?.history?.length ? (
                      <div className="space-y-1">
                        <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
                          <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20"><p className="text-xs text-gray-500">Base</p><p className="text-lg font-bold text-blue-700">R{Number(priceHistory.basePrice).toFixed(2)}</p></div>
                          <div className="rounded-lg bg-green-50 p-3 dark:bg-green-900/20"><p className="text-xs text-gray-500">Current</p><p className="text-lg font-bold text-green-700">R{Number(priceHistory.currentPrice).toFixed(2)}</p></div>
                          <div className="rounded-lg bg-purple-50 p-3 dark:bg-purple-900/20"><p className="text-xs text-gray-500">Last Trade</p><p className="text-lg font-bold text-purple-700">{priceHistory.lastTradePrice ? `R${Number(priceHistory.lastTradePrice).toFixed(2)}` : "—"}</p></div>
                        </div>
                        {(() => { const maxP = Math.max(...priceHistory.history.map((p: any) => Number(p.price))); return priceHistory.history.slice(-30).map((p: any, i: number) => (<div key={i} className="flex items-center gap-2 text-sm"><span className="w-24 text-xs text-gray-500">{new Date(p.recordedAt).toLocaleDateString()}</span><div className="flex-1"><div className="h-4 rounded bg-blue-500" style={{ width: `${(Number(p.price) / maxP) * 100}%` }} /></div><span className="w-20 text-right font-medium">R{Number(p.price).toFixed(2)}</span></div>)); })()}
                      </div>
                    ) : <p className="text-center text-gray-500">No price history available</p>}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {transferOpen && (
        <TransferSharesModal
          authToken={authToken ?? ""}
          onClose={() => setTransferOpen(false)}
          onTransferred={() => {
            qc.invalidateQueries({ queryKey: trpc.getOrderBook.queryKey() });
            qc.invalidateQueries({ queryKey: trpc.getMarketplaceOverview.queryKey() });
          }}
        />
      )}
    </div>
  );
}

function TransferSharesModal({
  authToken,
  onClose,
  onTransferred,
}: {
  authToken: string;
  onClose: () => void;
  onTransferred: () => void;
}) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();

  const holdingsQuery = useQuery({
    ...trpc.getMyShareHoldings.queryOptions({ authToken }),
    enabled: !!authToken,
  });
  const holdings = (holdingsQuery.data ?? []) as any[];

  const [shareClassId, setShareClassId] = useState<number | null>(null);
  const [shares, setShares] = useState(1);
  const [code, setCode] = useState("");
  const [recipient, setRecipient] = useState<{ id: number; name: string | null; investorCode: string | null } | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const selected = holdings.find((h) => h.shareClassId === shareClassId) ?? null;
  const pricePerShare = selected?.pricePerShare ?? 0;

  const transferMutation = useMutation(
    trpc.transferShares.mutationOptions({
      onSuccess: (res: any) => {
        toast.success(res?.message ?? `Transferred ${res?.sharesTransferred ?? shares} shares`);
        onTransferred();
        onClose();
      },
      onError: (e: any) => toast.error(e.message),
    }),
  );

  const handleLookup = async () => {
    if (code.trim().length < 3) {
      toast.error("Enter the recipient's investor code");
      return;
    }
    try {
      setLookingUp(true);
      setRecipient(null);
      const r = await trpcClient.lookupInvestorByCode.query({ authToken, investorCode: code });
      setRecipient(r as any);
      toast.success(`Recipient found: ${(r as any).name ?? (r as any).investorCode}`);
    } catch (e: any) {
      toast.error(e.message ?? "Investor not found");
    } finally {
      setLookingUp(false);
    }
  };

  const canSubmit =
    selected && recipient && shares >= 1 && shares <= (selected?.sharesOwned ?? 0) && !transferMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <Send size={20} className="text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Direct Share Transfer</h3>
        </div>

        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <p>
            A direct transfer moves shares to another investor immediately and cannot be reversed.
            Transfers settle off-platform — Investprop does not process the payment between parties.
          </p>
        </div>

        {holdingsQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-blue-600" size={24} />
          </div>
        ) : holdings.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">You don't own any shares to transfer yet.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">Shares to transfer from</label>
              <select
                value={shareClassId ?? ""}
                onChange={(e) => {
                  const id = Number(e.target.value) || null;
                  setShareClassId(id);
                  setShares(1);
                }}
                className="w-full rounded-lg border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Select a holding…</option>
                {holdings.map((h) => (
                  <option key={h.shareClassId} value={h.shareClassId}>
                    {h.propertyTitle} — {h.shareClassName} ({h.sharesOwned} shares)
                  </option>
                ))}
              </select>
            </div>

            {selected && (
              <div>
                <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                  Quantity (max {selected.sharesOwned})
                </label>
                <input
                  type="number"
                  min={1}
                  max={selected.sharesOwned}
                  value={shares}
                  onChange={(e) => setShares(Math.min(selected.sharesOwned, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-full rounded-lg border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Reference price: R{Number(pricePerShare).toFixed(2)} / share · indicative value R
                  {(shares * pricePerShare).toFixed(2)}
                </p>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">Recipient investor code</label>
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setRecipient(null);
                  }}
                  placeholder="IP-INV-00042"
                  className="w-full rounded-lg border p-2 uppercase dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
                <button
                  onClick={handleLookup}
                  disabled={lookingUp}
                  className="rounded-lg bg-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-600 dark:text-gray-200"
                >
                  {lookingUp ? <Loader2 className="animate-spin" size={16} /> : "Find"}
                </button>
              </div>
              {recipient && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-green-50 p-2 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300">
                  <UserCheck size={16} /> {recipient.name ?? "Investor"} ({recipient.investorCode})
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!selected || !recipient) return;
                  (transferMutation.mutate as any)({
                    authToken,
                    shareClassId: selected.shareClassId,
                    toInvestorId: recipient.id,
                    shares,
                    pricePerShare,
                  });
                }}
                disabled={!canSubmit}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {transferMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                Transfer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}