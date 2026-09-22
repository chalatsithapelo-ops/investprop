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
  });

  final int id;
  final String category;
  final String documentType;
  final String status;
  final String? documentUrl;
  final String propertyTitle;
  final DateTime? createdAt;

  String get typeLabel => documentType
      .split('_')
      .map((w) => w.isEmpty ? w : w[0] + w.substring(1).toLowerCase())
      .join(' ');

  factory InvestorDocument.fromJson(
    Map<String, dynamic> json,
    String category,
  ) {
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
    );
  }
}

class DocumentsResult {
  const DocumentsResult({required this.groups});

  /// Ordered map of category label → documents.
  final List<MapEntry<String, List<InvestorDocument>>> groups;

  bool get isEmpty => groups.every((g) => g.value.isEmpty);

  factory DocumentsResult.fromJson(Map<String, dynamic> json) {
    List<InvestorDocument> parse(String key, String label) {
      final list = json[key] as List? ?? const [];
      return list
          .whereType<Map>()
          .map((e) =>
              InvestorDocument.fromJson(Map<String, dynamic>.from(e), label))
          .toList();
    }

    final groups = <MapEntry<String, List<InvestorDocument>>>[
      MapEntry('Share certificates', parse('shareCertificates', 'Share certificate')),
      MapEntry('Tax certificates', parse('taxCertificates', 'Tax certificate')),
      MapEntry('Distribution statements',
          parse('distributionStatements', 'Distribution statement')),
      MapEntry('Company documents', parse('companyDocs', 'Company document')),
      MapEntry('Compliance reports',
          parse('complianceReports', 'Compliance report')),
    ]..removeWhere((g) => g.value.isEmpty);

    return DocumentsResult(groups: groups);
  }
}
