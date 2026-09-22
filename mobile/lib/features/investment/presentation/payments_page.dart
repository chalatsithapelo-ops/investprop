import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../config/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/investment_repository.dart';
import '../domain/contribution.dart';

/// Approved contributions awaiting payment. Investors pay via the Paystack
/// checkout (opened in the browser) and then verify the transaction here.
class PaymentsPage extends ConsumerWidget {
  const PaymentsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final payments = ref.watch(awaitingPaymentProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Payments due')),
      body: AsyncValueView(
        value: payments,
        onRetry: () => ref.invalidate(awaitingPaymentProvider),
        data: (items) {
          if (items.isEmpty) {
            return const EmptyState(
              icon: Icons.check_circle_outline,
              title: 'Nothing to pay',
              subtitle:
                  'When a proposal is approved it will appear here for payment.',
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(awaitingPaymentProvider),
            child: ListView.separated(
              padding: const EdgeInsets.all(20),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 14),
              itemBuilder: (_, i) => _PaymentCard(contribution: items[i]),
            ),
          );
        },
      ),
    );
  }
}

class _PaymentCard extends ConsumerStatefulWidget {
  const _PaymentCard({required this.contribution});

  final Contribution contribution;

  @override
  ConsumerState<_PaymentCard> createState() => _PaymentCardState();
}

class _PaymentCardState extends ConsumerState<_PaymentCard> {
  bool _busy = false;
  String? _reference;

  Contribution get _c => widget.contribution;

  Future<void> _payNow() async {
    setState(() => _busy = true);
    try {
      final init = await ref
          .read(investmentRepositoryProvider)
          .initiatePayment(contributionId: _c.id);
      final uri = Uri.parse(init.authorizationUrl);
      final launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!launched) {
        _snack('Could not open the payment page.', error: true);
      } else if (mounted) {
        setState(() => _reference = init.reference);
      }
    } on ApiException catch (e) {
      _snack(e.message, error: true);
    } catch (_) {
      _snack('Could not start the payment. Please try again.', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    final ref0 = _reference;
    if (ref0 == null) return;
    setState(() => _busy = true);
    try {
      final ok = await ref
          .read(investmentRepositoryProvider)
          .verifyPayment(contributionId: _c.id, reference: ref0);
      if (!mounted) return;
      if (ok) {
        _snack('Payment confirmed. Your share certificate is on its way.');
        ref.invalidate(awaitingPaymentProvider);
      } else {
        _snack(
          'We could not confirm your payment yet. If you completed it, try '
          'again in a moment.',
          error: true,
        );
      }
    } on ApiException catch (e) {
      _snack(e.message, error: true);
    } catch (_) {
      _snack('Verification failed. Please try again.', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _snack(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? AppColors.danger : AppColors.success,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final started = _reference != null;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _c.propertyTitle,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              _c.numberOfShares > 0
                  ? '${_c.numberOfShares} shares · ${Fmt.percent(_c.ownershipPercentage, decimals: 2)}'
                  : 'Approved',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Amount due',
                    style: TextStyle(color: AppColors.textSecondary)),
                Text(
                  Fmt.money(_c.contributionAmount),
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (!started)
              ElevatedButton.icon(
                onPressed: _busy ? null : _payNow,
                icon: _busy
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.lock_outline, size: 18),
                label: const Text('Pay securely'),
              )
            else ...[
              const Row(
                children: [
                  Icon(Icons.open_in_new, size: 16, color: AppColors.textSecondary),
                  SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Complete the payment in your browser, then confirm below.',
                      style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy ? null : _payNow,
                      child: const Text('Reopen'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _busy ? null : _verify,
                      child: _busy
                          ? const SizedBox(
                              height: 18,
                              width: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text("I've paid"),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
