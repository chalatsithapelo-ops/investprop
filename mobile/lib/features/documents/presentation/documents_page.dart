import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../config/env.dart';
import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/documents_repository.dart';
import '../domain/investor_document.dart';

class DocumentsPage extends ConsumerWidget {
  const DocumentsPage({super.key});

  IconData _iconFor(String category) {
    switch (category) {
      case 'Share certificates':
        return Icons.workspace_premium_outlined;
      case 'Tax certificates':
        return Icons.receipt_long_outlined;
      case 'Distribution statements':
        return Icons.payments_outlined;
      case 'Compliance reports':
        return Icons.verified_outlined;
      default:
        return Icons.description_outlined;
    }
  }

  Future<void> _open(BuildContext context, InvestorDocument doc) async {
    final url = doc.documentUrl;
    if (url == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('This document is not available for download yet.'),
        ),
      );
      return;
    }
    final full = url.startsWith('http') ? url : '${Env.apiBaseUrl}$url';
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
  Widget build(BuildContext context, WidgetRef ref) {
    final docs = ref.watch(myDocumentsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My Documents')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myDocumentsProvider.future),
        child: AsyncValueView<DocumentsResult>(
          value: docs,
          onRetry: () => ref.invalidate(myDocumentsProvider),
          data: (result) {
            if (result.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 120),
                  EmptyState(
                    icon: Icons.folder_open_outlined,
                    title: 'No documents yet',
                    subtitle:
                        'Certificates, statements and agreements shared with '
                        'you will appear here.',
                  ),
                ],
              );
            }
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                for (final group in result.groups) ...[
                  Padding(
                    padding: const EdgeInsets.only(top: 8, bottom: 8),
                    child: Text(
                      group.key,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 15),
                    ),
                  ),
                  Card(
                    margin: EdgeInsets.zero,
                    child: Column(
                      children: [
                        for (var i = 0; i < group.value.length; i++) ...[
                          if (i > 0) const Divider(height: 1),
                          ListTile(
                            leading: Icon(_iconFor(group.key),
                                color: AppColors.navy),
                            title: Text(group.value[i].typeLabel),
                            subtitle: Text(
                              '${group.value[i].propertyTitle} · '
                              '${Fmt.date(group.value[i].createdAt)}',
                            ),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                if (group.value[i].supportsAiSummary)
                                  IconButton(
                                    icon: const Icon(Icons.auto_awesome_outlined,
                                        size: 20, color: AppColors.gold),
                                    tooltip: 'AI summary & risk check',
                                    onPressed: () => _openAiSheet(
                                        context, group.value[i]),
                                  ),
                                Icon(
                                  group.value[i].documentUrl != null
                                      ? Icons.download_outlined
                                      : Icons.lock_outline,
                                  size: 20,
                                  color: group.value[i].documentUrl != null
                                      ? AppColors.navy
                                      : AppColors.textSecondary,
                                ),
                              ],
                            ),
                            onTap: () => _open(context, group.value[i]),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
              ],
            );
          },
        ),
      ),
    );
  }

  void _openAiSheet(BuildContext context, InvestorDocument doc) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _DocAiSheet(doc: doc),
    );
  }
}

/// Bottom sheet that loads (or triggers) a legal document's AI summary and
/// surfaces the risk register.
class _DocAiSheet extends ConsumerStatefulWidget {
  const _DocAiSheet({required this.doc});

  final InvestorDocument doc;

  @override
  ConsumerState<_DocAiSheet> createState() => _DocAiSheetState();
}

class _DocAiSheetState extends ConsumerState<_DocAiSheet> {
  bool _loading = true;
  bool _analysing = false;
  String? _error;
  DocumentAiSummary? _summary;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final s = await ref
          .read(documentsRepositoryProvider)
          .aiSummary(widget.doc.id);
      if (mounted) setState(() => _summary = s);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _analyse() async {
    setState(() {
      _analysing = true;
      _error = null;
    });
    try {
      final s = await ref
          .read(documentsRepositoryProvider)
          .analyse(widget.doc.id, force: _summary != null);
      if (mounted) setState(() => _summary = s);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _analysing = false);
    }
  }

  Color _riskColor(String level) => switch (level) {
        'HIGH' => AppColors.danger,
        'LOW' => AppColors.success,
        _ => AppColors.warning,
      };

  Color _flagColor(String severity) => switch (severity) {
        'WARNING' => AppColors.danger,
        'ATTENTION' => AppColors.warning,
        _ => AppColors.textSecondary,
      };

  @override
  Widget build(BuildContext context) {
    final s = _summary;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (_, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              const Icon(Icons.auto_awesome, color: AppColors.gold, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  widget.doc.typeLabel,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              if (s != null)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: _riskColor(s.riskLevel).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '${s.riskLevel} risk',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: _riskColor(s.riskLevel),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null)
            Text(_error!, style: const TextStyle(color: AppColors.danger))
          else if (s == null)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'This document has not been analysed yet. Run an AI review '
                  'to get a plain-English summary and a risk check of its '
                  'clauses.',
                  style: TextStyle(
                      color: AppColors.textSecondary, height: 1.4),
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: _analysing ? null : _analyse,
                  icon: _analysing
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.auto_awesome, size: 18),
                  label: Text(_analysing ? 'Analysing…' : 'Analyse with AI'),
                ),
              ],
            )
          else ...[
            Text(
              s.summary,
              style: const TextStyle(
                  color: AppColors.textPrimary, height: 1.5, fontSize: 14),
            ),
            if (s.riskFlags.isNotEmpty) ...[
              const SizedBox(height: 20),
              const Text(
                'Risk register',
                style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                    color: AppColors.textPrimary),
              ),
              const SizedBox(height: 8),
              ...s.riskFlags.map(
                (f) => Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.background,
                    borderRadius: BorderRadius.circular(12),
                    border: Border(
                      left: BorderSide(color: _flagColor(f.severity), width: 3),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              f.category.replaceAll('_', ' '),
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 12,
                                color: AppColors.textPrimary,
                              ),
                            ),
                          ),
                          Text(
                            f.severity,
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: _flagColor(f.severity),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        f.detail,
                        style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.textPrimary,
                            height: 1.35),
                      ),
                      if (f.recommendation.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          '→ ${f.recommendation}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.textSecondary,
                            height: 1.35,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: 12),
            TextButton.icon(
              onPressed: _analysing ? null : _analyse,
              icon: const Icon(Icons.refresh, size: 16),
              label: Text(
                s.generatedAt != null
                    ? 'Re-analyse (updated ${Fmt.date(s.generatedAt)})'
                    : 'Re-analyse',
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'AI research, not legal advice. Confirm with an attorney before signing.',
              style: TextStyle(fontSize: 11, color: AppColors.textSecondary),
            ),
          ],
        ],
      ),
    );
  }
}
