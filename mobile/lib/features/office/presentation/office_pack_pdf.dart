import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../../core/format.dart';
import '../domain/office_models.dart';

const _disclaimer =
    'Research-only office output. Not a certified statement, tax return or legal '
    'document. Have a registered professional review before you rely on it.';

/// Flatten arbitrary nested office-task output into dot-path field/value rows so
/// any pack shape (accountant pack, owner checklist, reminder) renders as a
/// clean table. Tolerant of unknown shapes — it never throws on odd data.
void _flatten(dynamic value, String prefix, List<List<String>> out) {
  if (value == null) {
    out.add([prefix.isEmpty ? 'value' : prefix, '']);
    return;
  }
  if (value is Map) {
    if (value.isEmpty) {
      out.add([prefix.isEmpty ? 'value' : prefix, '(empty)']);
      return;
    }
    value.forEach((k, v) {
      final key = prefix.isEmpty ? '$k' : '$prefix.$k';
      _flatten(v, key, out);
    });
    return;
  }
  if (value is List) {
    if (value.isEmpty) {
      out.add([prefix.isEmpty ? 'value' : prefix, '(empty)']);
      return;
    }
    for (var i = 0; i < value.length; i++) {
      _flatten(value[i], '$prefix[$i]', out);
    }
    return;
  }
  out.add([prefix.isEmpty ? 'value' : prefix, '$value']);
}

/// Build a print/share-ready PDF pack for a completed office task.
Future<pw.Document> buildOfficePackPdf(OfficeTask task) async {
  final doc = pw.Document();
  const navy = PdfColor.fromInt(0xFF0B2545);
  const gold = PdfColor.fromInt(0xFFC8A24A);

  final rows = <List<String>>[];
  _flatten(task.result, '', rows);
  final generated = Fmt.dateTime(DateTime.now());

  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(32),
      build: (context) => [
        pw.Container(
          padding: const pw.EdgeInsets.only(bottom: 10),
          decoration: const pw.BoxDecoration(
            border: pw.Border(bottom: pw.BorderSide(color: gold, width: 1.5)),
          ),
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Text(
                'INVESTPROP',
                style: pw.TextStyle(
                  color: navy,
                  fontSize: 18,
                  fontWeight: pw.FontWeight.bold,
                  letterSpacing: 2,
                ),
              ),
              pw.SizedBox(height: 2),
              pw.Text(
                'AI PROPERTY OFFICE — ${task.kind.replaceAll('_', ' ')}',
                style: pw.TextStyle(
                  color: gold,
                  fontSize: 10,
                  fontWeight: pw.FontWeight.bold,
                  letterSpacing: 2,
                ),
              ),
            ],
          ),
        ),
        pw.SizedBox(height: 12),
        pw.Text(
          task.title,
          style: pw.TextStyle(
            color: navy,
            fontSize: 15,
            fontWeight: pw.FontWeight.bold,
          ),
        ),
        pw.SizedBox(height: 2),
        pw.Text(
          'Generated $generated  •  Task ${task.id}  •  ${task.status}',
          style: const pw.TextStyle(color: PdfColors.grey600, fontSize: 9),
        ),
        pw.SizedBox(height: 14),
        if (rows.isEmpty)
          pw.Text(
            'No pack output available.',
            style: const pw.TextStyle(fontSize: 10),
          )
        else
          pw.Table(
            border: pw.TableBorder(
              bottom: pw.BorderSide(color: PdfColors.grey300),
              horizontalInside: pw.BorderSide(color: PdfColors.grey300),
            ),
            columnWidths: const {
              0: pw.FlexColumnWidth(42),
              1: pw.FlexColumnWidth(58),
            },
            children: [
              for (final r in rows)
                pw.TableRow(
                  children: [
                    pw.Padding(
                      padding: const pw.EdgeInsets.symmetric(
                        vertical: 4,
                        horizontal: 4,
                      ),
                      child: pw.Text(
                        r[0],
                        style: pw.TextStyle(
                          color: PdfColors.grey700,
                          fontSize: 9,
                          fontWeight: pw.FontWeight.bold,
                        ),
                      ),
                    ),
                    pw.Padding(
                      padding: const pw.EdgeInsets.symmetric(
                        vertical: 4,
                        horizontal: 4,
                      ),
                      child: pw.Text(
                        r[1],
                        style: const pw.TextStyle(fontSize: 9),
                      ),
                    ),
                  ],
                ),
            ],
          ),
        pw.SizedBox(height: 18),
        pw.Container(
          padding: const pw.EdgeInsets.all(10),
          decoration: pw.BoxDecoration(
            color: const PdfColor.fromInt(0xFFFFF7ED),
            border: pw.Border.all(color: const PdfColor.fromInt(0xFFFED7AA)),
            borderRadius: pw.BorderRadius.circular(6),
          ),
          child: pw.Text(
            _disclaimer,
            style: const pw.TextStyle(
              color: PdfColor.fromInt(0xFF9A3412),
              fontSize: 9,
            ),
          ),
        ),
      ],
    ),
  );
  return doc;
}
