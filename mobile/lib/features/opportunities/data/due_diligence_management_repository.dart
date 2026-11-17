import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';

// Wire values from development-management.ts, not display labels.
const ddProfessionalRoles = [
  'TOWN_PLANNER',
  'ARCHITECT',
  'QUANTITY_SURVEYOR',
  'CIVIL_ENGINEER',
  'STRUCTURAL_ENGINEER',
  'ELECTRICAL_ENGINEER',
  'MECHANICAL_ENGINEER',
  'WET_SERVICES_ENGINEER',
  'ENVIRONMENTAL_SPECIALIST',
  'LAND_SURVEYOR',
  'GEOTECHNICAL_ENGINEER',
  'TRAFFIC_ENGINEER',
  'FIRE_CONSULTANT',
  'HEALTH_SAFETY_AGENT',
  'PROJECT_MANAGER',
  'CONVEYANCER',
  'VALUER',
  'OTHER',
];
const ddAppointmentStatuses = [
  'NOT_APPOINTED',
  'SHORTLISTED',
  'APPOINTED',
  'TERMINATED',
];
const ddApprovalTypes = [
  'REZONING',
  'TOWNSHIP_ESTABLISHMENT',
  'SUBDIVISION_CONSOLIDATION',
  'SITE_DEVELOPMENT_PLAN',
  'BUILDING_PLANS',
  'ENVIRONMENTAL_AUTHORISATION',
  'WATER_USE_LICENCE',
  'WATER_LICENCE',
  'GEOTECHNICAL_CLEARANCE',
  'TRAFFIC_IMPACT_APPROVAL',
  'HERITAGE_AUTHORISATION',
  'NHBRC_ENROLMENT',
  'BULK_SERVICES_AGREEMENT',
  'ELECTRICAL_SUPPLY_AGREEMENT',
  'FIRE_APPROVAL',
  'HEALTH_APPROVAL',
  'SG_DIAGRAM_APPROVAL',
  'OCCUPANCY_CERTIFICATE',
  'OTHER',
];
const ddApprovalStatuses = [
  'NOT_STARTED',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'CONDITIONAL',
];

class DueDiligenceManagementData {
  const DueDiligenceManagementData({
    required this.professionals,
    required this.approvals,
    required this.documents,
  });

  final List<Map<String, dynamic>> professionals;
  final List<Map<String, dynamic>> approvals;
  final List<Map<String, dynamic>> documents;
}

/// Property-level registers work for every property type; no development lookup.
class DueDiligenceManagementRepository {
  DueDiligenceManagementRepository(this._client);
  final TrpcClient _client;

  Future<DueDiligenceManagementData> load(int propertyId) async {
    final results = await Future.wait([
      _client.query(
        'getDevelopmentProfessionals',
        input: {'propertyId': propertyId},
      ),
      _client.query(
        'getDevelopmentApprovals',
        input: {'propertyId': propertyId},
      ),
      _client.query('getDocumentsPack', input: {'propertyId': propertyId}),
    ]);
    List<Map<String, dynamic>> rows(dynamic result, String key) =>
        (result[key] as List)
            .map((row) => Map<String, dynamic>.from(row as Map))
            .toList();
    return DueDiligenceManagementData(
      professionals: rows(results[0], 'professionals'),
      approvals: rows(results[1], 'approvals'),
      documents: rows(results[2], 'documents'),
    );
  }

  Future<void> saveProfessional({
    required int propertyId,
    int? professionalId,
    required String role,
    required String status,
    required bool isRequired,
    required double feeAmount,
    String firmName = '',
    String contactName = '',
    String contactEmail = '',
    String contactPhone = '',
    String registrationBody = '',
    String registrationNo = '',
    String notes = '',
  }) async {
    if (!ddProfessionalRoles.contains(role) ||
        !ddAppointmentStatuses.contains(status) ||
        !feeAmount.isFinite ||
        feeAmount < 0) {
      throw ArgumentError('Invalid professional role, status or fee.');
    }
    await _client.mutation(
      professionalId == null
          ? 'createDevelopmentProfessional'
          : 'updateDevelopmentProfessional',
      input: {
        if (professionalId == null) ...{
          'propertyId': propertyId,
          'role': role,
        } else
          'professionalId': professionalId,
        'status': status,
        'isRequired': isRequired,
        'feeAmount': feeAmount,
        'firmName': firmName.trim(),
        'contactName': contactName.trim(),
        // z.string().email().optional() does not accept an empty string.
        if (contactEmail.trim().isNotEmpty) 'contactEmail': contactEmail.trim(),
        'contactPhone': contactPhone.trim(),
        'registrationBody': registrationBody.trim(),
        'registrationNo': registrationNo.trim(),
        // The create handler currently ignores notes; offer them on edit only.
        if (professionalId != null) 'notes': notes.trim(),
      },
    );
  }

