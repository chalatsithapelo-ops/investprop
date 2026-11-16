import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../config/theme.dart';
import '../../../core/financial_calculations.dart';
import '../../../core/projected_statements.dart';

/// Read-only "Projected Financial Statements" panel — income statement, cash
/// flow statement and balance sheet with each projection period as a column.
/// Mirrors the web `ProjectedStatementsView` for every property type.
class ProjectedStatementsPanel extends StatefulWidget {
  const ProjectedStatementsPanel({super.key, required this.data});

  final ProjectedStatements data;

  @override
  State<ProjectedStatementsPanel> createState() =>
      _ProjectedStatementsPanelState();
}

class _ProjectedStatementsPanelState extends State<ProjectedStatementsPanel> {
  int _tab = 0;

  static final _grouping = NumberFormat('#,##0', 'en_ZA');

  String _r(double n) {
    final v = n.isFinite ? n.round() : 0;
    final s = _grouping.format(v.abs());
    return v < 0 ? '(R$s)' : 'R$s';
  }

  @override
  Widget build(BuildContext context) {
    final data = widget.data;
    final periods = data.periods;

    final tabs = <_StatementTab>[
      const _StatementTab('Income Statement', Icons.insert_chart_outlined, _incomeRows),
      const _StatementTab('Cash Flow', Icons.account_balance_wallet_outlined, _cashflowRows),
      const _StatementTab('Balance Sheet', Icons.balance_outlined, _balanceRows),
    ];
    final active = tabs[_tab];

    String subtitle;
    if (data.type == StatementType.development) {
      subtitle = data.developmentType == DevelopmentType.affordableResale
          ? 'Greenfield development — build & sell'
          : 'Greenfield development — build & hold';
    } else if (data.type == StatementType.flip) {
      subtitle = 'Buy, renovate & resell';
    } else {
      subtitle = 'Buy-to-let hold';
    }
    final periodicityLabel =
        data.periodicity == 'annual' ? 'annual periods' : 'project phases';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.insert_chart_outlined,
                    size: 20, color: AppColors.gold),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Projected Financial Statements',
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
            Text(
              '$subtitle · ZAR · $periodicityLabel · indicative projection',
              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 14),
            if (periods.isEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.navy.withValues(alpha: 0.02),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.border),
                ),
                child: const Text(
                  'Not enough financial inputs have been captured yet to '
                  'project the statements.',
                  style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
              )
            else ...[
              // Statement selector
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (var i = 0; i < tabs.length; i++)
                    _TabChip(
                      label: tabs[i].label,
                      icon: tabs[i].icon,
                      selected: i == _tab,
                      onTap: () => setState(() => _tab = i),
                    ),
                ],
              ),
              const SizedBox(height: 14),
              _StatementTable(
                statementLabel: active.label,
                rows: active.rows,
                periods: periods,
                format: _r,
              ),
              const SizedBox(height: 14),
              if (data.assumptions.isNotEmpty) ...[
                const _SectionLabel('Key assumptions'),
                ...data.assumptions.map(
                  (a) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            a.label,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Text(
                          a.value,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

typedef _RowGetter = double Function(StatementPeriod p);

class _StatementRow {
  const _StatementRow(
    this.label,
    this.get, {
    this.bold = false,
    this.indent = false,
    this.topBorder = false,
  });

  final String label;
  final _RowGetter get;
  final bool bold;
  final bool indent;
  final bool topBorder;
}

const List<_StatementRow> _incomeRows = [
  _StatementRow('Revenue', _gRevenue),
  _StatementRow('Cost of sales', _gNegCogs, indent: true),
  _StatementRow('Gross profit', _gGrossProfit, bold: true, topBorder: true),
  _StatementRow('Operating expenses', _gNegOpex, indent: true),
  _StatementRow('Depreciation', _gNegDepr, indent: true),
  _StatementRow('Operating profit (EBIT)', _gEbit, bold: true, topBorder: true),
  _StatementRow('Finance costs (interest)', _gNegInterest, indent: true),
  _StatementRow('Profit before tax', _gPbt, bold: true, topBorder: true),
  _StatementRow('Taxation', _gNegTax, indent: true),
  _StatementRow('Net profit', _gNetProfit, bold: true, topBorder: true),
];

const List<_StatementRow> _cashflowRows = [
  _StatementRow('Cash from operations', _gCfo),
  _StatementRow('Cash from investing', _gCfi),
  _StatementRow('Cash from financing', _gCff),
  _StatementRow('Net change in cash', _gNetCash, bold: true, topBorder: true),
  _StatementRow('Opening cash', _gOpeningCash, indent: true),
  _StatementRow('Closing cash', _gClosingCash, bold: true, topBorder: true),
];

const List<_StatementRow> _balanceRows = [
  _StatementRow('Property / development asset', _gPropertyAsset, indent: true),
  _StatementRow('Cash', _gCash, indent: true),
  _StatementRow('Total assets', _gTotalAssets, bold: true, topBorder: true),
  _StatementRow('Interest-bearing debt', _gDebt, indent: true),
  _StatementRow('Total liabilities', _gTotalLiabilities, bold: true, topBorder: true),
  _StatementRow('Contributed equity', _gContributed, indent: true),
  _StatementRow('Retained earnings', _gRetained, indent: true),
  _StatementRow('Total equity', _gTotalEquity, bold: true, topBorder: true),
];

double _gRevenue(StatementPeriod p) => p.revenue;
double _gNegCogs(StatementPeriod p) => -p.costOfSales;
double _gGrossProfit(StatementPeriod p) => p.grossProfit;
double _gNegOpex(StatementPeriod p) => -p.operatingExpenses;
double _gNegDepr(StatementPeriod p) => -p.depreciation;
double _gEbit(StatementPeriod p) => p.operatingProfit;
double _gNegInterest(StatementPeriod p) => -p.interest;
double _gPbt(StatementPeriod p) => p.profitBeforeTax;
double _gNegTax(StatementPeriod p) => -p.tax;
double _gNetProfit(StatementPeriod p) => p.netProfit;
double _gCfo(StatementPeriod p) => p.cashFromOperations;
double _gCfi(StatementPeriod p) => p.cashFromInvesting;
double _gCff(StatementPeriod p) => p.cashFromFinancing;
double _gNetCash(StatementPeriod p) => p.netCashFlow;
double _gOpeningCash(StatementPeriod p) => p.openingCash;
double _gClosingCash(StatementPeriod p) => p.closingCash;
double _gPropertyAsset(StatementPeriod p) => p.propertyAsset;
double _gCash(StatementPeriod p) => p.cash;
double _gTotalAssets(StatementPeriod p) => p.totalAssets;
double _gDebt(StatementPeriod p) => p.debt;
double _gTotalLiabilities(StatementPeriod p) => p.totalLiabilities;
double _gContributed(StatementPeriod p) => p.contributedEquity;
double _gRetained(StatementPeriod p) => p.retainedEarnings;
double _gTotalEquity(StatementPeriod p) => p.totalEquity;

class _StatementTab {
  const _StatementTab(this.label, this.icon, this.rows);
  final String label;
  final IconData icon;
  final List<_StatementRow> rows;
}

class _StatementTable extends StatelessWidget {
  const _StatementTable({
    required this.statementLabel,
    required this.rows,
    required this.periods,
    required this.format,
  });

  final String statementLabel;
  final List<_StatementRow> rows;
  final List<StatementPeriod> periods;
  final String Function(double) format;

  @override
  Widget build(BuildContext context) {
    const labelWidth = 170.0;
    const periodWidth = 110.0;

    Widget headerCell(String text, {required bool isLabel}) => Container(
          width: isLabel ? labelWidth : periodWidth,
          padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
          alignment: isLabel ? Alignment.centerLeft : Alignment.centerRight,
          child: Text(
            text.toUpperCase(),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
              color: AppColors.textSecondary,
            ),
          ),
        );

    Widget dataRow(_StatementRow row) {
      final style = TextStyle(
        fontSize: 12,
        fontWeight: row.bold ? FontWeight.w700 : FontWeight.w400,
        color: row.bold ? AppColors.textPrimary : AppColors.textSecondary,
      );
      return Container(
        decoration: BoxDecoration(
          border: row.topBorder
              ? const Border(top: BorderSide(color: AppColors.border))
              : null,
        ),
        child: Row(
          children: [
            Container(
              width: labelWidth,
              padding: EdgeInsets.fromLTRB(row.indent ? 14 : 4, 6, 4, 6),
              alignment: Alignment.centerLeft,
              child: Text(row.label, style: style),
            ),
            for (final p in periods)
              Container(
                width: periodWidth,
                padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
                alignment: Alignment.centerRight,
                child: Text(
                  format(row.get(p)),
                  style: style.copyWith(
                    color: row.get(p) < 0 ? AppColors.danger : style.color,
                  ),
                ),
              ),
          ],
        ),
      );
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              headerCell(statementLabel, isLabel: true),
              for (final p in periods) headerCell(p.label, isLabel: false),
            ],
          ),
          const Divider(height: 1, color: AppColors.border),
          ...rows.map(dataRow),
        ],
      ),
    );
  }
}

class _TabChip extends StatelessWidget {
  const _TabChip({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.gold
              : AppColors.navy.withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: selected ? AppColors.gold : AppColors.border,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                size: 15,
                color: selected ? Colors.white : AppColors.textSecondary),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: selected ? Colors.white : AppColors.textSecondary,
              ),
            ),
          ],
        ),
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
