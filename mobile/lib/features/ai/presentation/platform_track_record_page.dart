import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/ai_repository.dart';
import '../domain/ai_models.dart';

/// Platform-wide delivery track record — builds investor trust.
class PlatformTrackRecordPage extends ConsumerWidget {
  const PlatformTrackRecordPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final record = ref.watch(platformTrackRecordProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Platform Track Record')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(platformTrackRecordProvider.future),
        child: AsyncValueView<PlatformTrackRecord>(
          value: record,
          onRetry: () => ref.invalidate(platformTrackRecordProvider),
          data: (r) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _hero(r),
              const SizedBox(height: 16),
              _grid(r),
              const SizedBox(height: 16),
              if (r.onTimePct != null || r.onBudgetPct != null)
                _delivery(r),
              const SizedBox(height: 16),
              Text(
                'Figures reflect all deals on the platform to date. Past '
                'performance is not a guarantee of future results.',
                style: const TextStyle(
                    fontSize: 11, color: AppColors.textSecondary),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _hero(PlatformTrackRecord r) {
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
          const Text('Capital raised',
              style: TextStyle(color: Colors.white70)),
          const SizedBox(height: 4),
          Text(Fmt.money(r.capitalRaised),
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 28,
                  fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _heroStat('Distributed to investors',
                    Fmt.money(r.totalDistributed)),
              ),
              Expanded(
                child: _heroStat('Investors', '${r.totalInvestors}'),
              ),
            ],
          ),
          if (r.since != null) ...[
            const SizedBox(height: 8),
            Text('Since ${Fmt.date(r.since)}',
                style: const TextStyle(color: Colors.white54, fontSize: 12)),
          ],
        ],
      ),
    );
  }

  Widget _heroStat(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value,
            style: const TextStyle(
                color: AppColors.gold,
                fontWeight: FontWeight.w700,
                fontSize: 16)),
        Text(label,
            style: const TextStyle(color: Colors.white70, fontSize: 11)),
      ],
    );
  }

  Widget _grid(PlatformTrackRecord r) {
    final tiles = [
      _StatTile(label: 'Total deals', value: '${r.totalDeals}'),
      _StatTile(
          label: 'Completed',
          value: '${r.completed}',
          color: AppColors.success),
      _StatTile(label: 'In progress', value: '${r.inProgress}'),
      _StatTile(label: 'Raising now', value: '${r.raising}'),
    ];
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 2.6,
      children: tiles,
    );
  }

  Widget _delivery(PlatformTrackRecord r) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Delivery reliability',
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 15)),
            Text('${r.milestonesTracked} milestones tracked',
                style: const TextStyle(
                    color: AppColors.textSecondary, fontSize: 12)),
            const SizedBox(height: 12),
            if (r.onTimePct != null)
              _bar('On-time completion', r.onTimePct!, AppColors.success),
            if (r.onBudgetPct != null) ...[
              const SizedBox(height: 12),
              _bar('On-budget delivery', r.onBudgetPct!, AppColors.navy),
            ],
          ],
        ),
      ),
    );
  }

  Widget _bar(String label, double pct, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(fontSize: 13)),
            Text('${pct.toStringAsFixed(0)}%',
                style: TextStyle(fontWeight: FontWeight.w700, color: color)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: (pct / 100).clamp(0, 1),
            minHeight: 8,
            backgroundColor: AppColors.border,
            valueColor: AlwaysStoppedAnimation(color),
          ),
        ),
      ],
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value, this.color});

  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(value,
              style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: color ?? AppColors.textPrimary)),
          Text(label,
              style: const TextStyle(
                  fontSize: 12, color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}
