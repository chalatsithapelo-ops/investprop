import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../../wallet/data/wallet_repository.dart';
import '../data/marketplace_repository.dart';
import '../domain/marketplace_models.dart';

class MarketDetailPage extends ConsumerStatefulWidget {
  const MarketDetailPage({
    super.key,
    required this.shareClassId,
    this.shareClass,
  });

  final int shareClassId;
  final MarketShareClass? shareClass;

  @override
  ConsumerState<MarketDetailPage> createState() => _MarketDetailPageState();
}

class _MarketDetailPageState extends ConsumerState<MarketDetailPage> {
  @override
  Widget build(BuildContext context) {
    final book = ref.watch(orderBookProvider(widget.shareClassId));
    final myOrders = ref.watch(myOrdersProvider);
    final myOrderIds =
        myOrders.valueOrNull?.map((o) => o.id).toSet() ?? <int>{};
    final title = widget.shareClass?.propertyTitle ?? 'Share class';

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(orderBookProvider(widget.shareClassId));
          ref.invalidate(myOrdersProvider);
          await ref.read(orderBookProvider(widget.shareClassId).future);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (widget.shareClass != null) _summary(widget.shareClass!),
            const SizedBox(height: 16),
            const Text('Order book',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 8),
            AsyncValueView<OrderBook>(
              value: book,
              onRetry: () =>
                  ref.invalidate(orderBookProvider(widget.shareClassId)),
              data: (b) => _OrderBookView(book: b, myOrderIds: myOrderIds),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () => _openOrderSheet('BUY'),
                    icon: const Icon(Icons.shopping_cart_outlined, size: 18),
                    label: const Text('Buy'),
                    style: FilledButton.styleFrom(
                        backgroundColor: AppColors.success),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () => _openOrderSheet('SELL'),
                    icon: const Icon(Icons.sell_outlined, size: 18),
                    label: const Text('Sell'),
                    style: FilledButton.styleFrom(
                        backgroundColor: AppColors.danger),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _openTransferSheet,
              icon: const Icon(Icons.swap_horiz, size: 18),
              label: const Text('Transfer shares to an investor'),
            ),
            const SizedBox(height: 24),
            const Text('My orders',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 8),
            AsyncValueView<List<MyOrder>>(
              value: myOrders,
              onRetry: () => ref.invalidate(myOrdersProvider),
              data: (orders) {
                final relevant = orders
                    .where((o) => true)
                    .toList(); // all my orders across classes
                if (relevant.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: EmptyState(
                      icon: Icons.receipt_long_outlined,
                      title: 'No open orders',
                      subtitle: 'Your buy and sell orders will show here.',
                    ),
                  );
                }
                return Column(
                  children: [
                    for (final o in relevant)
                      _MyOrderTile(order: o, onCancel: () => _cancel(o.id)),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _summary(MarketShareClass sc) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(sc.name,
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 2),
            Text(sc.propertyCity,
                style: const TextStyle(
                    fontSize: 12, color: AppColors.textSecondary)),
            const SizedBox(height: 14),
            Row(
              children: [
                _SumCell(label: 'List price', value: Fmt.money(sc.pricePerShare)),
                _SumCell(
                    label: 'Available',
                    value: '${sc.availableShares}/${sc.totalShares}'),
                _SumCell(label: 'Holders', value: '${sc.totalInvestors}'),
              ],
            ),
            if (sc.propertyId > 0) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () =>
                      context.push('/property-financials/${sc.propertyId}'),
                  icon: const Icon(Icons.insights_outlined, size: 18),
                  label: const Text(
                      'View property financials & performance'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _openOrderSheet(String side) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _PlaceOrderSheet(
        side: side,
        shareClassId: widget.shareClassId,
        defaultPrice: side == 'BUY'
            ? (widget.shareClass?.bestAsk ?? widget.shareClass?.pricePerShare)
            : (widget.shareClass?.bestBid ?? widget.shareClass?.pricePerShare),
      ),
    );
    if (result == true) {
      ref.invalidate(orderBookProvider(widget.shareClassId));
      ref.invalidate(myOrdersProvider);
    }
  }

  Future<void> _openTransferSheet() async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _TransferSheet(
        shareClassId: widget.shareClassId,
        defaultPrice: widget.shareClass?.pricePerShare,
      ),
    );
    if (result == true) {
      ref.invalidate(myOrdersProvider);
    }
  }

  Future<void> _cancel(int orderId) async {
    try {
      await ref.read(marketplaceRepositoryProvider).cancelOrder(orderId);
      ref.invalidate(myOrdersProvider);
      ref.invalidate(orderBookProvider(widget.shareClassId));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Order cancelled.')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message)),
        );
      }
    }
  }
}

