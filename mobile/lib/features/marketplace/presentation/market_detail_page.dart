import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
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
              data: (b) => _OrderBookView(book: b),
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
  const _OrderBookView({required this.book});
  final OrderBook book;

  @override
  Widget build(BuildContext context) {
    final buys = [...book.buyLevels]..sort((a, b) => b.price.compareTo(a.price));
    final sells = [...book.sellLevels]
      ..sort((a, b) => a.price.compareTo(b.price));
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _BestChip(
                    label: 'Best bid',
                    value: book.bestBid,
                    color: AppColors.success),
                if (book.spread != null)
                  Text('Spread ${Fmt.money(book.spread!)}',
                      style: const TextStyle(
                          fontSize: 11, color: AppColors.textSecondary)),
                _BestChip(
                    label: 'Best ask',
                    value: book.bestAsk,
                    color: AppColors.danger),
              ],
            ),
            const Divider(height: 20),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: _LevelColumn(
                    heading: 'Bids',
                    color: AppColors.success,
                    levels: buys,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _LevelColumn(
                    heading: 'Asks',
                    color: AppColors.danger,
                    levels: sells,
                  ),
                ),
              ],
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

class _LevelColumn extends StatelessWidget {
  const _LevelColumn({
    required this.heading,
    required this.color,
    required this.levels,
  });
  final String heading;
  final Color color;
  final List<OrderLevel> levels;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(heading,
            style: TextStyle(
                fontWeight: FontWeight.w700, fontSize: 12, color: color)),
        const SizedBox(height: 6),
        if (levels.isEmpty)
          const Text('—',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary))
        else
          for (final l in levels.take(6))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(Fmt.money(l.price),
                      style: const TextStyle(fontSize: 12)),
                  Text('${l.quantity}',
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.textSecondary)),
                ],
              ),
            ),
      ],
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
  void dispose() {
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
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _busy ? null : _submit,
                style: FilledButton.styleFrom(
                    backgroundColor:
                        isBuy ? AppColors.success : AppColors.danger),
                child: _busy
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : Text(isBuy ? 'Place buy order' : 'Place sell order'),
              ),
            ),
          ],
        ),
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
