import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../domain/development_due_diligence.dart';

/// Read-only investor "Due Diligence Pack" for a development opportunity —
/// construction readiness, financial feasibility, use of capital & returns,
/// professional team and statutory approvals. Mirrors the web app section.
class DevelopmentDueDiligencePanel extends StatelessWidget {
  const DevelopmentDueDiligencePanel({super.key, required this.dd});

  final DevelopmentDueDiligence dd;

  @override
  Widget build(BuildContext context) {
    final e = dd.economics;
    final c = dd.capital;
    final r = dd.readiness;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.account_balance_outlined,
                    size: 20, color: AppColors.gold),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Due Diligence Pack',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              'Independent feasibility, use of capital and project returns, plus '
              'the professional team and statutory approvals behind this development.',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 16),

            // Readiness score + gates
            _ReadinessBlock(readiness: r),
            const SizedBox(height: 16),

            const _SectionLabel('Financial feasibility'),
            _MetricRow('Gross development value', Fmt.money(e.grossDevelopmentValue)),
            _MetricRow('Total development cost', Fmt.money(e.totalCost)),
            _MetricRow(
              'Projected profit',
              Fmt.money(e.profit),
              valueColor: e.profit >= 0 ? AppColors.success : AppColors.danger,
            ),
            _MetricRow(
              'Profit on cost',
              Fmt.percent(e.profitOnCost),
              valueColor: e.profitOnCost >= 15 ? AppColors.success : AppColors.warning,
            ),
            _MetricRow('Profit on GDV', Fmt.percent(e.profitOnGdv)),
            _MetricRow('Programme', '${e.timelineMonths} months'),
            const SizedBox(height: 16),

            const _SectionLabel('Use of capital & returns'),
            _MetricRow('Investor equity', Fmt.money(c.equityAmount)),
            _MetricRow(
              'Senior debt',
              Fmt.money(c.seniorDebtAmount),
              muted: c.seniorDebtAmount == 0,
            ),
            _MetricRow('Peak funding', Fmt.money(c.peakFunding)),
            _MetricRow(
              'Committed funding',
              Fmt.money(c.committedFunding),
              valueColor: c.fundingShortfall > 0 ? AppColors.warning : AppColors.success,
            ),
            if (c.fundingShortfall > 0)
              _MetricRow('Funding shortfall', Fmt.money(c.fundingShortfall),
                  valueColor: AppColors.warning),
            _MetricRow('Loan to cost', Fmt.percent(c.loanToCost)),
            _MetricRow('Rolled-up interest', Fmt.money(c.totalInterest), muted: true),
            _MetricRow(
              'Project IRR',
              e.projectIRR.isFinite ? Fmt.percent(e.projectIRR) : '—',
              valueColor: AppColors.success,
            ),
            _MetricRow(
              'Equity IRR',
              e.equityIRR.isFinite ? Fmt.percent(e.equityIRR) : '—',
              valueColor: AppColors.success,
            ),
            _MetricRow(
              'Equity multiple',
              e.equityMultiple > 0 ? '${e.equityMultiple.toStringAsFixed(2)}x' : '—',
            ),
            _MetricRow('Residual land value', Fmt.money(e.residualLandValue)),
            _MetricRow(
              'Land headroom',
              Fmt.money(e.landHeadroom),
              valueColor: e.landHeadroom >= 0 ? AppColors.success : AppColors.danger,
            ),
            const SizedBox(height: 16),

            _SectionLabel(
              'Professional team  ·  ${dd.professionalsSummary.appointed}/${dd.professionalsSummary.required} appointed',
            ),
            if (dd.professionals.isEmpty)
              const _EmptyNote('No professional appointments recorded yet.')
            else
              ...dd.professionals.map((p) => _StatusRow(
                    title: ddLabel(p.role),
                    subtitle: p.firmName.isEmpty ? 'To be appointed' : p.firmName,
                    required: p.isRequired,
                    statusLabel: ddLabel(p.status),
                    statusColor: _appointmentColor(p.status),
                  )),
            const SizedBox(height: 16),

            _SectionLabel(
              'Statutory approvals  ·  ${dd.approvalsSummary.approved}/${dd.approvalsSummary.required} approved',
            ),
            if (dd.approvals.isEmpty)
              const _EmptyNote('No statutory approvals recorded yet.')
            else
              ...dd.approvals.map((a) => _StatusRow(
                    title: ddLabel(a.type),
                    subtitle: a.authority.isEmpty
                        ? (a.targetDate != null
                            ? 'Target ${Fmt.date(a.targetDate)}'
                            : 'Authority t.b.c.')
                        : a.authority,
                    required: a.isRequired,
                    statusLabel: ddLabel(a.status),
                    statusColor: _approvalColor(a.status),
                  )),
          ],
        ),
      ),
    );
  }

  Color _appointmentColor(String status) {
    switch (status) {
      case 'APPOINTED':
        return AppColors.success;
      case 'SHORTLISTED':
        return AppColors.warning;
      case 'TERMINATED':
        return AppColors.danger;
      default:
        return AppColors.textSecondary;
    }
  }

  Color _approvalColor(String status) {
    switch (status) {
      case 'APPROVED':
        return AppColors.success;
      case 'CONDITIONAL':
        return AppColors.warning;
      case 'IN_REVIEW':
      case 'SUBMITTED':
        return AppColors.navyLight;
      case 'REJECTED':
        return AppColors.danger;
      default:
        return AppColors.textSecondary;
    }
  }
}

