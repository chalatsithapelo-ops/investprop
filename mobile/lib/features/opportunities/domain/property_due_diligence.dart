import '../../../core/format.dart';
import 'development_due_diligence.dart';

/// Type-agnostic due-diligence pack for flip & rental opportunities — the
/// professional team, statutory approvals/consents and supporting documents,
/// without the greenfield development economics. Returned by
/// `getPropertyDueDiligence`; null when nothing has been captured yet.
class PropertyDueDiligence {
  PropertyDueDiligence({
    required this.propertyType,
    required this.professionals,
    required this.professionalsSummary,
    required this.approvals,
    required this.approvalsSummary,
    required this.documentsPack,
  });

  final String propertyType;
  final List<DdProfessional> professionals;
  final DdCountSummary professionalsSummary;
  final List<DdApproval> approvals;
  final DdCountSummary approvalsSummary;
  final List<DdDocument> documentsPack;

  factory PropertyDueDiligence.fromJson(Map<String, dynamic> j) {
    List<T> list<T>(dynamic raw, T Function(Map<String, dynamic>) f) =>
        raw is List
        ? raw
              .whereType<Map>()
              .map((e) => f(Map<String, dynamic>.from(e)))
              .toList()
        : <T>[];

    return PropertyDueDiligence(
      propertyType: asString(j['propertyType'], 'property'),
      professionals: list(j['professionals'], DdProfessional.fromJson),
      professionalsSummary: DdCountSummary.fromJson(
        Map<String, dynamic>.from(j['professionalsSummary'] as Map? ?? {}),
      ),
      approvals: list(j['approvals'], DdApproval.fromJson),
      approvalsSummary: DdCountSummary.fromJson(
        Map<String, dynamic>.from(j['approvalsSummary'] as Map? ?? {}),
      ),
      documentsPack: list(j['documentsPack'], DdDocument.fromJson),
    );
  }
}
