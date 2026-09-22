import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../data/ai_repository.dart';

/// Personalised AI risk-match score card for a property detail page.
class MatchScoreCard extends ConsumerWidget {
  const MatchScoreCard({super.key, required this.propertyId});

  final int propertyId;

  Color _bandColor(String band) {
    switch (band) {
      case 'STRONG_MATCH':
        return AppColors.success;
      case 'GOOD_MATCH':
        return const Color(0xFF3B82F6);
      case 'FAIR_MATCH':
        return AppColors.warning;
      case 'POOR_MATCH':
      case 'MISMATCH':
        return AppColors.danger;
      default:
        return AppColors.textSecondary;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(matchScoreProvider(propertyId));
    return async.when(
      loading: () => const _Skeleton(),
      error: (_, __) => const SizedBox.shrink(),
      data: (score) {
        if (score == null) return const SizedBox.shrink();
        final color = _bandColor(score.band);
        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [color.withValues(alpha: 0.12), AppColors.surface],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: color.withValues(alpha: 0.4)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.auto_awesome,
                      size: 18, color: AppColors.goldDark),
                  const SizedBox(width: 6),
                  const Text('Your match score',
                      style: TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 15)),
                  const Spacer(),
                  _ScoreRing(score: score.score, color: color),
                ],
              ),
              const SizedBox(height: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(score.bandLabel,
                    style: TextStyle(
                        color: color,
                        fontWeight: FontWeight.w700,
                        fontSize: 12)),
              ),
              if (score.justification.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(score.justification,
                    style: const TextStyle(
                        color: AppColors.textPrimary, height: 1.4)),
              ],
              if (score.factors.isNotEmpty) ...[
                const SizedBox(height: 12),
                ...score.factors.map((f) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Row(
                        children: [
                          Icon(
                            f.positive
                                ? Icons.check_circle
                                : Icons.remove_circle,
                            size: 16,
                            color: f.positive
                                ? AppColors.success
                                : AppColors.danger,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(f.label,
                                style: const TextStyle(fontSize: 13)),
                          ),
                        ],
                      ),
                    )),
              ],
              const SizedBox(height: 8),
              const Text(
                'AI-generated research based on your profile. Not financial advice.',
                style: TextStyle(fontSize: 10, color: AppColors.textSecondary),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _ScoreRing extends StatelessWidget {
  const _ScoreRing({required this.score, required this.color});

  final int score;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 44,
      height: 44,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: 44,
            height: 44,
            child: CircularProgressIndicator(
              value: score / 100,
              strokeWidth: 4,
              backgroundColor: AppColors.border,
              valueColor: AlwaysStoppedAnimation(color),
            ),
          ),
          Text('$score',
              style: TextStyle(
                  fontWeight: FontWeight.w800, fontSize: 14, color: color)),
        ],
      ),
    );
  }
}

class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 90,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: const Center(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
    );
  }
}
