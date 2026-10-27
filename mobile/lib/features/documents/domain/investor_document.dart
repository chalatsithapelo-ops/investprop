import '../../../core/format.dart';

class InvestorDocument {
  const InvestorDocument({
    required this.id,
    required this.category,
    required this.documentType,
    required this.status,
    required this.documentUrl,
    required this.propertyTitle,
    required this.createdAt,
    this.supportsAiSummary = false,
  });

  final int id;
  final String category;
  final String documentType;
  final String status;
  final String? documentUrl;
  final String propertyTitle;
  final DateTime? createdAt;
  final bool supportsAiSummary;

  String get typeLabel => documentType
      .split('_')
      .map((w) => w.isEmpty ? w : w[0] + w.substring(1).toLowerCase())
      .join(' ');

  factory InvestorDocument.fromJson(
    Map<String, dynamic> json,
    String category, {
    bool supportsAiSummary = false,
  }) {
    final property = json['property'] is Map
        ? Map<String, dynamic>.from(json['property'] as Map)
        : const <String, dynamic>{};
    return InvestorDocument(
      id: asInt(json['id']),
      category: category,
      documentType: asString(json['documentType']),
      status: asString(json['status']),
      documentUrl: (json['documentUrl'] as String?)?.isNotEmpty == true
          ? json['documentUrl'] as String
          : null,
      propertyTitle: asString(
        json['propertyTitle'] ?? property['title'],
        'Property',
      ),
      createdAt: asDate(json['createdAt'] ?? json['issueDate']),
      supportsAiSummary: supportsAiSummary,
    );
  }
}

class DocumentsResult {
  const DocumentsResult({required this.groups});

  /// Ordered map of category label → documents.
  final List<MapEntry<String, List<InvestorDocument>>> groups;

  bool get isEmpty => groups.every((g) => g.value.isEmpty);

  factory DocumentsResult.fromJson(Map<String, dynamic> json) {
    List<InvestorDocument> parse(
      String key,
      String label, {
      bool aiCapable = false,
    }) {
      final list = json[key] as List? ?? const [];
      return list
          .whereType<Map>()
          .map(
            (e) => InvestorDocument.fromJson(
              Map<String, dynamic>.from(e),
              label,
              supportsAiSummary: aiCapable,
            ),
          )
          .toList();
    }

    final groups = <MapEntry<String, List<InvestorDocument>>>[
      MapEntry(
        'Share certificates',
        parse('shareCertificates', 'Share certificate'),
      ),
      MapEntry('Tax certificates', parse('taxCertificates', 'Tax certificate')),
      MapEntry(
        'Distribution statements',
        parse('distributionStatements', 'Distribution statement'),
      ),
      MapEntry(
        'Company documents',
        parse('companyDocs', 'Company document', aiCapable: true),
      ),
      MapEntry(
        'Compliance reports',
        parse('complianceReports', 'Compliance report', aiCapable: true),
      ),
    ]..removeWhere((g) => g.value.isEmpty);

    return DocumentsResult(groups: groups);
  }
}

/// AI risk-flag entry attached to a legal document.
class DocumentRiskFlag {
  const DocumentRiskFlag({
    required this.category,
    required this.severity,
    required this.detail,
    required this.recommendation,
  });

  final String category;
  final String severity; // LOW | MODERATE | HIGH
  final String detail;
  final String recommendation;

  factory DocumentRiskFlag.fromJson(Map<String, dynamic> j) => DocumentRiskFlag(
    category: asString(j['category'], 'OTHER'),
    severity: asString(j['severity'], 'MODERATE'),
    detail: asString(j['detail']),
    recommendation: asString(j['recommendation']),
  );
}

/// AI summary + risk register for a legal document (getLegalDocumentSummary).
class DocumentAiSummary {
  const DocumentAiSummary({
    required this.summary,
    required this.riskLevel,
    required this.riskFlags,
    required this.generatedAt,
  });

  final String summary;
  final String riskLevel; // LOW | MODERATE | HIGH
  final List<DocumentRiskFlag> riskFlags;
  final DateTime? generatedAt;

  /// Parses the query result. Returns null when the document has not yet
  /// been analysed (the procedure returns null in that case).
  static DocumentAiSummary? fromJson(dynamic raw) {
    if (raw is! Map) return null;
    final j = Map<String, dynamic>.from(raw);
    if (asString(j['summary']).isEmpty) return null;
    return DocumentAiSummary(
      summary: asString(j['summary']),
      riskLevel: asString(j['riskLevel'], 'MODERATE'),
      riskFlags: (j['riskFlags'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => DocumentRiskFlag.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      generatedAt: asDate(j['generatedAt']),
    );
  }
}