class _SumCell extends StatelessWidget {
  const _SumCell({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: const TextStyle(
                  fontSize: 11, color: AppColors.textSecondary)),
          const SizedBox(height: 2),
          Text(value,
              style: const TextStyle(
                  fontWeight: FontWeight.w700, fontSize: 14)),
        ],
      ),
    );
  }
}

class _OrderBookView extends StatelessWidget {
  const _OrderBookView({required this.book, required this.myOrderIds});
  final OrderBook book;
  final Set<int> myOrderIds;

  @override
  Widget build(BuildContext context) {
    // Sellers first (lowest price = best deal for a buyer), then buyers
    // (highest offer first).
    final sells = [...book.sellOrders]
      ..sort((a, b) => a.pricePerShare.compareTo(b.pricePerShare));
    final buys = [...book.buyOrders]
      ..sort((a, b) => b.pricePerShare.compareTo(a.pricePerShare));
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _BestChip(
                    label: 'Lowest sell price',
                    value: book.bestAsk,
                    color: AppColors.danger),
                if (book.spread != null)
                  Text('Gap ${Fmt.money(book.spread!)}',
                      style: const TextStyle(
                          fontSize: 11, color: AppColors.textSecondary)),
                _BestChip(
                    label: 'Highest buy offer',
                    value: book.bestBid,
                    color: AppColors.success),
              ],
            ),
            const Divider(height: 20),
            _OrderSection(
              heading: 'Shares for sale',
              subtitle: 'Sellers offering shares — lowest price first',
              emptyText: 'No shares are listed for sale yet.',
              color: AppColors.danger,
              orders: sells,
              myOrderIds: myOrderIds,
            ),
            const SizedBox(height: 16),
            _OrderSection(
              heading: 'Buyers',
              subtitle: 'Buy offers on the book — highest price first',
              emptyText: 'No buy offers yet.',
              color: AppColors.success,
              orders: buys,
              myOrderIds: myOrderIds,
            ),
          ],
        ),
      ),
    );
  }
}

class _BestChip extends StatelessWidget {
  const _BestChip({required this.label, required this.value, required this.color});
  final String label;
  final double? value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(label,
            style:
                const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        Text(value == null ? '—' : Fmt.money(value!),
            style: TextStyle(fontWeight: FontWeight.w700, color: color)),
      ],
    );
  }
}

/// Lists every resting order so a buyer/seller can see exactly WHO is trading,
/// HOW MANY shares, and AT WHAT price — their own orders are flagged "You" so
/// it is clear you cannot trade against yourself.
class _OrderSection extends StatelessWidget {
  const _OrderSection({
    required this.heading,
    required this.subtitle,
    required this.emptyText,
    required this.color,
    required this.orders,
    required this.myOrderIds,
  });
  final String heading;
  final String subtitle;
  final String emptyText;
  final Color color;
  final List<BookOrder> orders;
  final Set<int> myOrderIds;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
            Text(heading,
                style: TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 13, color: color)),
            const SizedBox(width: 6),
            Text('(${orders.length})',
                style: const TextStyle(
                    fontSize: 12, color: AppColors.textSecondary)),
          ],
        ),
        const SizedBox(height: 2),
        Text(subtitle,
            style: const TextStyle(
                fontSize: 10.5, color: AppColors.textSecondary)),
        const SizedBox(height: 8),
        if (orders.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Text(emptyText,
                style: const TextStyle(
                    fontSize: 12, color: AppColors.textSecondary)),
          )
        else ...[
          for (final o in orders.take(12))
            _BookOrderRow(order: o, mine: myOrderIds.contains(o.id)),
          if (orders.length > 12)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('+ ${orders.length - 12} more',
                  style: const TextStyle(
                      fontSize: 11, color: AppColors.textSecondary)),
            ),
        ],
      ],
    );
  }
}

