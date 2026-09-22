import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../../contributions/data/contributions_repository.dart';
import '../../contributions/domain/contribution.dart';

class MetricsPage extends ConsumerWidget {
  const MetricsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(contributionsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Portfolio Metrics')),
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
                    icon: Icons.insights_outlined,
                    title: 'No data to chart yet',
                    subtitle:
                        'Once you invest, analytics on allocation and returns '
                        'will appear here.',
                  ),
                ],
              );
            }
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _kpiRow(r),
                const SizedBox(height: 20),
                _AllocationCard(contributions: r.contributions),
                const SizedBox(height: 20),
                _PerPropertyCard(contributions: r.contributions),
                const SizedBox(height: 20),
                _ReturnsCard(summary: r.summary),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _kpiRow(ContributionsResult r) {
    return Row(
      children: [
        Expanded(
          child: _KpiTile(
            label: 'Invested',
            value: Fmt.compactMoney(r.summary.totalContributions),
            color: AppColors.navy,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _KpiTile(
            label: 'Expected payout',
            value: Fmt.compactMoney(r.summary.totalExpectedPayout),
            color: AppColors.success,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _KpiTile(
            label: 'Avg rate',
            value: Fmt.percent(r.summary.averageReturnRate),
            color: AppColors.goldDark,
          ),
        ),
      ],
    );
  }
}

class _KpiTile extends StatelessWidget {
  const _KpiTile({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

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
        children: [
          Text(value,
              style: TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w800, color: color)),
          const SizedBox(height: 2),
          Text(label,
              style: const TextStyle(
                  fontSize: 11, color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}

class _ChartCard extends StatelessWidget {
  const _ChartCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 15)),
            const SizedBox(height: 16),
            child,
          ],
        ),
      ),
    );
  }
}

class _AllocationCard extends StatelessWidget {
  const _AllocationCard({required this.contributions});

  final List<Contribution> contributions;

  static const _typeColors = {
    'flip': AppColors.gold,
    'rental': AppColors.success,
    'development': AppColors.navyLight,
  };

  String _typeLabel(String t) {
    switch (t) {
      case 'flip':
        return 'Flips';
      case 'rental':
        return 'Rentals';
      case 'development':
        return 'Developments';
      default:
        return 'Other';
    }
  }

  @override
  Widget build(BuildContext context) {
    final Map<String, double> byType = {};
    for (final c in contributions) {
      final key = c.propertyType.isEmpty ? 'other' : c.propertyType;
      byType[key] = (byType[key] ?? 0) + c.contributionAmount;
    }
    final total = byType.values.fold<double>(0, (a, b) => a + b);
    final entries = byType.entries.toList();

    return _ChartCard(
      title: 'Allocation by type',
      child: Row(
        children: [
          SizedBox(
            width: 130,
            height: 130,
            child: PieChart(
              PieChartData(
                sectionsSpace: 2,
                centerSpaceRadius: 34,
                sections: [
                  for (final e in entries)
                    PieChartSectionData(
                      value: e.value,
                      color: _typeColors[e.key] ?? AppColors.textSecondary,
                      title: total > 0
                          ? '${(e.value / total * 100).round()}%'
                          : '',
                      radius: 28,
                      titleStyle: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Colors.white),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final e in entries)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        Container(
                          width: 12,
                          height: 12,
                          decoration: BoxDecoration(
                            color: _typeColors[e.key] ??
                                AppColors.textSecondary,
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(_typeLabel(e.key),
                              style: const TextStyle(fontSize: 13)),
                        ),
                        Text(Fmt.compactMoney(e.value),
                            style: const TextStyle(
                                fontSize: 13, fontWeight: FontWeight.w600)),
                      ],
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

class _PerPropertyCard extends StatelessWidget {
  const _PerPropertyCard({required this.contributions});

  final List<Contribution> contributions;

  @override
  Widget build(BuildContext context) {
    final items = contributions.take(6).toList();
    final maxVal = items.isEmpty
        ? 1.0
        : items
            .map((c) => c.contributionAmount)
            .reduce((a, b) => a > b ? a : b);

    return _ChartCard(
      title: 'Invested per property',
      child: SizedBox(
        height: 200,
        child: BarChart(
          BarChartData(
            alignment: BarChartAlignment.spaceAround,
            maxY: maxVal * 1.2,
            barTouchData: BarTouchData(
              touchTooltipData: BarTouchTooltipData(
                getTooltipItem: (group, _, rod, __) => BarTooltipItem(
                  Fmt.compactMoney(rod.toY),
                  const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                      fontSize: 11),
                ),
              ),
            ),
            titlesData: FlTitlesData(
              leftTitles:
                  const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              topTitles:
                  const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              rightTitles:
                  const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              bottomTitles: AxisTitles(
                sideTitles: SideTitles(
                  showTitles: true,
                  reservedSize: 28,
                  getTitlesWidget: (value, meta) {
                    final i = value.toInt();
                    if (i < 0 || i >= items.length) {
                      return const SizedBox.shrink();
                    }
                    final title = items[i].propertyTitle;
                    return Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        title.length > 6 ? '${title.substring(0, 6)}…' : title,
                        style: const TextStyle(
                            fontSize: 10, color: AppColors.textSecondary),
                      ),
                    );
                  },
                ),
              ),
            ),
            gridData: const FlGridData(show: false),
            borderData: FlBorderData(show: false),
            barGroups: [
              for (var i = 0; i < items.length; i++)
                BarChartGroupData(
                  x: i,
                  barRods: [
                    BarChartRodData(
                      toY: items[i].contributionAmount,
                      color: AppColors.navy,
                      width: 18,
                      borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(4)),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReturnsCard extends StatelessWidget {
  const _ReturnsCard({required this.summary});

  final ContributionsSummary summary;

  @override
  Widget build(BuildContext context) {
    final invested = summary.totalContributions;
    final returns = summary.totalExpectedReturns;
    final total = invested + returns;
    final returnsFraction = total > 0 ? returns / total : 0.0;
    return _ChartCard(
      title: 'Invested vs expected return',
      child: Column(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: SizedBox(
              height: 14,
              child: Row(
                children: [
                  Expanded(
                    flex: ((1 - returnsFraction) * 1000).round(),
                    child: Container(color: AppColors.navy),
                  ),
                  Expanded(
                    flex: (returnsFraction * 1000).round(),
                    child: Container(color: AppColors.success),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _legend('Invested', Fmt.money(invested), AppColors.navy),
              _legend('Expected return', Fmt.money(returns),
                  AppColors.success),
            ],
          ),
        ],
      ),
    );
  }

  Widget _legend(String label, String value, Color color) {
    return Row(
      children: [
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(
              color: color, borderRadius: BorderRadius.circular(3)),
        ),
        const SizedBox(width: 6),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: const TextStyle(
                    fontSize: 11, color: AppColors.textSecondary)),
            Text(value,
                style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w700)),
          ],
        ),
      ],
    );
  }
}
