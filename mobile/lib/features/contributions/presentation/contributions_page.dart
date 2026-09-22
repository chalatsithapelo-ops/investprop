import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/contributions_repository.dart';
import '../domain/contribution.dart';

class ContributionsPage extends ConsumerWidget {
  const ContributionsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(contributionsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My Contributions')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(contributionsProvider.future),
        child: AsyncValueView<ContributionsResult>(
          value: result,
          onRetry: () => ref.invalidate(contributionsProvider),
          data: (r) {
            if (r.contributions.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 120),
                  EmptyState(
                    icon: Icons.receipt_long_outlined,
                    title: 'No contributions yet',
                    subtitle:
                        'Your investment commitments will appear here with '
                        'their status and available actions.',
                  ),
                ],
              );
            }
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _SummaryCard(summary: r.summary),
                const SizedBox(height: 16),
                ...r.contributions
                    .map((c) => _ContributionCard(contribution: c)),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.summary});

  final ContributionsSummary summary;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.navy, AppColors.navyLight],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Total contributed',
              style: TextStyle(color: Colors.white70)),
          const SizedBox(height: 4),
          Text(Fmt.money(summary.totalContributions),
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 26,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _MiniStat(
                  label: 'Properties',
                  value: '${summary.totalProperties}',
                ),
              ),
              Expanded(
                child: _MiniStat(
                  label: 'Expected returns',
                  value: Fmt.money(summary.totalExpectedReturns),
                ),
              ),
              Expanded(
                child: _MiniStat(
                  label: 'Avg rate',
                  value: Fmt.percent(summary.averageReturnRate),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value,
            style: const TextStyle(
                color: AppColors.gold,
                fontWeight: FontWeight.w700,
                fontSize: 15)),
        Text(label,
            style: const TextStyle(color: Colors.white70, fontSize: 11)),
      ],
    );
  }
}

class _ContributionCard extends ConsumerStatefulWidget {
  const _ContributionCard({required this.contribution});

  final Contribution contribution;

  @override
  ConsumerState<_ContributionCard> createState() => _ContributionCardState();
}

class _ContributionCardState extends ConsumerState<_ContributionCard> {
  bool _busy = false;

  Color _statusColor(String status) {
    switch (status) {
      case 'PAID':
      case 'APPROVED':
        return AppColors.success;
      case 'PENDING':
        return AppColors.warning;
      case 'CANCELLED':
      case 'REJECTED':
        return AppColors.danger;
      case 'REFUND_REQUESTED':
        return AppColors.gold;
      default:
        return AppColors.textSecondary;
    }
  }

