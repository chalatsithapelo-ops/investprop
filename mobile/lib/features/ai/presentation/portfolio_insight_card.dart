import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../data/ai_repository.dart';
import '../domain/ai_models.dart';

/// AI Portfolio Advisor brief — shown on the portfolio tab. Generates a
/// monthly brief on demand and lists actionable insights.
class PortfolioInsightCard extends ConsumerStatefulWidget {
  const PortfolioInsightCard({super.key});

  @override
  ConsumerState<PortfolioInsightCard> createState() =>
      _PortfolioInsightCardState();
}

class _PortfolioInsightCardState extends ConsumerState<PortfolioInsightCard> {
  bool _generating = false;
  String? _error;

  Future<void> _generate({bool force = false}) async {
    setState(() {
      _generating = true;
      _error = null;
    });
    try {
      await ref
          .read(aiRepositoryProvider)
          .generatePortfolioInsight(force: force);
      ref.invalidate(portfolioInsightProvider);
    } catch (e) {
      setState(() => _error = '$e'.replaceFirst('ApiException: ', ''));
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  Color _severityColor(String s) {
    switch (s) {
      case 'WARNING':
        return AppColors.danger;
      case 'ATTENTION':
        return AppColors.warning;
      default:
        return const Color(0xFF3B82F6);
    }
  }

  IconData _severityIcon(String s) {
    switch (s) {
      case 'WARNING':
        return Icons.warning_amber_rounded;
      case 'ATTENTION':
        return Icons.info_outline;
      default:
        return Icons.lightbulb_outline;
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(portfolioInsightProvider);
    final insight = async.valueOrNull;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.auto_awesome,
                    size: 18, color: AppColors.goldDark),
                const SizedBox(width: 8),
                const Text('AI Portfolio Advisor',
                    style: TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 15)),
                const Spacer(),
                if (insight != null && !_generating)
                  TextButton(
                    onPressed: () => _generate(force: true),
                    child: const Text('Refresh'),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            if (_generating)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(
                  child: Column(
                    children: [
                      CircularProgressIndicator(),
                      SizedBox(height: 12),
                      Text('Analysing your portfolio…',
                          style: TextStyle(color: AppColors.textSecondary)),
                    ],
                  ),
                ),
              )
            else if (_error != null)
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_error!,
                      style: const TextStyle(color: AppColors.danger)),
                  const SizedBox(height: 8),
                  OutlinedButton(
                    onPressed: () => _generate(),
                    child: const Text('Try again'),
                  ),
                ],
              )
            else if (insight == null)
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Get a personalised monthly brief on your portfolio shape, '
                    'risks and opportunities.',
                    style: TextStyle(color: AppColors.textSecondary),
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: () => _generate(),
                    icon: const Icon(Icons.auto_awesome, size: 18),
                    label: const Text('Generate brief'),
                  ),
                ],
              )
            else
              _content(insight),
          ],
        ),
      ),
    );
  }

  Widget _content(PortfolioInsight insight) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(insight.summary,
            style: const TextStyle(height: 1.5, color: AppColors.textPrimary)),
        if (insight.insights.isNotEmpty) ...[
          const SizedBox(height: 16),
          ...insight.insights.map((i) => Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _severityColor(i.severity).withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                      color:
                          _severityColor(i.severity).withValues(alpha: 0.3)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(_severityIcon(i.severity),
                        size: 18, color: _severityColor(i.severity)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(i.message,
                              style: const TextStyle(fontSize: 13, height: 1.35)),
                          if (i.action != null && i.action!.isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Text(i.action!,
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: _severityColor(i.severity))),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              )),
        ],
        const SizedBox(height: 4),
        Text(
          'AI research based on your holdings. Not financial, tax or legal advice.',
          style: const TextStyle(fontSize: 10, color: AppColors.textSecondary),
        ),
      ],
    );
  }
}
