import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../config/env.dart';
import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../domain/development_due_diligence.dart';
import '../domain/property_due_diligence.dart';

/// Read-only investor "Due Diligence Pack" for a flip or rental opportunity —
/// the professional team, statutory approvals/consents and supporting
/// documents, without the greenfield development economics. Mirrors the web
/// `PropertyDueDiligence` section.
class PropertyDueDiligencePanel extends StatelessWidget {
  const PropertyDueDiligencePanel({super.key, required this.dd});

  final PropertyDueDiligence dd;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: const [
                Icon(Icons.account_balance_outlined,
                    size: 20, color: AppColors.gold),
                SizedBox(width: 8),
                Expanded(
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
              'The professional team, statutory approvals and supporting '
              'documents underpinning this opportunity.',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 16),

            _SectionLabel(
              'Professional team  ·  ${dd.professionalsSummary.appointed}/${dd.professionalsSummary.required} appointed',
            ),
            if (dd.professionals.isEmpty)
              const _EmptyNote('No professional appointments recorded yet.')
            else
              ...dd.professionals.map(
                (p) => _StatusRow(
                  title: ddLabel(p.role),
                  subtitle: p.firmName.isEmpty ? 'To be appointed' : p.firmName,
                  required: p.isRequired,
                  statusLabel: ddLabel(p.status),
                  statusColor: _appointmentColor(p.status),
                ),
              ),
            const SizedBox(height: 16),

            _SectionLabel(
              'Approvals & consents  ·  ${dd.approvalsSummary.approved}/${dd.approvalsSummary.required} approved',
            ),
            if (dd.approvals.isEmpty)
              const _EmptyNote('No approvals recorded yet.')
            else
              ...dd.approvals.map(
                (a) => _StatusRow(
                  title: ddLabel(a.type),
                  subtitle: a.authority.isEmpty
                      ? (a.targetDate != null
                            ? 'Target ${Fmt.date(a.targetDate)}'
                            : 'Authority t.b.c.')
                      : a.authority,
                  required: a.isRequired,
                  statusLabel: ddLabel(a.status),
                  statusColor: _approvalColor(a.status),
                ),
              ),
            const SizedBox(height: 16),

            const _SectionLabel('Supporting documents'),
            if (dd.documentsPack.isEmpty)
              const _EmptyNote('No supporting documents uploaded yet.')
            else
              ...dd.documentsPack.map((d) => _DocumentRow(doc: d)),
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
                        child: Text(
                          '• required',
                          style: TextStyle(fontSize: 10, color: AppColors.gold),
                        ),
                      ),
                  ],
                ),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
                  ),
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
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: statusColor,
              ),
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

class _DocumentRow extends StatelessWidget {
  const _DocumentRow({required this.doc});

  final DdDocument doc;

  Future<void> _open(BuildContext context) async {
    if (doc.url.isEmpty) return;
    final full =
        doc.url.startsWith('http') ? doc.url : '${Env.apiBaseUrl}${doc.url}';
    final launched = await launchUrl(
      Uri.parse(full),
      mode: LaunchMode.externalApplication,
    );
    if (!launched && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open the document.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: () => _open(context),
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.navy.withValues(alpha: 0.02),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              const Icon(Icons.description_outlined,
                  size: 18, color: AppColors.gold),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  doc.label,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              const Icon(Icons.open_in_new,
                  size: 15, color: AppColors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}
