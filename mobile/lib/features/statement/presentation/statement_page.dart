import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';
import '../../../widgets/async_value_widget.dart';
import '../data/statement_repository.dart';
import '../domain/investor_statement.dart';

/// Investor statement — lifetime position, income and tax withheld.
class StatementPage extends ConsumerStatefulWidget {
  const StatementPage({super.key});

  @override
  ConsumerState<StatementPage> createState() => _StatementPageState();
}

class _StatementPageState extends ConsumerState<StatementPage> {
  bool _exporting = false;

  Future<void> _export(InvestorStatement s) async {
    setState(() => _exporting = true);
    try {
      final doc = await _buildStatementPdf(s);
      final bytes = await doc.save();
      await Printing.sharePdf(
        bytes: bytes,
        filename: 'investor-statement-'
            '${DateTime.now().toIso8601String().substring(0, 10)}.pdf',
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
    final statement = ref.watch(statementProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Investor statement'),
        actions: [
          if (_exporting)
            const Padding(
              padding: EdgeInsets.all(16),
              child: SizedBox(
                height: 18,
                width: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else
            IconButton(
              tooltip: 'Download / share PDF',
              icon: const Icon(Icons.ios_share),
              onPressed: () {
                final s = statement.valueOrNull;
                if (s != null) _export(s);
              },
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(statementProvider.future),
        child: AsyncValueView(
          value: statement,
          onRetry: () => ref.invalidate(statementProvider),
          data: (s) {
            final hasData = s.summary.propertiesInvested > 0 ||
                s.investments.isNotEmpty;
            if (!hasData) {
              return ListView(
                children: const [
                  SizedBox(height: 80),
                  EmptyState(
                    icon: Icons.description_outlined,
                    title: 'Nothing to report yet',
                    subtitle:
                        'Your statement will show positions, income and tax '
                        'once you hold investments.',
                  ),
                ],
              );
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              children: [
                _Header(statement: s),
                const SizedBox(height: 20),
                _SummaryGrid(summary: s.summary),
                const SizedBox(height: 24),
                const _SectionTitle('Investments'),
                const SizedBox(height: 8),
                for (final inv in s.investments) _InvestmentTile(inv: inv),
                if (s.recentPayouts.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  const _SectionTitle('Recent distributions'),
                  const SizedBox(height: 8),
                  for (final p in s.recentPayouts) _PayoutRow(payout: p),
                ],
                const SizedBox(height: 20),
                const _Disclaimer(),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.statement});

  final InvestorStatement statement;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          statement.investorName,
          style: const TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: AppColors.textPrimary,
          ),
        ),
        Text(
          statement.investorEmail,
          style: const TextStyle(color: AppColors.textSecondary),
        ),
        const SizedBox(height: 4),
        Text(
          'Generated ${Fmt.dateTime(statement.generatedAt)}',
          style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
        ),
      ],
    );
  }
}

class _SummaryGrid extends StatelessWidget {
  const _SummaryGrid({required this.summary});

  final StatementSummary summary;

  @override
  Widget build(BuildContext context) {
    final gainPositive = summary.unrealisedGainLoss >= 0;
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [AppColors.navy, AppColors.navyLight],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Current value',
                  style: TextStyle(color: Colors.white70)),
              const SizedBox(height: 6),
              Text(
                Fmt.money(summary.totalCurrentValue),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 30,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '${gainPositive ? '+' : ''}${Fmt.money(summary.unrealisedGainLoss)} '
                '(${Fmt.percent(summary.totalReturn)}) total return',
                style: TextStyle(
                  color: gainPositive ? AppColors.gold : Colors.redAccent,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _StatCard(
                label: 'Total invested',
                value: Fmt.money(summary.totalInvested),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _StatCard(
                label: 'Properties',
                value: '${summary.propertiesInvested}',
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _StatCard(
                label: 'Income received',
                value: Fmt.money(summary.totalDividendsReceived),
                accent: AppColors.success,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _StatCard(
                label: 'Tax withheld',
                value: Fmt.money(summary.totalTaxWithheld),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value, this.accent});

  final String label;
  final String value;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: accent ?? AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 17,
        fontWeight: FontWeight.w700,
        color: AppColors.textPrimary,
      ),
    );
  }
}

class _InvestmentTile extends StatelessWidget {
  const _InvestmentTile({required this.inv});

  final StatementInvestment inv;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            inv.title,
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          if (inv.spvName != null)
            Text(
              inv.spvName!,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.textSecondary,
              ),
            ),
          const SizedBox(height: 10),
          _kv('Invested', Fmt.money(inv.totalInvested)),
          _kv('Current value', Fmt.money(inv.currentValue)),
          _kv('Ownership', Fmt.percent(inv.ownershipPct, decimals: 2)),
          _kv('Income received', Fmt.money(inv.totalDividendsReceived)),
          if (inv.totalTaxWithheld > 0)
            _kv('Tax withheld', Fmt.money(inv.totalTaxWithheld)),
        ],
      ),
    );
  }

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(k,
                style: const TextStyle(
                    color: AppColors.textSecondary, fontSize: 13)),
            Text(
              v,
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
                fontSize: 13,
              ),
            ),
          ],
        ),
      );
}

