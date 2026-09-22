import '../../../core/format.dart';

/// FICA / KYC supporting document types accepted by `submitKYCProfile`.
enum KycDocType {
  idDocument('ID_DOCUMENT', 'ID Document / Passport', true,
      'Certified copy of your SA ID or valid passport'),
  proofOfAddress('PROOF_OF_ADDRESS', 'Proof of Address', true,
      'Utility bill or bank statement, not older than 3 months'),
  bankStatement('BANK_STATEMENT', 'Bank Confirmation Letter', false,
      'Letter from your bank confirming your account details'),
  taxNumber('TAX_NUMBER', 'Tax Clearance / Number', false,
      'SARS tax clearance certificate or tax number'),
  companyRegistration('COMPANY_REGISTRATION', 'Company Registration', false,
      'CIPC registration documents (if investing as an entity)');

  const KycDocType(this.wire, this.label, this.required, this.description);

  final String wire;
  final String label;
  final bool required;
  final String description;

  static KycDocType? fromWire(String? value) {
    for (final t in KycDocType.values) {
      if (t.wire == value) return t;
    }
    return null;
  }
}

/// A submitted KYC document with its review status.
class KycDocument {
  const KycDocument({
    required this.id,
    required this.type,
    required this.status,
    required this.url,
    required this.reviewNotes,
    required this.createdAt,
  });

  final int id;
  final KycDocType? type;
  final String status; // PENDING | APPROVED | REJECTED
  final String url;
  final String? reviewNotes;
  final DateTime? createdAt;

  bool get isApproved => status == 'APPROVED';
  bool get isRejected => status == 'REJECTED';
  bool get isPending => status == 'PENDING';

  factory KycDocument.fromJson(Map<String, dynamic> json) {
    return KycDocument(
      id: asInt(json['id']),
      type: KycDocType.fromWire(json['documentType']?.toString()),
      status: asString(json['status'], 'PENDING'),
      url: asString(json['documentUrl']),
      reviewNotes: json['reviewNotes']?.toString(),
      createdAt: asDate(json['createdAt']),
    );
  }
}

/// The investor's KYC profile (personal details) + documents
/// (`getKYCProfile`).
class KycProfile {
  const KycProfile({
    required this.fullName,
    required this.idNumber,
    required this.phoneNumber,
    required this.residentialAddress,
    required this.city,
    required this.province,
    required this.postalCode,
    required this.submittedAt,
    required this.ficaVerified,
    required this.ficaRejectedReason,
    required this.documents,
  });

  final String? fullName;
  final String? idNumber;
  final String? phoneNumber;
  final String? residentialAddress;
  final String? city;
  final String? province;
  final String? postalCode;
  final DateTime? submittedAt;
  final bool ficaVerified;
  final String? ficaRejectedReason;
  final List<KycDocument> documents;

  bool get isSubmitted => submittedAt != null;

  KycDocument? documentFor(KycDocType type) {
    for (final d in documents) {
      if (d.type == type) return d;
    }
    return null;
  }

  factory KycProfile.fromJson(dynamic json) {
    final map = json is Map ? Map<String, dynamic>.from(json) : <String, dynamic>{};
    final profile = map['profile'] is Map
        ? Map<String, dynamic>.from(map['profile'] as Map)
        : <String, dynamic>{};
    final docsRaw = map['documents'];
    final documents = docsRaw is List
        ? docsRaw
            .whereType<Map>()
            .map((e) => KycDocument.fromJson(Map<String, dynamic>.from(e)))
            .toList()
        : <KycDocument>[];
    return KycProfile(
      fullName: profile['name']?.toString(),
      idNumber: profile['idNumber']?.toString(),
      phoneNumber: profile['phoneNumber']?.toString(),
      residentialAddress: profile['residentialAddress']?.toString(),
      city: profile['city']?.toString(),
      province: profile['province']?.toString(),
      postalCode: profile['postalCode']?.toString(),
      submittedAt: asDate(profile['kycSubmittedAt']),
      ficaVerified: profile['ficaVerified'] == true,
      ficaRejectedReason: profile['ficaRejectedReason']?.toString(),
      documents: documents,
    );
  }
}
