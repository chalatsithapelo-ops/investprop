import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../../investment/domain/compliance_status.dart';
import '../domain/kyc_models.dart';

/// A document ready to be attached to a KYC submission.
class KycUpload {
  const KycUpload({
    required this.type,
    required this.documentUrl,
    required this.fileName,
  });

  final KycDocType type;
  final String documentUrl;
  final String fileName;

  Map<String, dynamic> toInput() => {
    'documentType': type.wire,
    'documentUrl': documentUrl,
    'fileName': fileName,
  };
}

/// Personal details required by `submitKYCProfile`.
class KycDetails {
  const KycDetails({
    required this.fullName,
    required this.idNumber,
    required this.dateOfBirth,
    required this.phoneNumber,
    required this.residentialAddress,
    required this.city,
    required this.province,
    required this.postalCode,
    this.taxNumber,
    this.companyName,
    this.companyRegNumber,
  });

  final String fullName;
  final String idNumber;
  final String dateOfBirth; // ISO date string
  final String phoneNumber;
  final String residentialAddress;
  final String city;
  final String province;
  final String postalCode;
  final String? taxNumber;
  final String? companyName;
  final String? companyRegNumber;

  Map<String, dynamic> toInput() => {
    'fullName': fullName,
    'idNumber': idNumber,
    'dateOfBirth': dateOfBirth,
    'phoneNumber': phoneNumber,
    'residentialAddress': residentialAddress,
    'city': city,
    'province': province,
    'postalCode': postalCode,
    if (taxNumber != null && taxNumber!.isNotEmpty) 'taxNumber': taxNumber,
    if (companyName != null && companyName!.isNotEmpty) 'companyName': companyName,
    if (companyRegNumber != null && companyRegNumber!.isNotEmpty)
      'companyRegNumber': companyRegNumber,
  };
}

class KycRepository {
  KycRepository(this._client);

  final TrpcClient _client;

  Future<KycProfile> profile() async {
    final data = await _client.query('getKYCProfile');
    return KycProfile.fromJson(data);
  }

  Future<FicaStatus> ficaStatus() async {
    final data = await _client.query('getMyFicaStatus');
    return FicaStatus.fromJson(data);
  }

  /// Uploads a file (base64, no data-URI prefix) and returns its public URL.
  Future<String> uploadFile({
    required String fileName,
    required String fileType,
    required String base64,
  }) async {
    final data = await _client.mutation(
      'uploadFile',
      input: {
        'fileName': fileName,
        'fileType': fileType,
        'fileBase64': base64,
      },
    );
    if (data is Map && data['publicUrl'] != null) {
      return data['publicUrl'].toString();
    }
    throw StateError('Upload failed. Please try again.');
  }

  Future<int> submitProfile({
    required KycDetails details,
    required List<KycUpload> documents,
  }) async {
    final data = await _client.mutation(
      'submitKYCProfile',
      input: {
        ...details.toInput(),
        'documents': documents.map((d) => d.toInput()).toList(),
      },
    );
    if (data is Map && data['documentsSubmitted'] != null) {
      final n = data['documentsSubmitted'];
      return n is num ? n.toInt() : documents.length;
    }
    return documents.length;
  }
}

final kycRepositoryProvider = Provider<KycRepository>((ref) {
  return KycRepository(ref.watch(trpcClientProvider));
});

final kycProfileProvider = FutureProvider.autoDispose<KycProfile>((ref) async {
  return ref.watch(kycRepositoryProvider).profile();
});

final myFicaStatusProvider = FutureProvider.autoDispose<FicaStatus>((ref) async {
  return ref.watch(kycRepositoryProvider).ficaStatus();
});
