import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/certificates_repository.dart';
import '../domain/certificate.dart';
import 'certificate_pdf.dart';

class CertificatesPage extends ConsumerWidget {
  const CertificatesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final certs = ref.watch(myCertificatesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My Certificates')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(myCertificatesProvider.future),
        child: AsyncValueView<List<ShareCertificate>>(
          value: certs,
          onRetry: () => ref.invalidate(myCertificatesProvider),
          data: (items) {
            if (items.isEmpty) {
              return ListView(
                children: const [
                  SizedBox(height: 120),
                  EmptyState(
                    icon: Icons.workspace_premium_outlined,
                    title: 'No certificates yet',
                    subtitle:
                        'Share certificates are issued once your investment '
                        'payment is confirmed.',
                  ),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (_, i) => _CertificateCard(cert: items[i]),
            );
          },
        ),
      ),
    );
  }
}

class _CertificateCard extends StatelessWidget {
  const _CertificateCard({required this.cert});

  final ShareCertificate cert;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => showModalBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          builder: (_) => _CertificateSheet(cert: cert),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.gold.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.workspace_premium,
                    color: AppColors.goldDark),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(cert.propertyTitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 15)),
                    const SizedBox(height: 2),
                    Text(cert.certificateNumber,
                        style: const TextStyle(
                            color: AppColors.textSecondary, fontSize: 12)),
                    const SizedBox(height: 6),
                    Text(
                      '${cert.numberOfShares.toStringAsFixed(0)} shares · '
                      '${Fmt.percent(cert.ownershipPercentage, decimals: 2)}',
                      style: const TextStyle(fontSize: 13),
                    ),
                  ],
                ),
              ),
              Text(Fmt.money(cert.totalValue),
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, color: AppColors.navy)),
            ],
          ),
        ),
      ),
    );
  }
}

class _CertificateSheet extends ConsumerStatefulWidget {
  const _CertificateSheet({required this.cert});

  final ShareCertificate cert;

  @override
  ConsumerState<_CertificateSheet> createState() => _CertificateSheetState();
}

class _CertificateSheetState extends ConsumerState<_CertificateSheet> {
  bool _busy = false;

  Future<void> _download() async {
    setState(() => _busy = true);
    try {
      final data =
          await ref.read(certificatesRepositoryProvider).pdfData(widget.cert.id);
      final doc = await buildCertificatePdf(data);
      final bytes = await doc.save();
      await Printing.sharePdf(
        bytes: bytes,
        filename: '${data.certificateNumber}.pdf',
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not generate PDF: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.cert;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
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
            Text(c.propertyTitle,
                style: const TextStyle(
                    fontSize: 18, fontWeight: FontWeight.w700)),
            Text(c.certificateNumber,
                style: const TextStyle(color: AppColors.textSecondary)),
            const SizedBox(height: 16),
            _kv('Investor', c.investorName),
            _kv('Share class', c.shareClassName),
            _kv('Shares', c.numberOfShares.toStringAsFixed(0)),
            _kv('Price / share', Fmt.money(c.sharePrice, detailed: true)),
            _kv('Total value', Fmt.money(c.totalValue, detailed: true)),
            _kv('Ownership', Fmt.percent(c.ownershipPercentage, decimals: 4)),
            _kv('Issued', Fmt.date(c.issueDate)),
            _kv('Status', c.isValid ? 'Valid' : 'Revoked'),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _busy ? null : _download,
                icon: _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.picture_as_pdf_outlined),
                label: Text(_busy ? 'Preparing…' : 'Download / share PDF'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 120,
              child: Text(k,
                  style: const TextStyle(
                      color: AppColors.textSecondary, fontSize: 13)),
            ),
            Expanded(
              child: Text(v,
                  style: const TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w500)),
            ),
          ],
        ),
      );
}
