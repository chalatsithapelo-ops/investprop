import 'package:equatable/equatable.dart';

import '../../../core/format.dart';

/// A share certificate proving fractional ownership in a property.
class ShareCertificate extends Equatable {
  const ShareCertificate({
    required this.id,
    required this.certificateNumber,
    required this.propertyId,
    required this.propertyTitle,
    required this.propertyAddress,
    required this.investorName,
    required this.numberOfShares,
    required this.sharePrice,
    required this.totalValue,
    required this.ownershipPercentage,
    required this.shareClassName,
    required this.isValid,
    required this.issueDate,
    this.imageUrl,
    this.propertyStatus,
  });

  final int id;
  final String certificateNumber;
  final int propertyId;
  final String propertyTitle;
  final String propertyAddress;
  final String investorName;
  final double numberOfShares;
  final double sharePrice;
  final double totalValue;
  final double ownershipPercentage;
  final String shareClassName;
  final bool isValid;
  final DateTime? issueDate;
  final String? imageUrl;
  final String? propertyStatus;

  factory ShareCertificate.fromJson(Map<String, dynamic> json) {
    final property = json['property'] is Map
        ? Map<String, dynamic>.from(json['property'] as Map)
        : const <String, dynamic>{};
    return ShareCertificate(
      id: asInt(json['id']),
      certificateNumber: asString(json['certificateNumber']),
      propertyId: asInt(json['propertyId']),
      propertyTitle: asString(json['propertyTitle']),
      propertyAddress: asString(json['propertyAddress']),
      investorName: asString(json['investorName']),
      numberOfShares: asDouble(json['numberOfShares']),
      sharePrice: asDouble(json['sharePrice']),
      totalValue: asDouble(json['totalValue']),
      ownershipPercentage: asDouble(json['ownershipPercentage']),
      shareClassName: asString(json['shareClassName'], 'Ordinary'),
      isValid: json['isValid'] == true,
      issueDate: asDate(json['issueDate']),
      imageUrl: property['imageUrl']?.toString(),
      propertyStatus: property['status']?.toString(),
    );
  }

  @override
  List<Object?> get props => [id, certificateNumber];
}

/// Rich data returned by `getCertificatePDFData` used to render the PDF.
class CertificatePdfData {
  const CertificatePdfData({
    required this.certificateNumber,
    required this.investorName,
    required this.investorCode,
    required this.propertyTitle,
    required this.propertyAddress,
    required this.numberOfShares,
    required this.sharePrice,
    required this.totalValue,
    required this.ownershipPercentage,
    required this.shareClassName,
    required this.issueDate,
    required this.isValid,
    required this.validationHash,
    required this.spvName,
    required this.spvRegistrationNumber,
    required this.copyNumber,
    required this.documentSerial,
    required this.downloadTimestamp,
    required this.paymentReference,
  });

  final String certificateNumber;
  final String investorName;
  final String investorCode;
  final String propertyTitle;
  final String propertyAddress;
  final double numberOfShares;
  final double sharePrice;
  final double totalValue;
  final double ownershipPercentage;
  final String shareClassName;
  final DateTime? issueDate;
  final bool isValid;
  final String validationHash;
  final String? spvName;
  final String? spvRegistrationNumber;
  final int copyNumber;
  final String documentSerial;
  final DateTime? downloadTimestamp;
  final String paymentReference;

  factory CertificatePdfData.fromJson(Map<String, dynamic> json) {
    return CertificatePdfData(
      certificateNumber: asString(json['certificateNumber']),
      investorName: asString(json['investorName']),
      investorCode: asString(json['investorCode']),
      propertyTitle: asString(json['propertyTitle']),
      propertyAddress: asString(json['propertyAddress']),
      numberOfShares: asDouble(json['numberOfShares']),
      sharePrice: asDouble(json['sharePrice']),
      totalValue: asDouble(json['totalValue']),
      ownershipPercentage: asDouble(json['ownershipPercentage']),
      shareClassName: asString(json['shareClassName'], 'Ordinary'),
      issueDate: asDate(json['issueDate']),
      isValid: json['isValid'] == true,
      validationHash: asString(json['validationHash']),
      spvName: json['spvName']?.toString(),
      spvRegistrationNumber: json['spvRegistrationNumber']?.toString(),
      copyNumber: asInt(json['copyNumber']),
      documentSerial: asString(json['documentSerial']),
      downloadTimestamp: asDate(json['downloadTimestamp']),
      paymentReference: asString(json['paymentReference'], 'N/A'),
    );
  }
}
