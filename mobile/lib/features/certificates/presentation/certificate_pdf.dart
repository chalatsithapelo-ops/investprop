import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../../core/format.dart';
import '../domain/certificate.dart';

/// Builds a share-certificate PDF document from the server payload.
Future<pw.Document> buildCertificatePdf(CertificatePdfData d) async {
  final doc = pw.Document();
  const navy = PdfColor.fromInt(0xFF0B2545);
  const gold = PdfColor.fromInt(0xFFC8A24A);

  pw.Widget row(String label, String value) => pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 4),
        child: pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.SizedBox(
              width: 180,
              child: pw.Text(label,
                  style: pw.TextStyle(
                      color: PdfColors.grey700,
                      fontSize: 10,
                      fontWeight: pw.FontWeight.bold)),
            ),
            pw.Expanded(
              child: pw.Text(value, style: const pw.TextStyle(fontSize: 10)),
            ),
          ],
        ),
      );

  doc.addPage(
    pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(32),
      build: (context) => pw.Container(
        decoration: pw.BoxDecoration(
          border: pw.Border.all(color: gold, width: 2),
        ),
        padding: const pw.EdgeInsets.all(24),
        child: pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.stretch,
          children: [
            pw.Container(
              padding: const pw.EdgeInsets.only(bottom: 12),
              decoration: const pw.BoxDecoration(
                border: pw.Border(
                  bottom: pw.BorderSide(color: navy, width: 1),
                ),
              ),
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.center,
                children: [
                  pw.Text('INVESTPROP',
                      style: pw.TextStyle(
                          color: navy,
                          fontSize: 22,
                          fontWeight: pw.FontWeight.bold,
                          letterSpacing: 2)),
                  pw.SizedBox(height: 2),
                  pw.Text('SHARE CERTIFICATE',
                      style: pw.TextStyle(
                          color: gold,
                          fontSize: 13,
                          fontWeight: pw.FontWeight.bold,
                          letterSpacing: 4)),
                ],
              ),
            ),
            pw.SizedBox(height: 16),
            pw.Center(
              child: pw.Text('Certificate No. ${d.certificateNumber}',
                  style: pw.TextStyle(
                      fontSize: 12, fontWeight: pw.FontWeight.bold)),
            ),
            pw.SizedBox(height: 16),
            pw.Text(
              'This certifies that ${d.investorName} (${d.investorCode}) is the '
              'registered holder of the shares described below.',
              style: const pw.TextStyle(fontSize: 11),
            ),
            pw.SizedBox(height: 16),
            row('Property', d.propertyTitle),
            row('Address', d.propertyAddress),
            if (d.spvName != null) row('SPV (legal entity)', d.spvName!),
            if (d.spvRegistrationNumber != null)
              row('SPV registration no.', d.spvRegistrationNumber!),
            row('Share class', d.shareClassName),
            row('Number of shares',
                d.numberOfShares.toStringAsFixed(0)),
            row('Price per share', Fmt.money(d.sharePrice, detailed: true)),
            row('Total value', Fmt.money(d.totalValue, detailed: true)),
            row('Ownership',
                Fmt.percent(d.ownershipPercentage, decimals: 4)),
            row('Issue date', Fmt.date(d.issueDate)),
            row('Payment reference', d.paymentReference),
            pw.Spacer(),
            pw.Container(
              padding: const pw.EdgeInsets.all(10),
              color: PdfColors.grey100,
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text('Verification',
                      style: pw.TextStyle(
                          fontSize: 9, fontWeight: pw.FontWeight.bold)),
                  pw.SizedBox(height: 2),
                  pw.Text('Validation hash: ${d.validationHash}',
                      style: const pw.TextStyle(fontSize: 7)),
                  pw.Text(
                      'Document serial: ${d.documentSerial}  |  Copy #${d.copyNumber}',
                      style: const pw.TextStyle(fontSize: 7)),
                  pw.Text(
                      'Generated: ${Fmt.dateTime(d.downloadTimestamp)}',
                      style: const pw.TextStyle(fontSize: 7)),
                ],
              ),
            ),
            pw.SizedBox(height: 8),
            pw.Text(
              'This certificate is a record of ownership and is not a tradeable '
              'instrument. Fractional property investments carry risk, including '
              'loss of capital, and are illiquid.',
              style: const pw.TextStyle(
                  fontSize: 7, color: PdfColors.grey600),
            ),
          ],
        ),
      ),
    ),
  );

  return doc;
}
