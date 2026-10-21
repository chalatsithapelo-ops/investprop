import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../config/env.dart';
import '../../../config/theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/finance_repository.dart';
import '../domain/home_loan.dart';

/// Investor view of their multi-bank home-loan applications: progress tracker,
/// bank-offer comparison (accept the best) and withdraw.
class HomeLoanApplicationsPage extends ConsumerWidget {
  const HomeLoanApplicationsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final apps = ref.watch(myHomeLoanApplicationsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My home-loan applications')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myHomeLoanApplicationsProvider.future),
        child: AsyncValueView<List<HomeLoanApplication>>(
          value: apps,
          onRetry: () => ref.invalidate(myHomeLoanApplicationsProvider),
          data: (items) {
            if (items.isEmpty) {
              return ListView(
                children: [
                  const SizedBox(height: 100),
                  const EmptyState(
                    icon: Icons.account_balance_outlined,
                    title: 'No applications yet',
                    subtitle:
                        'Get prequalified, then apply to all the major banks '
                        'in one step.',
                  ),
                  const SizedBox(height: 16),
                  Center(
                    child: FilledButton.icon(
                      onPressed: () => context.push('/profile/prequalify'),
                      icon: const Icon(Icons.calculate_outlined),
                      label: const Text('Get prequalified'),
                    ),
                  ),
                ],
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              itemBuilder: (_, i) => _ApplicationCard(application: items[i]),
            );
          },
        ),
      ),
    );
  }
}

class _ApplicationCard extends ConsumerStatefulWidget {
  const _ApplicationCard({required this.application});

  final HomeLoanApplication application;

  @override
  ConsumerState<_ApplicationCard> createState() => _ApplicationCardState();
}

class _ApplicationCardState extends ConsumerState<_ApplicationCard> {
  bool _busy = false;

  HomeLoanApplication get app => widget.application;

  Future<void> _accept(int offerId) async {
    setState(() => _busy = true);
    try {
      await ref.read(financeRepositoryProvider).acceptOffer(offerId);
      ref.invalidate(myHomeLoanApplicationsProvider);
      _snack('Offer accepted.');
    } on ApiException catch (e) {
      _snack(e.message, error: true);
    } catch (_) {
      _snack('Could not accept the offer.', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _withdraw() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Withdraw application?'),
        content: const Text(
          'This cancels your application with the banks. You can always apply '
          'again later.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Keep it')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Withdraw'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await ref.read(financeRepositoryProvider).withdrawApplication(app.id);
      ref.invalidate(myHomeLoanApplicationsProvider);
      _snack('Application withdrawn.');
    } on ApiException catch (e) {
      _snack(e.message, error: true);
    } catch (_) {
      _snack('Could not withdraw the application.', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openDoc(String url) async {
    final full = url.startsWith('http') ? url : '${Env.apiBaseUrl}$url';
    final uri = Uri.parse(full);
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      _snack('Could not open the document.', error: true);
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
    final status = app.status;
    final offers = app.offers;
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        Fmt.money(app.requestedBondAmount),
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      Text(
                        'Applied ${Fmt.date(app.createdAt)}'
                        '${app.originatorName != null ? ' · ${app.originatorName}' : ''}',
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: status.color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    status.label,
                    style: TextStyle(
                        color: status.color,
                        fontWeight: FontWeight.w700,
                        fontSize: 12),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _StatusTracker(status: status),
            const SizedBox(height: 8),
            Text(
              app.statusNote ?? status.description,
              style:
                  const TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
            if (offers.isNotEmpty) ...[
              const Divider(height: 28),
              const Text(
                'Bank offers',
                style: TextStyle(
                    fontWeight: FontWeight.w700, color: AppColors.textPrimary),
              ),
              const SizedBox(height: 8),
              ...offers.map((o) => _OfferTile(
                    offer: o,
                    busy: _busy,
                    canAccept: app.isOpen &&
                        o.status == HomeLoanOfferStatus.offered,
                    onAccept: () => _accept(o.id),
                  )),
            ],
            if (app.documents.isNotEmpty) ...[
              const Divider(height: 28),
              const Text(
                'Submitted documents',
                style: TextStyle(
                    fontWeight: FontWeight.w700, color: AppColors.textPrimary),
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: app.documents
                    .map((d) => ActionChip(
                          avatar: const Icon(Icons.description_outlined,
                              size: 16),
                          label: Text(d.docType.label,
                              style: const TextStyle(fontSize: 12)),
                          onPressed: () => _openDoc(d.fileUrl),
                        ))
                    .toList(),
              ),
            ],
            if (app.isOpen) ...[
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: _busy ? null : _withdraw,
                  style: TextButton.styleFrom(
                      foregroundColor: AppColors.danger),
                  icon: const Icon(Icons.cancel_outlined, size: 18),
                  label: const Text('Withdraw'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatusTracker extends StatelessWidget {
  const _StatusTracker({required this.status});

  final HomeLoanStatus status;

  @override
  Widget build(BuildContext context) {
    // Withdrawn / declined applications never reached the happy path.
    final terminated = status == HomeLoanStatus.withdrawn ||
        status == HomeLoanStatus.declined;
    final currentIndex = HomeLoanStatusX.flow.indexOf(status);
    final steps = HomeLoanStatusX.flow;

    return Row(
      children: List.generate(steps.length * 2 - 1, (i) {
        if (i.isOdd) {
          final done = !terminated && (i ~/ 2) < currentIndex;
          return Expanded(
            child: Container(
              height: 2,
              color: done ? AppColors.success : AppColors.border,
            ),
          );
        }
        final index = i ~/ 2;
        final reached = !terminated && index <= currentIndex && currentIndex >= 0;
        return _Dot(reached: reached, label: steps[index].label);
      }),
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot({required this.reached, required this.label});

  final bool reached;
  final String label;

  @override
  Widget build(BuildContext context) {
    final color = reached ? AppColors.success : AppColors.border;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          height: 22,
          width: 22,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          child: Icon(
            reached ? Icons.check : Icons.circle,
            size: reached ? 14 : 8,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 4),
        SizedBox(
          width: 62,
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 10,
              color: reached ? AppColors.textPrimary : AppColors.textSecondary,
              fontWeight: reached ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
        ),
      ],
    );
  }
}

class _OfferTile extends StatelessWidget {
  const _OfferTile({
    required this.offer,
    required this.busy,
    required this.canAccept,
    required this.onAccept,
  });

  final HomeLoanOffer offer;
  final bool busy;
  final bool canAccept;
  final VoidCallback onAccept;

  @override
  Widget build(BuildContext context) {
    final accepted = offer.status == HomeLoanOfferStatus.accepted;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: accepted
            ? AppColors.success.withValues(alpha: 0.06)
            : AppColors.background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: accepted ? AppColors.success : AppColors.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  offer.bankName,
                  style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                      color: AppColors.textPrimary),
                ),
              ),
              Text(
                Fmt.percent(offer.annualInterestRate, decimals: 2),
                style: const TextStyle(
                    fontWeight: FontWeight.w700, color: AppColors.navy),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '${Fmt.money(offer.monthlyInstalment)} /mo · '
            '${Fmt.money(offer.approvedAmount)} approved · '
            '${offer.loanTermYears} yrs',
            style:
                const TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
          if (accepted) ...[
            const SizedBox(height: 8),
            Row(
              children: const [
                Icon(Icons.check_circle,
                    size: 16, color: AppColors.success),
                SizedBox(width: 4),
                Text('You accepted this offer',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.success)),
              ],
            ),
          ] else if (canAccept) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: busy ? null : onAccept,
                child: const Text('Accept this offer'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
