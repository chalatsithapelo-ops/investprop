import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { TRPCError } from "@trpc/server";
import { createNotification } from "./notifications";

// ─── Place Order (Buy or Sell) ─────────────────────────────────

export const placeShareOrder = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      shareClassId: z.number(),
      side: z.enum(["BUY", "SELL"]),
      quantity: z.number().int().min(1),
      pricePerShare: z.number().min(0.01),
      expiresInDays: z.number().int().min(1).max(90).optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    // KYC verification gate: Ensure investor has approved KYC documents
    const kycDocs = await db.kYCDocument.findMany({ where: { investorId: user.id } });
    const approvedTypes = kycDocs.filter((d) => d.status === "APPROVED").map((d) => d.documentType);
    const requiredKYC = ["ID_DOCUMENT", "PROOF_OF_ADDRESS", "BANK_STATEMENT"];
    const missingKYC = requiredKYC.filter((t) => !approvedTypes.includes(t as any));
    if (missingKYC.length > 0) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `KYC verification required before trading. Missing: ${missingKYC.join(", ")}. Please upload and get approval on the KYC Compliance page.`,
      });
    }

    const shareClass = await db.shareClass.findUnique({
      where: { id: input.shareClassId },
    });
    if (!shareClass) throw new TRPCError({ code: "NOT_FOUND", message: "Share class not found" });

    // If selling, check that user has enough shares
    if (input.side === "SELL") {
      const holding = await db.shareHolding.findUnique({
        where: {
          shareClassId_investorId: {
            shareClassId: input.shareClassId,
            investorId: user.id,
          },
        },
      });
      // Also check open sell orders
      const openSellOrders = await db.shareOrder.findMany({
        where: {
          shareClassId: input.shareClassId,
          investorId: user.id,
          side: "SELL",
          status: { in: ["OPEN", "PARTIALLY_FILLED"] },
        },
      });
      const committedShares = openSellOrders.reduce(
        (s, o) => s + (o.quantity - o.filledQuantity),
        0
      );
      const available = (holding?.sharesOwned ?? 0) - committedShares;
      if (input.quantity > available) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Insufficient shares. Available: ${available} (${holding?.sharesOwned ?? 0} held, ${committedShares} committed to sell orders)`,
        });
      }
    }

    const expiresAt = input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 86400000)
      : null;

    const order = await db.shareOrder.create({
      data: {
        shareClassId: input.shareClassId,
        investorId: user.id,
        side: input.side,
        quantity: input.quantity,
        pricePerShare: input.pricePerShare,
        expiresAt,
      },
    });

    // ROFR: If selling, notify existing shareholders with right of first refusal
    if (input.side === "SELL") {
      const existingHolders = await db.shareHolding.findMany({
        where: {
          shareClassId: input.shareClassId,
          investorId: { not: user.id },
        },
        select: { investorId: true, sharesOwned: true },
      });

      for (const holder of existingHolders) {
        await createNotification(
          holder.investorId,
          "Right of First Refusal — Shares For Sale",
          `${user.name} is selling ${input.quantity} shares at R${input.pricePerShare.toFixed(2)}/share (total R${(input.quantity * input.pricePerShare).toFixed(2)}). As an existing shareholder, you have priority to purchase. ${expiresAt ? `Offer expires: ${expiresAt.toLocaleDateString()}.` : ""}`,
          "WARNING",
          "INVESTMENT",
          shareClass.propertyId
        );
      }
    }

    // Try to match immediately
    const trades = await matchOrders(order.id);

    return { order, tradesExecuted: trades.length };
  });

// ─── Get Order Book ────────────────────────────────────────────

export const getOrderBook = baseProcedure
  .input(z.object({ shareClassId: z.number() }))
  .query(async ({ input }) => {
    const buyOrders = await db.shareOrder.findMany({
      where: {
        shareClassId: input.shareClassId,
        side: "BUY",
        status: { in: ["OPEN", "PARTIALLY_FILLED"] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { pricePerShare: "desc" }, // Best buy price first
      include: { investor: { select: { id: true, name: true } } },
    });

    const sellOrders = await db.shareOrder.findMany({
      where: {
        shareClassId: input.shareClassId,
        side: "SELL",
        status: { in: ["OPEN", "PARTIALLY_FILLED"] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { pricePerShare: "asc" }, // Best sell price first
      include: { investor: { select: { id: true, name: true } } },
    });

    // Aggregate by price level
    const buyLevels = aggregateOrderLevels(buyOrders);
    const sellLevels = aggregateOrderLevels(sellOrders);

    // Best bid/ask
    const bestBid = buyOrders[0]?.pricePerShare ?? null;
    const bestAsk = sellOrders[0]?.pricePerShare ?? null;
    const spread = bestBid && bestAsk ? bestAsk - bestBid : null;

    return {
      buyOrders: buyOrders.map(sanitizeOrder),
      sellOrders: sellOrders.map(sanitizeOrder),
      buyLevels,
      sellLevels,
      bestBid,
      bestAsk,
      spread,
    };
  });

// ─── Get My Orders ─────────────────────────────────────────────

export const getMyOrders = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      shareClassId: z.number().optional(),
      status: z.enum(["OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "EXPIRED"]).optional(),
    })
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const where: any = { investorId: user.id };
    if (input.shareClassId) where.shareClassId = input.shareClassId;
    if (input.status) where.status = input.status;

    return db.shareOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        shareClass: {
          select: {
            id: true, name: true, pricePerShare: true,
            property: { select: { id: true, title: true } },
          },
        },
      },
    });
  });

// ─── Cancel Order ──────────────────────────────────────────────

export const cancelShareOrder = baseProcedure
  .input(z.object({ authToken: z.string(), orderId: z.number() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const order = await db.shareOrder.findUnique({ where: { id: input.orderId } });
    if (!order) throw new TRPCError({ code: "NOT_FOUND" });
    if (order.investorId !== user.id) throw new TRPCError({ code: "FORBIDDEN" });
    if (!["OPEN", "PARTIALLY_FILLED"].includes(order.status)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Order cannot be cancelled" });
    }

    return db.shareOrder.update({
      where: { id: input.orderId },
      data: { status: "CANCELLED" },
    });
  });

// ─── Get Trade History ─────────────────────────────────────────

export const getTradeHistory = baseProcedure
  .input(
    z.object({
      shareClassId: z.number().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    })
  )
  .query(async ({ input }) => {
    const where: any = {};
    if (input.shareClassId) where.shareClassId = input.shareClassId;

    return db.shareTrade.findMany({
      where,
      orderBy: { executedAt: "desc" },
      take: input.limit,
      include: {
        shareClass: {
          select: {
            id: true, name: true,
            property: { select: { id: true, title: true } },
          },
        },
      },
    });
  });

// ─── Get Share Price History ───────────────────────────────────

export const getSharePriceHistory = baseProcedure
  .input(
    z.object({
      shareClassId: z.number(),
      days: z.number().int().min(1).max(365).default(90),
    })
  )
  .query(async ({ input }) => {
    const from = new Date();
    from.setDate(from.getDate() - input.days);

    const history = await db.sharePriceHistory.findMany({
      where: {
        shareClassId: input.shareClassId,
        recordedAt: { gte: from },
      },
      orderBy: { recordedAt: "asc" },
    });

    // Also get latest trade price
    const lastTrade = await db.shareTrade.findFirst({
      where: { shareClassId: input.shareClassId },
      orderBy: { executedAt: "desc" },
    });

    // Get the share class base price
    const shareClass = await db.shareClass.findUnique({
      where: { id: input.shareClassId },
    });

    return {
      history,
      lastTradePrice: lastTrade?.pricePerShare ?? null,
      basePrice: shareClass?.pricePerShare ?? 0,
      currentPrice: lastTrade?.pricePerShare ?? shareClass?.pricePerShare ?? 0,
    };
  });

// ─── Get Marketplace Overview (all tradeable share classes) ────

export const getMarketplaceOverview = baseProcedure
  .input(z.object({}))
  .query(async () => {
    const shareClasses = await db.shareClass.findMany({
      include: {
        property: {
          select: {
            id: true, title: true, city: true, imageUrl: true,
            price: true, investmentStatus: true,
          },
        },
        holdings: true,
        orders: {
          where: { status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
          select: { side: true, quantity: true, filledQuantity: true, pricePerShare: true },
        },
      },
    });

    return shareClasses.map((sc) => {
      const totalSold = sc.holdings.reduce((s, h) => s + h.sharesOwned, 0);
      const buyOrders = sc.orders.filter((o) => o.side === "BUY");
      const sellOrders = sc.orders.filter((o) => o.side === "SELL");
      const bestBid = buyOrders.length > 0
        ? Math.max(...buyOrders.map((o) => o.pricePerShare))
        : null;
      const bestAsk = sellOrders.length > 0
        ? Math.min(...sellOrders.map((o) => o.pricePerShare))
        : null;

      return {
        id: sc.id,
        name: sc.name,
        property: sc.property,
        totalShares: sc.totalShares,
        availableShares: sc.totalShares - totalSold,
        pricePerShare: sc.pricePerShare,
        bestBid,
        bestAsk,
        openBuyOrders: buyOrders.length,
        openSellOrders: sellOrders.length,
        totalInvestors: sc.holdings.length,
      };
    });
  });

// ═══════════════════════════════════════════════════════════════
//  Order Matching Engine
// ═══════════════════════════════════════════════════════════════

async function matchOrders(newOrderId: number): Promise<any[]> {
  const newOrder = await db.shareOrder.findUnique({ where: { id: newOrderId } });
  if (!newOrder || !["OPEN", "PARTIALLY_FILLED"].includes(newOrder.status)) return [];

  const oppositeSide = newOrder.side === "BUY" ? "SELL" : "BUY";
  const priceCondition =
    newOrder.side === "BUY"
      ? { lte: newOrder.pricePerShare } // Buy: match sell orders at or below my price
      : { gte: newOrder.pricePerShare }; // Sell: match buy orders at or above my price

  const matchingOrders = await db.shareOrder.findMany({
    where: {
      shareClassId: newOrder.shareClassId,
      side: oppositeSide,
      status: { in: ["OPEN", "PARTIALLY_FILLED"] },
      pricePerShare: priceCondition,
      investorId: { not: newOrder.investorId }, // Can't trade with yourself
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: [
      { pricePerShare: oppositeSide === "SELL" ? "asc" : "desc" }, // Best price first
      { createdAt: "asc" }, // Oldest first (FIFO)
    ],
  });

  const trades: any[] = [];

  for (const counterOrder of matchingOrders) {
    const remainingNew = newOrder.quantity - newOrder.filledQuantity;
    const remainingCounter = counterOrder.quantity - counterOrder.filledQuantity;
    if (remainingNew <= 0) break;

    const fillQty = Math.min(remainingNew, remainingCounter);
    const tradePrice = counterOrder.pricePerShare; // Price taker gets maker's price
    const totalAmount = fillQty * tradePrice;

    const buyerId = newOrder.side === "BUY" ? newOrder.investorId : counterOrder.investorId;
    const sellerId = newOrder.side === "SELL" ? newOrder.investorId : counterOrder.investorId;
    const buyOrderId = newOrder.side === "BUY" ? newOrder.id : counterOrder.id;
    const sellOrderId = newOrder.side === "SELL" ? newOrder.id : counterOrder.id;

    await db.$transaction(async (tx) => {
      // Record trade
      const trade = await tx.shareTrade.create({
        data: {
          shareClassId: newOrder.shareClassId,
          buyOrderId,
          sellOrderId,
          buyerId,
          sellerId,
          quantity: fillQty,
          pricePerShare: tradePrice,
          totalAmount,
        },
      });
      trades.push(trade);

      // Update order fills
      const newFilled = newOrder.filledQuantity + fillQty;
      const counterFilled = counterOrder.filledQuantity + fillQty;

      await tx.shareOrder.update({
        where: { id: newOrder.id },
        data: {
          filledQuantity: newFilled,
          status: newFilled >= newOrder.quantity ? "FILLED" : "PARTIALLY_FILLED",
        },
      });
      newOrder.filledQuantity = newFilled;

      await tx.shareOrder.update({
        where: { id: counterOrder.id },
        data: {
          filledQuantity: counterFilled,
          status: counterFilled >= counterOrder.quantity ? "FILLED" : "PARTIALLY_FILLED",
        },
      });

      // Transfer shares: deduct from seller's holding, add to buyer's holding
      const sellerHolding = await tx.shareHolding.findUnique({
        where: {
          shareClassId_investorId: {
            shareClassId: newOrder.shareClassId,
            investorId: sellerId,
          },
        },
      });

      if (sellerHolding) {
        const sellerNewBalance = sellerHolding.sharesOwned - fillQty;
        if (sellerNewBalance <= 0) {
          await tx.shareHolding.delete({ where: { id: sellerHolding.id } });
        } else {
          await tx.shareHolding.update({
            where: { id: sellerHolding.id },
            data: { sharesOwned: sellerNewBalance },
          });
        }

        // Ledger entry for seller
        await tx.shareLedgerEntry.create({
          data: {
            propertyId: (await tx.shareClass.findUnique({ where: { id: newOrder.shareClassId } }))!.propertyId,
            shareClassId: newOrder.shareClassId,
            investorId: sellerId,
            transactionType: "SALE",
            shares: -fillQty,
            pricePerShare: tradePrice,
            totalAmount,
            reference: `Market sale — Order #${sellOrderId}`,
            balanceAfter: Math.max(0, sellerNewBalance),
          },
        });
      }

      // Add to buyer
      const buyerHolding = await tx.shareHolding.findUnique({
        where: {
          shareClassId_investorId: {
            shareClassId: newOrder.shareClassId,
            investorId: buyerId,
          },
        },
      });

      const buyerNewBalance = (buyerHolding?.sharesOwned ?? 0) + fillQty;
      const buyerAvgCost = buyerHolding
        ? ((buyerHolding.averageCostPerShare * buyerHolding.sharesOwned) + totalAmount) / buyerNewBalance
        : tradePrice;

      const sc = await tx.shareClass.findUnique({ where: { id: newOrder.shareClassId } });

      await tx.shareHolding.upsert({
        where: {
          shareClassId_investorId: {
            shareClassId: newOrder.shareClassId,
            investorId: buyerId,
          },
        },
        create: {
          propertyId: sc!.propertyId,
          shareClassId: newOrder.shareClassId,
          investorId: buyerId,
          sharesOwned: fillQty,
          averageCostPerShare: tradePrice,
        },
        update: {
          sharesOwned: buyerNewBalance,
          averageCostPerShare: buyerAvgCost,
        },
      });

      // Ledger entry for buyer
      await tx.shareLedgerEntry.create({
        data: {
          propertyId: sc!.propertyId,
          shareClassId: newOrder.shareClassId,
          investorId: buyerId,
          transactionType: "PURCHASE",
          shares: fillQty,
          pricePerShare: tradePrice,
          totalAmount,
          reference: `Market purchase — Order #${buyOrderId}`,
          balanceAfter: buyerNewBalance,
        },
      });

      // Record price history
      await tx.sharePriceHistory.create({
        data: {
          shareClassId: newOrder.shareClassId,
          price: tradePrice,
          volume: fillQty,
        },
      });
    });
  }

  return trades;
}

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════

function sanitizeOrder(order: any) {
  return {
    id: order.id,
    side: order.side,
    quantity: order.quantity,
    filledQuantity: order.filledQuantity,
    remainingQuantity: order.quantity - order.filledQuantity,
    pricePerShare: order.pricePerShare,
    status: order.status,
    investorName: order.investor?.name,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
  };
}

function aggregateOrderLevels(orders: any[]) {
  const levels: Record<number, { price: number; quantity: number; orders: number }> = {};
  for (const o of orders) {
    const remaining = o.quantity - o.filledQuantity;
    const level = (levels[o.pricePerShare] ??= { price: o.pricePerShare, quantity: 0, orders: 0 });
    level.quantity += remaining;
    level.orders += 1;
  }
  return Object.values(levels);
}
