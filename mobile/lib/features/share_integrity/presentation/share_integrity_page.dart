import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../../auth/application/auth_controller.dart';
import '../data/share_integrity_repository.dart';
import '../domain/share_integrity_models.dart';

/// Share integrity: investors see each holding traced back to its property/SPV
/// with valuation and provenance; managers can additionally run the supply
/// conservation audit that proves no duplicate or phantom shares exist.
class ShareIntegrityPage extends ConsumerStatefulWidget {
  const ShareIntegrityPage({super.key});

  @override
  ConsumerState<ShareIntegrityPage> createState() => _ShareIntegrityPageState();
}

class _ShareIntegrityPageState extends ConsumerState<ShareIntegrityPage> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final isManager = ref.watch(authControllerProvider).user?.isManager == true;

    return Scaffold(
      appBar: AppBar(title: const Text('Share Integrity')),
      body: Column(
        children: [
          if (isManager)
            Padding(
              padding: const EdgeInsets.all(12),
              child: SegmentedButton<int>(
                segments: const [
                  ButtonSegment(value: 0, label: Text('My shares')),
                  ButtonSegment(value: 1, label: Text('Audit')),
                ],
                selected: {_tab},
                onSelectionChanged: (s) => setState(() => _tab = s.first),
              ),
            ),
          Expanded(
            child: _tab == 0 ? const _ProvenanceView() : const _AuditView(),
          ),
        ],
      ),
    );
  }
}

class _ProvenanceView extends ConsumerWidget {
  const _ProvenanceView();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final provenance = ref.watch(myProvenanceProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(myProvenanceProvider),
      child: AsyncValueView<ShareProvenance>(
        value: provenance,
        onRetry: () => ref.invalidate(myProvenanceProvider),
        data: (p) {
          if (p.holdings.isEmpty) {
            return ListView(
              children: const [
                SizedBox(height: 120),
                EmptyState(
                  icon: Icons.verified_outlined,
                  title: 'No shareholdings yet',
                  subtitle:
                      'Once you own shares, each holding will be traced back '
                      'to its property and SPV here.',
                ),
              ],
            );
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _ProvenanceSummary(provenance: p),
              const SizedBox(height: 16),
              ...p.holdings.map((h) => _ProvenanceCard(holding: h)),
            ],
          );
        },
      ),
    );
  }
}

class _ProvenanceSummary extends StatelessWidget {
  const _ProvenanceSummary({required this.provenance});

  final ShareProvenance provenance;

  @override
  Widget build(BuildContext context) {
    final up = provenance.totalGain >= 0;
    return Card(
      color: AppColors.navy,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Portfolio value',
              style: TextStyle(color: Colors.white70, fontSize: 13),
            ),
            const SizedBox(height: 4),
            Text(
              Fmt.money(provenance.totalCurrentValue, detailed: true),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 28,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Invested ${Fmt.money(provenance.totalInvested, detailed: true)} · '
              '${up ? '+' : ''}${Fmt.money(provenance.totalGain, detailed: true)} '
              '${up ? 'gain' : 'loss'} · ${provenance.holdingCount} holding(s)',
              style: TextStyle(
                color: up ? AppColors.gold : Colors.redAccent.shade100,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProvenanceCard extends StatelessWidget {
  const _ProvenanceCard({required this.holding});

  final ProvenanceHolding holding;

  @override
  Widget build(BuildContext context) {
    final up = holding.isUp;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              holding.propertyTitle,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              '${holding.shareClassName}'
              '${holding.propertyCity.isNotEmpty ? ' · ${holding.propertyCity}' : ''}',
              style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 10),
            // Provenance chain: Property -> SPV -> Shares
            _ChainRow(
              icon: Icons.apartment,
              label: 'Property',
              value: holding.propertyTitle,
            ),
            _ChainRow(
              icon: Icons.account_tree_outlined,
              label: 'SPV',
              value: holding.spvName == null
                  ? 'Not linked to an SPV'
                  : '${holding.spvName}'
                        '${holding.spvRegistration != null ? ' (${holding.spvRegistration})' : ''}',
              muted: holding.spvName == null,
            ),
            _ChainRow(
              icon: Icons.pie_chart_outline,
              label: 'Holding',
              value:
                  '${holding.sharesOwned} shares · '
                  '${Fmt.percent(holding.ownershipPercentage, decimals: 2)} of class',
            ),
            const Divider(height: 24),
            Row(
              children: [
                Expanded(
                  child: _Metric(
                    label: 'Invested',
                    value: Fmt.money(holding.investedAmount, detailed: true),
                  ),
                ),
                Expanded(
                  child: _Metric(
                    label: 'Current value',
                    value: Fmt.money(holding.currentValue, detailed: true),
                  ),
                ),
                Expanded(
                  child: _Metric(
                    label: up ? 'Gain' : 'Loss',
                    value:
                        '${up ? '+' : ''}${Fmt.money(holding.unrealizedGain, detailed: true)}',
                    color: up ? AppColors.success : AppColors.danger,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Valued at ${Fmt.money(holding.valuationPerShare, detailed: true)}/share '
              '(${holding.valuationSourceLabel})',
              style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 11,
              ),
            ),
            if (holding.acquiredBySource.isNotEmpty) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: holding.acquiredBySource.entries
                    .map((e) => _SourceChip(type: e.key, shares: e.value))
                    .toList(),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ChainRow extends StatelessWidget {
  const _ChainRow({
    required this.icon,
    required this.label,
    required this.value,
    this.muted = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: AppColors.navy),
          const SizedBox(width: 10),
          SizedBox(
            width: 64,
            child: Text(
              label,
              style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 12,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                fontStyle: muted ? FontStyle.italic : FontStyle.normal,
                color: muted ? AppColors.textSecondary : AppColors.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value, this.color});

  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label,
        style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
      ),
      const SizedBox(height: 2),
      Text(
        value,
        style: TextStyle(
          fontWeight: FontWeight.w700,
          color: color ?? AppColors.textPrimary,
          fontSize: 13,
        ),
      ),
    ],
  );
}

class _SourceChip extends StatelessWidget {
  const _SourceChip({required this.type, required this.shares});

  final String type;
  final int shares;

  String get _label {
    final pretty = type
        .split('_')
        .map((w) => w.isEmpty ? w : w[0] + w.substring(1).toLowerCase())
        .join(' ');
    return '$pretty: $shares';
  }

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: AppColors.gold.withValues(alpha: 0.14),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Text(
      _label,
      style: const TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: AppColors.goldDark,
      ),
    ),
  );
}

class _AuditView extends ConsumerWidget {
  const _AuditView();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final audit = ref.watch(conservationAuditProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(conservationAuditProvider),
      child: AsyncValueView<ShareAudit>(
        value: audit,
        onRetry: () => ref.invalidate(conservationAuditProvider),
        data: (a) {
          if (a.classes.isEmpty) {
            return ListView(
              children: const [
                SizedBox(height: 120),
                EmptyState(
                  icon: Icons.fact_check_outlined,
                  title: 'No share classes to audit',
                  subtitle: 'Tokenised share classes will be audited here.',
                ),
              ],
            );
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _AuditBanner(balanced: a.overallBalanced, count: a.classCount),
              const SizedBox(height: 16),
              ...a.classes.map((c) => _AuditCard(audit: c)),
            ],
          );
        },
      ),
    );
  }
}

class _AuditBanner extends StatelessWidget {
  const _AuditBanner({required this.balanced, required this.count});

