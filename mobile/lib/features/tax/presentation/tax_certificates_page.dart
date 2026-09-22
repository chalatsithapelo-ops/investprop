import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/tax_repository.dart';
import '../domain/tax_certificate.dart';

class TaxCertificatesPage extends ConsumerStatefulWidget {
  const TaxCertificatesPage({super.key});

  @override
  ConsumerState<TaxCertificatesPage> createState() =>
      _TaxCertificatesPageState();
}

class _TaxCertificatesPageState extends ConsumerState<TaxCertificatesPage> {
  late int _year;
  bool _exporting = false;

  @override
  void initState() {
    super.initState();
    // SA tax year ends end-Feb. Default to the most recently completed year.
    final now = DateTime.now();
    _year = now.month >= 3 ? now.year + 1 : now.year;
    // Show the last completed year by default.
    _year = _year - 1;
  }

  List<int> get _years {
    final now = DateTime.now();
    final latest = now.month >= 3 ? now.year + 1 : now.year;
    return [for (var y = latest; y >= latest - 5; y--) y];
  }

  Future<void> _export(TaxCertificate cert) async {
    setState(() => _exporting = true);
    try {
      final doc = await _buildTaxPdf(cert);
      final bytes = await doc.save();
      await Printing.sharePdf(
        bytes: bytes,
        filename: 'IT3-summary-${cert.taxYear}.pdf',
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not export: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cert = ref.watch(taxCertificateProvider(_year));
    return Scaffold(
      appBar: AppBar(title: const Text('Tax Certificates')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Text('Tax year',
                    style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: AppColors.textSecondary)),
                const SizedBox(width: 12),
                DropdownButton<int>(
                  value: _year,
                  items: _years
                      .map((y) => DropdownMenuItem(
                            value: y,
                            child: Text('Mar ${y - 1} – Feb $y'),
                          ))
                      .toList(),
                  onChanged: (v) {
                    if (v != null) setState(() => _year = v);
                  },
                ),
              ],
            ),
          ),
          Expanded(
            child: AsyncValueView<TaxCertificate>(
              value: cert,
              onRetry: () => ref.invalidate(taxCertificateProvider(_year)),
              data: (c) {
                if (c.isEmpty) {
                  return const EmptyState(
                    icon: Icons.receipt_long_outlined,
                    title: 'No taxable distributions',
                    subtitle:
                        'There were no paid distributions in this tax year.',
                  );
                }
                return ListView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  children: [
                    _headerCard(c),
                    const SizedBox(height: 16),
                    _breakdownCard(c),
                    const SizedBox(height: 16),
                    _totalsCard(c),
                    const SizedBox(height: 12),
                    Text(c.disclaimer,
                        style: const TextStyle(
                            fontSize: 11, color: AppColors.textSecondary)),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: _exporting ? null : () => _export(c),
                      icon: _exporting
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child:
                                  CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.download),
                      label: Text(
                          _exporting ? 'Preparing…' : 'Download / share PDF'),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _headerCard(TaxCertificate c) {
    return Card(
      color: AppColors.navy,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('IT3 Income Summary',
                style: TextStyle(
                    color: AppColors.gold,
                    fontWeight: FontWeight.w700,
                    fontSize: 16)),
            const SizedBox(height: 4),
            Text(c.investorName,
                style: const TextStyle(color: Colors.white, fontSize: 14)),
            if (c.investorCode.isNotEmpty)
              Text('Investor code: ${c.investorCode}',
                  style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.7),
                      fontSize: 12)),
            const SizedBox(height: 4),
            Text('Period: ${Fmt.date(c.periodStart)} – ${Fmt.date(c.periodEnd)}',
                style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.7), fontSize: 12)),
          ],
        ),
      ),
    );
  }

  Widget _breakdownCard(TaxCertificate c) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Income by classification',
                style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            ...c.buckets.map((b) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(b.label,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600)),
                            Text('${b.count} payout(s)',
                                style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textSecondary)),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(Fmt.money(b.gross),
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700)),
                          if (b.taxWithheld > 0)
                            Text('- ${Fmt.money(b.taxWithheld)} tax',
                                style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textSecondary)),
                        ],
                      ),
                    ],
                  ),
                )),
          ],
        ),
      ),
    );
  }

  Widget _totalsCard(TaxCertificate c) {
    Widget row(String label, String value, {bool bold = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label,
                  style: TextStyle(
                      fontWeight: bold ? FontWeight.w700 : FontWeight.w400)),
              Text(value,
                  style: TextStyle(
                      fontWeight: bold ? FontWeight.w700 : FontWeight.w600)),
            ],
          ),
        );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            row('Total gross', Fmt.money(c.totalGross)),
            row('Total tax withheld', Fmt.money(c.totalTaxWithheld)),
            const Divider(),
            row('Net received', Fmt.money(c.totalNet), bold: true),
          ],
        ),
      ),
    );
  }
}