class _PayoutRow extends StatelessWidget {
  const _PayoutRow({required this.payout});

  final StatementPayout payout;

  @override
  Widget build(BuildContext context) {
    final paid = payout.isPaid;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(
            paid ? Icons.payments_outlined : Icons.schedule,
            size: 20,
            color: paid ? AppColors.success : AppColors.warning,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  payout.typeLabel,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
                Text(
                  '${paid ? 'Paid' : 'Pending'} · ${Fmt.date(payout.date)}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          Text(
            Fmt.money(payout.net, detailed: true),
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

class _Disclaimer extends StatelessWidget {
  const _Disclaimer();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: const Text(
        'This statement is for your records only. It is not a tax certificate '
        'and not audited financial statements under the Companies Act.',
        style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
      ),
    );
  }
}

Future<pw.Document> _buildStatementPdf(InvestorStatement s) async {
  final doc = pw.Document();
  final navy = PdfColor.fromInt(0xFF0B2545);
  final grey = PdfColor.fromInt(0xFF64748B);
  final sum = s.summary;

  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(32),
      build: (context) => [
        pw.Text('Investor Statement',
            style: pw.TextStyle(
                fontSize: 22, fontWeight: pw.FontWeight.bold, color: navy)),
        pw.SizedBox(height: 4),
        pw.Text(s.investorName,
            style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold)),
        pw.Text(s.investorEmail,
            style: pw.TextStyle(fontSize: 11, color: grey)),
        pw.Text('Generated ${Fmt.dateTime(s.generatedAt)}',
            style: pw.TextStyle(fontSize: 10, color: grey)),
        pw.SizedBox(height: 16),
        pw.Divider(color: navy),
        pw.SizedBox(height: 8),
        _pdfRow('Total invested', Fmt.money(sum.totalInvested)),
        _pdfRow('Current value', Fmt.money(sum.totalCurrentValue)),
        _pdfRow('Unrealised gain/loss', Fmt.money(sum.unrealisedGainLoss)),
        _pdfRow('Total return', Fmt.percent(sum.totalReturn)),
        _pdfRow('Income received', Fmt.money(sum.totalDividendsReceived)),
        _pdfRow('Tax withheld', Fmt.money(sum.totalTaxWithheld)),
        _pdfRow('Properties', '${sum.propertiesInvested}'),
        pw.SizedBox(height: 18),
        pw.Text('Investments',
            style: pw.TextStyle(
                fontSize: 14, fontWeight: pw.FontWeight.bold, color: navy)),
        pw.SizedBox(height: 6),
        if (s.investments.isEmpty)
          pw.Text('No investments on record.',
              style: pw.TextStyle(color: grey, fontSize: 10))
        else
          pw.TableHelper.fromTextArray(
            headerStyle: pw.TextStyle(
                fontWeight: pw.FontWeight.bold, color: PdfColors.white),
            headerDecoration: pw.BoxDecoration(color: navy),
            cellStyle: const pw.TextStyle(fontSize: 9),
            headers: const [
              'Property',
              'Invested',
              'Current',
              'Ownership',
              'Income',
              'Tax'
            ],
            data: [
              for (final inv in s.investments)
                [
                  inv.title,
                  Fmt.money(inv.totalInvested),
                  Fmt.money(inv.currentValue),
                  Fmt.percent(inv.ownershipPct, decimals: 2),
                  Fmt.money(inv.totalDividendsReceived),
                  Fmt.money(inv.totalTaxWithheld),
                ],
            ],
          ),
        if (s.recentPayouts.isNotEmpty) ...[
          pw.SizedBox(height: 18),
          pw.Text('Recent distributions',
              style: pw.TextStyle(
                  fontSize: 14, fontWeight: pw.FontWeight.bold, color: navy)),
          pw.SizedBox(height: 6),
          pw.TableHelper.fromTextArray(
            headerStyle: pw.TextStyle(
                fontWeight: pw.FontWeight.bold, color: PdfColors.white),
            headerDecoration: pw.BoxDecoration(color: navy),
            cellStyle: const pw.TextStyle(fontSize: 9),
            headers: const ['Date', 'Type', 'Gross', 'Tax', 'Net', 'Status'],
            data: [
              for (final p in s.recentPayouts)
                [
                  Fmt.date(p.date),
                  p.typeLabel,
                  Fmt.money(p.gross),
                  Fmt.money(p.taxWithheld),
                  Fmt.money(p.net),
                  p.isPaid ? 'Paid' : 'Pending',
                ],
            ],
          ),
        ],
        pw.SizedBox(height: 24),
        pw.Text(
          'This statement is for your records only. It is not a tax '
          'certificate and not audited financial statements under the '
          'Companies Act.',
          style: pw.TextStyle(fontSize: 8, color: grey),
        ),
      ],
    ),
  );
  return doc;
}

pw.Widget _pdfRow(String k, String v) => pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 2),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(k, style: const pw.TextStyle(fontSize: 11)),
          pw.Text(v,
              style:
                  pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold)),
        ],
      ),
    );