  final bool balanced;
  final int count;

  @override
  Widget build(BuildContext context) {
    final color = balanced ? AppColors.success : AppColors.danger;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Icon(
            balanced ? Icons.verified : Icons.error_outline,
            color: color,
            size: 28,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  balanced
                      ? 'All share classes balanced'
                      : 'Discrepancies detected',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: color,
                    fontSize: 15,
                  ),
                ),
                Text(
                  balanced
                      ? '$count class(es) reconcile — no duplicate or phantom shares.'
                      : 'One or more classes do not reconcile against the ledger. Review below.',
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AuditCard extends StatelessWidget {
  const _AuditCard({required this.audit});

  final ShareClassAudit audit;

  @override
  Widget build(BuildContext context) {
    final ok = audit.balanced;
    final color = ok ? AppColors.success : AppColors.danger;
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        audit.propertyTitle,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      Text(
                        '${audit.shareClassName}'
                        '${audit.spvName != null ? ' · ${audit.spvName}' : ''}',
                        style: const TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(ok ? Icons.check_circle : Icons.cancel, color: color),
              ],
            ),
            const Divider(height: 24),
            _AuditRow(label: 'Total shares', value: '${audit.totalShares}'),
            _AuditRow(label: 'Issued', value: '${audit.issued}'),
            _AuditRow(label: 'Available', value: '${audit.available}'),
            _AuditRow(
              label: 'Reserved in trades',
              value: '${audit.reservedInSettlements}',
            ),
            _AuditRow(label: 'Holders', value: '${audit.holders}'),
            _AuditRow(
              label: 'Valuation / share',
              value: Fmt.money(audit.valuationPerShare, detailed: true),
            ),
            _AuditRow(label: 'Market cap', value: Fmt.money(audit.marketCap)),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                _Flag(
                  label: audit.overIssued ? 'Over-issued' : 'Supply OK',
                  ok: !audit.overIssued,
                ),
                _Flag(
                  label: audit.ledgerBalanced
                      ? 'Ledger balanced'
                      : 'Ledger mismatch',
                  ok: audit.ledgerBalanced,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AuditRow extends StatelessWidget {
  const _AuditRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: AppColors.textSecondary)),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
      ],
    ),
  );
}

class _Flag extends StatelessWidget {
  const _Flag({required this.label, required this.ok});

  final String label;
  final bool ok;

  @override
  Widget build(BuildContext context) {
    final color = ok ? AppColors.success : AppColors.danger;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(ok ? Icons.check : Icons.close, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.w600,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}