Future<pw.Document> _buildTaxPdf(TaxCertificate c) async {
  final doc = pw.Document();
  const navy = PdfColor.fromInt(0xFF0B2545);
  const gold = PdfColor.fromInt(0xFFC8A24A);

  pw.Widget kv(String label, String value, {bool bold = false}) => pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 3),
        child: pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          children: [
            pw.Text(label,
                style: pw.TextStyle(
                    fontSize: 10,
                    fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal)),
            pw.Text(value,
                style: pw.TextStyle(
                    fontSize: 10,
                    fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal)),
          ],
        ),
      );

  doc.addPage(
    pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(32),
      build: (context) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Container(
            width: double.infinity,
            padding: const pw.EdgeInsets.all(16),
            color: navy,
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text('INVESTPROP',
                    style: pw.TextStyle(
                        color: gold,
                        fontSize: 18,
                        fontWeight: pw.FontWeight.bold)),
                pw.SizedBox(height: 4),
                pw.Text('IT3 Income Summary — Tax Year ${c.taxYear}',
                    style: const pw.TextStyle(
                        color: PdfColors.white, fontSize: 12)),
              ],
            ),
          ),
          pw.SizedBox(height: 16),
          kv('Investor', c.investorName),
          if (c.investorCode.isNotEmpty) kv('Investor code', c.investorCode),
          kv('Period',
              '${Fmt.date(c.periodStart)} – ${Fmt.date(c.periodEnd)}'),
          kv('Generated', Fmt.date(c.generatedAt)),
          pw.SizedBox(height: 16),
          pw.Text('Income by classification',
              style: pw.TextStyle(
                  fontSize: 12, fontWeight: pw.FontWeight.bold, color: navy)),
          pw.SizedBox(height: 8),
          pw.TableHelper.fromTextArray(
            headers: ['Classification', 'Payouts', 'Gross', 'Tax', 'Net'],
            headerStyle: pw.TextStyle(
                fontSize: 9, fontWeight: pw.FontWeight.bold, color: PdfColors.white),
            headerDecoration: const pw.BoxDecoration(color: navy),
            cellStyle: const pw.TextStyle(fontSize: 9),
            cellAlignments: {
              0: pw.Alignment.centerLeft,
              1: pw.Alignment.center,
              2: pw.Alignment.centerRight,
              3: pw.Alignment.centerRight,
              4: pw.Alignment.centerRight,
            },
            data: c.buckets
                .map((b) => [
                      b.label,
                      '${b.count}',
                      Fmt.money(b.gross),
                      Fmt.money(b.taxWithheld),
                      Fmt.money(b.net),
                    ])
                .toList(),
          ),
          pw.SizedBox(height: 16),
          pw.Container(
            padding: const pw.EdgeInsets.all(12),
            decoration: pw.BoxDecoration(border: pw.Border.all(color: gold)),
            child: pw.Column(
              children: [
                kv('Total gross', Fmt.money(c.totalGross)),
                kv('Total tax withheld', Fmt.money(c.totalTaxWithheld)),
                kv('Net received', Fmt.money(c.totalNet), bold: true),
              ],
            ),
          ),
          pw.Spacer(),
          pw.Text(c.disclaimer,
              style:
                  const pw.TextStyle(fontSize: 8, color: PdfColors.grey600)),
        ],
      ),
    ),
  );
  return doc;
}