class _BookOrderRow extends StatelessWidget {
  const _BookOrderRow({required this.order, required this.mine});
  final BookOrder order;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final who =
        mine ? 'You' : (order.investorCode ?? order.investorName ?? 'Investor');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(Icons.person_outline,
              size: 14,
              color: mine ? AppColors.goldDark : AppColors.textSecondary),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              who,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12,
                fontWeight: mine ? FontWeight.w700 : FontWeight.w600,
                color: mine ? AppColors.goldDark : AppColors.textPrimary,
              ),
            ),
          ),
          Text('${order.remainingQuantity} shares',
              style: const TextStyle(
                  fontSize: 12, color: AppColors.textSecondary)),
          const SizedBox(width: 10),
          Text('@ ${Fmt.money(order.pricePerShare)}',
              style:
                  const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _MyOrderTile extends StatelessWidget {
  const _MyOrderTile({required this.order, required this.onCancel});
  final MyOrder order;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final color = order.isBuy ? AppColors.success : AppColors.danger;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(order.side,
                  style: TextStyle(
                      fontSize: 11, fontWeight: FontWeight.w700, color: color)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${order.remaining}/${order.quantity} @ '
                      '${Fmt.money(order.pricePerShare)}',
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 13)),
                  Text('${order.propertyTitle} · ${order.statusLabel}',
                      style: const TextStyle(
                          fontSize: 11, color: AppColors.textSecondary)),
                ],
              ),
            ),
            if (order.canCancel)
              TextButton(
                onPressed: onCancel,
                child: const Text('Cancel'),
              ),
          ],
        ),
      ),
    );
  }
}

class _PlaceOrderSheet extends ConsumerStatefulWidget {
  const _PlaceOrderSheet({
    required this.side,
    required this.shareClassId,
    this.defaultPrice,
  });
  final String side;
  final int shareClassId;
  final double? defaultPrice;

  @override
  ConsumerState<_PlaceOrderSheet> createState() => _PlaceOrderSheetState();
}

