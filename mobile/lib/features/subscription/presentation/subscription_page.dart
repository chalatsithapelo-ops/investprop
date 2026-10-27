import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../config/env.dart';
import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/subscription_repository.dart';
import '../domain/subscription_models.dart';

/// Shows the user's current plan and the full catalog of packages. Checkout,
/// upgrades and cancellation run through Paystack on the web, so plan actions
/// deep-link to the web pricing/billing pages.
class SubscriptionPage extends ConsumerWidget {
  const SubscriptionPage({super.key});

  Future<void> _openWeb(BuildContext context, String path) async {
    final uri = Uri.parse('${Env.apiBaseUrl}$path');
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open the billing page.')),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sub = ref.watch(mySubscriptionProvider);
    final plans = ref.watch(subscriptionPlansProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('My plan')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(mySubscriptionProvider);
          ref.invalidate(subscriptionPlansProvider);
          await ref.read(mySubscriptionProvider.future);
        },
        child: AsyncValueView(
          value: sub,
          onRetry: () => ref.invalidate(mySubscriptionProvider),
          data: (current) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _CurrentPlanCard(sub: current),
              const SizedBox(height: 24),
              const Text(
                'Available packages',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 12),
              ...plans.when(
                data: (list) => list
                    .where((p) => !p.isFree || p.tier == current.tier)
                    .map(
                      (p) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _PlanCard(
                          plan: p,
                          isCurrent: p.tier == current.tier,
                          onSelect: () => _openWeb(context, '/pricing'),
                        ),
                      ),
                    )
                    .toList(),
                loading: () => const [
                  Padding(
                    padding: EdgeInsets.all(24),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                ],
                error: (_, __) => const [
                  Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('Could not load packages.'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Center(
                child: TextButton.icon(
                  onPressed: () => _openWeb(context, '/pricing'),
                  icon: const Icon(Icons.open_in_new, size: 18),
                  label: const Text('Manage billing on the web'),
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}

class _CurrentPlanCard extends StatelessWidget {
  const _CurrentPlanCard({required this.sub});

  final MySubscription sub;

  @override
  Widget build(BuildContext context) {
    final renews = sub.isTrialing ? sub.trialEndsAt : sub.currentPeriodEnd;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.navy, AppColors.navyLight],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.workspace_premium, color: AppColors.gold),
              const SizedBox(width: 8),
              const Text(
                'Current plan',
                style: TextStyle(color: Colors.white70, fontSize: 13),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  sub.statusLabel,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            sub.planName,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.w800,
            ),
          ),
          if (!sub.isFree && sub.priceAmount > 0) ...[
            const SizedBox(height: 4),
            Text(
              '${Fmt.money(sub.priceAmount)}'
              '${sub.billingCycle == 'ANNUAL' ? ' / year' : ' / month'}',
              style: const TextStyle(color: Colors.white70, fontSize: 14),
            ),
          ],
          if (renews != null) ...[
            const SizedBox(height: 12),
            Text(
              sub.cancelAtPeriodEnd
                  ? 'Access ends ${Fmt.date(renews)}'
                  : sub.isTrialing
                  ? 'Trial ends ${Fmt.date(renews)}'
                  : 'Renews ${Fmt.date(renews)}',
              style: const TextStyle(color: Colors.white70, fontSize: 13),
            ),
          ],
        ],
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.plan,
    required this.isCurrent,
    required this.onSelect,
  });

  final SubscriptionPlan plan;
  final bool isCurrent;
  final VoidCallback onSelect;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isCurrent
              ? AppColors.gold
              : plan.highlighted
              ? AppColors.navy
              : AppColors.border,
          width: isCurrent || plan.highlighted ? 1.5 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  plan.name,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              if (isCurrent)
                _Pill('Current', AppColors.gold)
              else if (plan.highlighted)
                _Pill('Popular', AppColors.navy),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            plan.tagline,
            style: const TextStyle(
              fontSize: 12,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            plan.isFree ? 'Free' : '${Fmt.money(plan.monthlyPrice)} / month',
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.navy,
            ),
          ),
          if (!plan.isFree && plan.annualPrice > 0)
            Text(
              'or ${Fmt.money(plan.annualPrice)} / year',
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.textSecondary,
              ),
            ),
          const SizedBox(height: 12),
          ...plan.features
              .take(6)
              .map(
                (f) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(
                        Icons.check_circle,
                        size: 16,
                        color: AppColors.success,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          f,
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.textPrimary,
                            height: 1.35,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: isCurrent
                ? OutlinedButton(
                    onPressed: null,
                    child: const Text('Your current plan'),
                  )
                : FilledButton(
                    onPressed: onSelect,
                    child: Text(
                      plan.isFree ? 'Switch to free' : 'Choose ${plan.name}',
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill(this.label, this.color);

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}