  Future<void> _cancel() async {
    final reason = await _promptReason(
      title: 'Cancel contribution',
      message:
          'You are within the 5-day cooling-off window. Cancelling will '
          'reverse this commitment. Optionally tell us why.',
      confirmLabel: 'Cancel contribution',
      minLength: 0,
    );
    if (reason == null) return;
    setState(() => _busy = true);
    try {
      await ref.read(contributionsRepositoryProvider).cancelDuringCoolingOff(
            contributionId: widget.contribution.id,
            reason: reason.isEmpty ? null : reason,
          );
      ref.invalidate(contributionsProvider);
      _toast('Contribution cancelled');
    } catch (e) {
      _toast('$e'.replaceFirst('ApiException: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _refund() async {
    final reason = await _promptReason(
      title: 'Request refund',
      message:
          'Please provide a reason (at least 10 characters). An administrator '
          'will review your request.',
      confirmLabel: 'Submit request',
      minLength: 10,
    );
    if (reason == null) return;
    setState(() => _busy = true);
    try {
      await ref.read(contributionsRepositoryProvider).requestRefund(
            contributionId: widget.contribution.id,
            reason: reason,
          );
      ref.invalidate(contributionsProvider);
      _toast('Refund request submitted');
    } catch (e) {
      _toast('$e'.replaceFirst('ApiException: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<String?> _promptReason({
    required String title,
    required String message,
    required String confirmLabel,
    required int minLength,
  }) {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) {
        String? error;
        return StatefulBuilder(
          builder: (ctx, setLocal) => AlertDialog(
            title: Text(title),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(message,
                    style: const TextStyle(
                        fontSize: 13, color: AppColors.textSecondary)),
                const SizedBox(height: 12),
                TextField(
                  controller: controller,
                  maxLines: 3,
                  decoration: InputDecoration(
                    hintText: 'Reason',
                    errorText: error,
                    border: const OutlineInputBorder(),
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Back'),
              ),
              FilledButton(
                onPressed: () {
                  final text = controller.text.trim();
                  if (text.length < minLength) {
                    setLocal(() => error =
                        'Please enter at least $minLength characters');
                    return;
                  }
                  Navigator.pop(ctx, text);
                },
                child: Text(confirmLabel),
              ),
            ],
          ),
        );
      },
    );
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _submitPop() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () => Navigator.of(ctx).pop(ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.of(ctx).pop(ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;

    ImagePicker picker = ImagePicker();
    final file = await picker.pickImage(
      source: source,
      maxWidth: 2400,
      imageQuality: 85,
    );
    if (file == null) return;
    final bytes = await file.readAsBytes();
    if (bytes.length > 5 * 1024 * 1024) {
      _toast('Images must be 5 MB or smaller.');
      return;
    }
    final ext = file.name.contains('.')
        ? file.name.split('.').last.toLowerCase()
        : 'jpg';
    final mime = file.mimeType ?? _mimeForExt(ext);

    final reference = await _promptReference();
    if (reference == null) return; // cancelled

    setState(() => _busy = true);
    try {
      final repo = ref.read(contributionsRepositoryProvider);
      final url = await repo.uploadFile(
        fileName: file.name,
        fileType: mime,
        base64: base64Encode(bytes),
      );
      await repo.submitProofOfPayment(
        contributionId: widget.contribution.id,
        proofOfPaymentUrl: url,
        paymentReference: reference.isEmpty ? null : reference,
      );
      ref.invalidate(contributionsProvider);
      _toast('Proof of payment submitted');
    } catch (e) {
      _toast('$e'.replaceFirst('ApiException: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _mimeForExt(String ext) {
    switch (ext) {
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      default:
        return 'image/jpeg';
    }
  }

  Future<String?> _promptReference() {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Payment reference'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            hintText: 'e.g. EFT reference (optional)',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Submit'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.contribution;
    final remaining = c.coolingOffRemaining;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(c.propertyTitle,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 16)),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: _statusColor(c.status).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(c.statusLabel,
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: _statusColor(c.status))),
                ),
              ],
            ),
            const SizedBox(height: 10),
            _kv('Amount', Fmt.money(c.contributionAmount)),
            _kv('Shares', '${c.numberOfShares} @ ${Fmt.money(c.sharePrice)}'),
            _kv('Ownership', Fmt.percent(c.ownershipPercentage)),
            _kv('Expected return',
                '${Fmt.money(c.expectedReturnAmount)} (${Fmt.percent(c.expectedReturnRate)})'),
            _kv('Date', Fmt.date(c.contributionDate)),
            if (c.paymentReference.isNotEmpty)
              _kv('Reference', c.paymentReference),
            if (remaining != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.gold.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.timelapse,
                        size: 16, color: AppColors.goldDark),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Cooling-off ends in ${_formatDuration(remaining)}',
                        style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.goldDark,
                            fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            if (c.canSubmitPop) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _busy ? null : _submitPop,
                  icon: const Icon(Icons.upload_file),
                  label: const Text('Submit proof of payment'),
                ),
              ),
            ] else if (c.paymentStatus == 'POP_SUBMITTED') ...[
              const SizedBox(height: 10),
              const Row(
                children: [
                  Icon(Icons.hourglass_top,
                      size: 16, color: AppColors.warning),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text('Proof of payment under review',
                        style: TextStyle(
                            fontSize: 12,
                            color: AppColors.warning,
                            fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
            ],
            if (c.canCancel || c.canRequestRefund) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  if (c.canCancel)
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _busy ? null : _cancel,
                        style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.danger,
                            side: const BorderSide(color: AppColors.danger)),
                        child: const Text('Cancel'),
                      ),
                    ),
                  if (c.canCancel && c.canRequestRefund)
                    const SizedBox(width: 8),
                  if (c.canRequestRefund)
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _busy ? null : _refund,
                        child: const Text('Request refund'),
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

  Widget _kv(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label,
                style: const TextStyle(
                    color: AppColors.textSecondary, fontSize: 13)),
            Text(value,
                style: const TextStyle(
                    fontWeight: FontWeight.w600, fontSize: 13)),
          ],
        ),
      );

  String _formatDuration(Duration d) {
    if (d.inDays >= 1) {
      return '${d.inDays}d ${d.inHours % 24}h';
    }
    if (d.inHours >= 1) {
      return '${d.inHours}h ${d.inMinutes % 60}m';
    }
    return '${d.inMinutes}m';
  }
}