class _PlaceOrderSheetState extends ConsumerState<_PlaceOrderSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _qty = TextEditingController();
  late final TextEditingController _price = TextEditingController(
      text: widget.defaultPrice == null
          ? ''
          : widget.defaultPrice!.toStringAsFixed(2));
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _qty.addListener(_onInputChanged);
    _price.addListener(_onInputChanged);
  }

  void _onInputChanged() => setState(() {});

  @override
  void dispose() {
    _qty.removeListener(_onInputChanged);
    _price.removeListener(_onInputChanged);
    _qty.dispose();
    _price.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final trades = await ref.read(marketplaceRepositoryProvider).placeOrder(
            shareClassId: widget.shareClassId,
            side: widget.side,
            quantity: int.parse(_qty.text.trim()),
            pricePerShare: double.parse(_price.text.trim()),
          );
      if (mounted) {
        Navigator.of(context).pop(true);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(trades > 0
                ? 'Order placed — $trades trade(s) executed.'
                : 'Order placed on the book.'),
          ),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message)),
        );
      }
    } catch (_) {
      if (mounted) {
        setState(() => _busy = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not place the order.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isBuy = widget.side == 'BUY';
    final qty = int.tryParse(_qty.text.trim()) ?? 0;
    final price = double.tryParse(_price.text.trim()) ?? 0;
    final walletBalance = isBuy
        ? ref.watch(myWalletProvider).valueOrNull?.balanceRands
        : null;
    // Client-side guard mirrors the server's pre-funding rule (value + 0.25%
    // STT). The server also adds any buyer platform fee and is authoritative.
    final estTotal = isBuy ? qty * price * 1.0025 : qty * price;
    final insufficient = isBuy &&
        walletBalance != null &&
        qty > 0 &&
        price > 0 &&
        estTotal > walletBalance + 0.001;
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${isBuy ? 'Buy' : 'Sell'} shares',
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 18)),
            const SizedBox(height: 4),
            const Text(
              'Requires an approved KYC profile (ID, proof of address & bank '
              'statement).',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
            if (isBuy) ...[
              const SizedBox(height: 4),
              const Text(
                'Buy orders must be pre-funded: your wallet has to cover the '
                'full cost before the order is placed, so the trade settles '
                'instantly on a match.',
                style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
              ),
            ],
            const SizedBox(height: 16),
            TextFormField(
              controller: _qty,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(
                labelText: 'Quantity (shares)',
                border: OutlineInputBorder(),
              ),
              validator: (v) {
                final n = int.tryParse((v ?? '').trim());
                if (n == null || n < 1) return 'Enter a whole number ≥ 1';
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _price,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Price per share (R)',
                border: OutlineInputBorder(),
              ),
              validator: (v) {
                final n = double.tryParse((v ?? '').trim());
                if (n == null || n < 0.01) return 'Enter a price ≥ R0.01';
                return null;
              },
            ),
            const SizedBox(height: 16),
            _OrderValuePanel(
              isBuy: isBuy,
              quantity: qty,
              pricePerShare: price,
              walletBalanceRands: walletBalance,
              insufficient: insufficient,
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: (_busy || insufficient) ? null : _submit,
                style: FilledButton.styleFrom(
                    backgroundColor:
                        isBuy ? AppColors.success : AppColors.danger),
                child: _busy
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : Text(isBuy
                        ? (insufficient
                            ? 'Top up wallet to buy'
                            : 'Place buy order')
                        : 'Place sell order'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Live order-value breakdown so buyers/sellers see exactly how many shares
/// they are trading and the rand value — plus the auto-settlement note.
class _OrderValuePanel extends StatelessWidget {
  const _OrderValuePanel({
    required this.isBuy,
    required this.quantity,
    required this.pricePerShare,
    this.walletBalanceRands,
    this.insufficient = false,
  });

  final bool isBuy;
  final int quantity;
  final double pricePerShare;
  final double? walletBalanceRands;
  final bool insufficient;

  // Securities Transfer Tax charged on share purchases in South Africa.
  static const double _sttRate = 0.0025;

  @override
  Widget build(BuildContext context) {
    final value = quantity * pricePerShare;
    final stt = isBuy ? value * _sttRate : 0.0;
    final total = isBuy ? value + stt : value;
    final ready = quantity > 0 && pricePerShare > 0;
    final shortfall = (walletBalanceRands != null)
        ? (total - walletBalanceRands!).clamp(0, double.infinity)
        : 0.0;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _kv('Shares', ready ? '$quantity' : '—'),
          _kv('Price per share', ready ? Fmt.money(pricePerShare) : '—'),
          _kv('Order value', ready ? Fmt.money(value) : '—', bold: true),
          if (isBuy)
            _kv('+ Securities Transfer Tax (0.25%)',
                ready ? Fmt.money(stt) : '—'),
          const Divider(height: 16),
          _kv(
            isBuy ? 'Total to pay' : 'You receive (before fee)',
            ready ? Fmt.money(total) : '—',
            bold: true,
            highlight: true,
          ),
          if (isBuy && walletBalanceRands != null) ...[
            const SizedBox(height: 4),
            _kv('Wallet balance', Fmt.money(walletBalanceRands!)),
          ],
          if (isBuy && insufficient && ready) ...[
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppColors.danger.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.account_balance_wallet_outlined,
                      size: 14, color: AppColors.danger),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Top up ${Fmt.money(shortfall.toDouble())} on the Wallet '
                      'page to place this order.',
                      style: const TextStyle(
                          fontSize: 11,
                          height: 1.35,
                          fontWeight: FontWeight.w600,
                          color: AppColors.danger),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.bolt, size: 13, color: AppColors.goldDark),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  isBuy
                      ? 'Your wallet is debited the moment a seller matches, so '
                            'the trade settles instantly and your share '
                            'certificate is issued automatically.'
                      : 'When a buyer matches, the shares transfer and your '
                            'wallet is credited automatically — no manual step.',
                  style: const TextStyle(
                    fontSize: 10,
                    color: AppColors.textSecondary,
                    height: 1.35,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _kv(String k, String v, {bool bold = false, bool highlight = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(
            child: Text(
              k,
              style: TextStyle(
                fontSize: 11,
                fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
                color: AppColors.textSecondary,
              ),
            ),
          ),
          const SizedBox(width: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerRight,
            child: Text(
              v,
              maxLines: 1,
              style: TextStyle(
                fontSize: bold ? 13 : 12,
                fontWeight: bold ? FontWeight.w700 : FontWeight.w600,
                color: highlight ? AppColors.goldDark : AppColors.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TransferSheet extends ConsumerStatefulWidget {
  const _TransferSheet({required this.shareClassId, this.defaultPrice});
  final int shareClassId;
  final double? defaultPrice;

  @override
  ConsumerState<_TransferSheet> createState() => _TransferSheetState();
}

class _TransferSheetState extends ConsumerState<_TransferSheet> {
  final _formKey = GlobalKey<FormState>();
  final _code = TextEditingController();
  final _shares = TextEditingController();
  late final TextEditingController _price = TextEditingController(
      text: widget.defaultPrice == null
          ? ''
          : widget.defaultPrice!.toStringAsFixed(2));
  bool _busy = false;
  Map<String, dynamic>? _investor;

  @override
  void dispose() {
    _code.dispose();
    _shares.dispose();
    _price.dispose();
    super.dispose();
  }

  Future<void> _lookup() async {
    final code = _code.text.trim();
    if (code.length < 3) return;
    setState(() => _busy = true);
    try {
      final inv =
          await ref.read(marketplaceRepositoryProvider).lookupInvestor(code);
      setState(() => _investor = inv.isEmpty ? null : inv);
      if (inv.isEmpty && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No investor found for that code.')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final inv = _investor;
    if (inv == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Look up a valid investor code first.')),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(marketplaceRepositoryProvider).transferShares(
            shareClassId: widget.shareClassId,
            toInvestorId: inv['id'] as int,
            shares: int.parse(_shares.text.trim()),
            pricePerShare: double.parse(_price.text.trim()),
          );
      if (mounted) {
        Navigator.of(context).pop(true);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Shares transferred.')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (_) {
      if (mounted) {
        setState(() => _busy = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not transfer the shares.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Transfer shares',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
            const SizedBox(height: 4),
            const Text(
              'Move shares you own directly to another investor by their '
              'investor code — for example a private sale, a gift or settling '
              'a deal outside the open market.',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.warning.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(8),
                border:
                    Border.all(color: AppColors.warning.withValues(alpha: 0.4)),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.warning_amber_rounded,
                      size: 16, color: AppColors.warning),
                  SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'This moves the shares immediately and cannot be '
                      'reversed. Payment settles off-platform — Investprop '
                      'does not process money between the two parties.',
                      style: TextStyle(
                          fontSize: 11,
                          height: 1.35,
                          color: AppColors.textSecondary),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _code,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(
                      labelText: 'Investor code',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: _busy ? null : _lookup,
                  child: const Text('Find'),
                ),
              ],
            ),
            if (_investor != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text('Recipient: ${_investor!['name']}',
                    style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.success)),
              ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _shares,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(
                labelText: 'Shares to transfer',
                border: OutlineInputBorder(),
              ),
              validator: (v) {
                final n = int.tryParse((v ?? '').trim());
                if (n == null || n < 1) return 'Enter a whole number ≥ 1';
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _price,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Price per share (R)',
                border: OutlineInputBorder(),
              ),
              validator: (v) {
                final n = double.tryParse((v ?? '').trim());
                if (n == null || n < 0) return 'Enter a valid price';
                return null;
              },
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Text('Transfer'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