  Future<void> saveApproval({
    required int propertyId,
    int? approvalId,
    required String type,
    required String status,
    required bool isRequired,
    String authority = '',
    String reference = '',
    String documentUrl = '',
    String notes = '',
    DateTime? targetDate,
    DateTime? submittedAt,
    DateTime? decisionAt,
  }) async {
    if (!ddApprovalTypes.contains(type) ||
        !ddApprovalStatuses.contains(status)) {
      throw ArgumentError('Invalid approval type or status.');
    }
    await _client.mutation(
      approvalId == null
          ? 'createDevelopmentApproval'
          : 'updateDevelopmentApproval',
      input: {
        if (approvalId == null) ...{
          'propertyId': propertyId,
          'type': type,
          'isRequired': isRequired,
        } else
          'approvalId': approvalId,
        'status': status,
        'authority': authority.trim(),
        'reference': reference.trim(),
        'documentUrl': documentUrl.trim(),
        'notes': notes.trim(),
        if (targetDate != null)
          'targetDate': targetDate.toUtc().toIso8601String(),
        if (approvalId != null && submittedAt != null)
          'submittedAt': submittedAt.toUtc().toIso8601String(),
        if (approvalId != null && decisionAt != null)
          'decisionAt': decisionAt.toUtc().toIso8601String(),
      },
    );
  }

  Future<void> addDocument({
    required int propertyId,
    required String label,
    required String url,
  }) async {
    if (label.trim().isEmpty || !isDocumentUrl(url)) {
      throw ArgumentError('Enter a label and a valid HTTP(S) URL.');
    }
    await _client.mutation(
      'addDocumentToPack',
      input: {
        'propertyId': propertyId,
        'label': label.trim(),
        'url': url.trim(),
      },
    );
  }

  Future<void> removeDocument({
    required int propertyId,
    required String url,
  }) async {
    await _client.mutation(
      'removeDocumentFromPack',
      input: {'propertyId': propertyId, 'url': url},
    );
  }

  Future<String> uploadPhoto({
    required String fileName,
    required Uint8List bytes,
  }) async {
    const types = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp',
      'gif': 'image/gif',
    };
    final mime = types[fileName.split('.').last.toLowerCase()];
    if (mime == null || bytes.isEmpty || bytes.length > 5 * 1024 * 1024) {
      throw ArgumentError('Choose a JPG, PNG, WebP or GIF image, up to 5 MB.');
    }
    final result = await _client.mutation(
      'uploadFile',
      input: {
        'fileName': fileName,
        'fileType': mime,
        'fileBase64': base64Encode(bytes),
      },
    );
    final url = result['publicUrl'];
    if (url is! String || !isDocumentUrl(url)) {
      throw const FormatException(
        'Upload did not return a valid document URL.',
      );
    }
    return url;
  }

  static bool isDocumentUrl(String value) {
    final uri = Uri.tryParse(value.trim());
    return uri != null &&
        (uri.scheme == 'https' || uri.scheme == 'http') &&
        uri.host.isNotEmpty;
  }
}

final dueDiligenceManagementRepositoryProvider =
    Provider<DueDiligenceManagementRepository>(
      (ref) => DueDiligenceManagementRepository(ref.watch(trpcClientProvider)),
    );

final dueDiligenceManagementProvider = FutureProvider.autoDispose
    .family<DueDiligenceManagementData, int>((ref, propertyId) {
      return ref
          .watch(dueDiligenceManagementRepositoryProvider)
          .load(propertyId);
    });
