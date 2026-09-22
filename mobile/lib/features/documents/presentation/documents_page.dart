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
                            trailing: Icon(
                              group.value[i].documentUrl != null
                                  ? Icons.download_outlined
                                  : Icons.lock_outline,
                              size: 20,
                              color: group.value[i].documentUrl != null
                                  ? AppColors.navy
                                  : AppColors.textSecondary,
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
}