class _ReadinessBlock extends StatelessWidget {
  const _ReadinessBlock({required this.readiness});

  final DdReadiness readiness;

  @override
  Widget build(BuildContext context) {
    final score = readiness.readinessScore;
    final color = score >= 75
        ? AppColors.success
        : score >= 50
            ? AppColors.warning
            : AppColors.danger;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.navy.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Construction readiness',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
              Text.rich(
                TextSpan(children: [
                  TextSpan(
                    text: '$score',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: color,
                    ),
                  ),
                  const TextSpan(
                    text: '/100',
                    style: TextStyle(
                      fontSize: 13,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ]),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: score / 100,
              minHeight: 8,
              backgroundColor: AppColors.border,
              valueColor: AlwaysStoppedAnimation(color),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _Gate('Economics', readiness.economicsPass),
              _Gate('Team', readiness.professionalsPass),
              _Gate('Approvals', readiness.approvalsPass),
              _Gate('Funding', readiness.fundingPass),
            ],
          ),
          if (readiness.constructionReady)
            const Padding(
              padding: EdgeInsets.only(top: 12),
              child: Row(
                children: [
                  Icon(Icons.check_circle, size: 15, color: AppColors.success),
                  SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'All pre-construction gates satisfied.',
                      style: TextStyle(fontSize: 12, color: AppColors.success),
                    ),
                  ),
                ],
              ),
            )
          else
            ...readiness.reasons.map((reason) => Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.warning_amber_rounded,
                          size: 15, color: AppColors.warning),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          reason,
                          style: const TextStyle(
                              fontSize: 12, color: AppColors.warning),
                        ),
                      ),
                    ],
                  ),
                )),
        ],
      ),
    );
  }
}

class _Gate extends StatelessWidget {
  const _Gate(this.label, this.pass);

  final String label;
  final bool pass;

  @override
  Widget build(BuildContext context) {
    final color = pass ? AppColors.success : AppColors.warning;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(pass ? Icons.check_circle : Icons.warning_amber_rounded,
              size: 14, color: color),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.w600, color: color),
          ),
        ],
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  const _StatusRow({
    required this.title,
    required this.subtitle,
    required this.required,
    required this.statusLabel,
    required this.statusColor,
  });

  final String title;
  final String subtitle;
  final bool required;
  final String statusLabel;
  final Color statusColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        title,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ),
                    if (required)
                      const Padding(
                        padding: EdgeInsets.only(left: 6),
                        child: Text('• required',
                            style:
                                TextStyle(fontSize: 10, color: AppColors.gold)),
                      ),
                  ],
                ),
                Text(
                  subtitle,
                  style: const TextStyle(
                      fontSize: 11, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: statusColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              statusLabel,
              style: TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w600, color: statusColor),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.5,
          color: AppColors.textSecondary,
        ),
      ),
    );
  }
}

class _MetricRow extends StatelessWidget {
  const _MetricRow(
    this.label,
    this.value, {
    this.valueColor,
    this.muted = false,
  });

  final String label;
  final String value;
  final Color? valueColor;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                color: muted ? AppColors.textSecondary : AppColors.textPrimary,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Text(
            value,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: valueColor ??
                  (muted ? AppColors.textSecondary : AppColors.textPrimary),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyNote extends StatelessWidget {
  const _EmptyNote(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.navy.withValues(alpha: 0.02),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.border),
      ),
      child: Text(
        text,
        style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
      ),
    );
  }
}
