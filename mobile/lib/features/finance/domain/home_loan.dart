import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../core/format.dart';

/// Lifecycle of a multi-bank home-loan application. Mirrors the backend
/// `HomeLoanApplicationStatus` enum.
enum HomeLoanStatus {
  submitted,
  banksReviewing,
  offersIn,
  accepted,
  declined,
  withdrawn,
}

extension HomeLoanStatusX on HomeLoanStatus {
  static HomeLoanStatus fromWire(String? value) {
    switch ((value ?? '').toUpperCase()) {
      case 'BANKS_REVIEWING':
        return HomeLoanStatus.banksReviewing;
      case 'OFFERS_IN':
        return HomeLoanStatus.offersIn;
      case 'ACCEPTED':
        return HomeLoanStatus.accepted;
      case 'DECLINED':
        return HomeLoanStatus.declined;
      case 'WITHDRAWN':
        return HomeLoanStatus.withdrawn;
      default:
        return HomeLoanStatus.submitted;
    }
  }

  String get label => switch (this) {
        HomeLoanStatus.submitted => 'Submitted',
        HomeLoanStatus.banksReviewing => 'Banks reviewing',
        HomeLoanStatus.offersIn => 'Offers in',
        HomeLoanStatus.accepted => 'Accepted',
        HomeLoanStatus.declined => 'Declined',
        HomeLoanStatus.withdrawn => 'Withdrawn',
      };

  String get description => switch (this) {
        HomeLoanStatus.submitted =>
          'Received — we are handing your application to a bond originator.',
        HomeLoanStatus.banksReviewing =>
          'Your application is with the major banks for a decision.',
        HomeLoanStatus.offersIn =>
          'One or more banks have made an offer. Compare and accept the best one.',
        HomeLoanStatus.accepted => 'You accepted an offer. Congratulations!',
        HomeLoanStatus.declined =>
          'The banks could not approve this application.',
        HomeLoanStatus.withdrawn => 'You withdrew this application.',
      };

  Color get color => switch (this) {
        HomeLoanStatus.submitted => AppColors.textSecondary,
        HomeLoanStatus.banksReviewing => AppColors.navy,
        HomeLoanStatus.offersIn => AppColors.warning,
        HomeLoanStatus.accepted => AppColors.success,
        HomeLoanStatus.declined => AppColors.danger,
        HomeLoanStatus.withdrawn => AppColors.textSecondary,
      };

  /// Ordered milestones shown in the progress tracker.
  static const flow = <HomeLoanStatus>[
    HomeLoanStatus.submitted,
    HomeLoanStatus.banksReviewing,
    HomeLoanStatus.offersIn,
    HomeLoanStatus.accepted,
  ];
}

/// Status of a single bank's offer.
enum HomeLoanOfferStatus { offered, accepted, declined }

extension HomeLoanOfferStatusX on HomeLoanOfferStatus {
  static HomeLoanOfferStatus fromWire(String? value) {
    switch ((value ?? '').toUpperCase()) {
      case 'ACCEPTED':
        return HomeLoanOfferStatus.accepted;
      case 'DECLINED':
        return HomeLoanOfferStatus.declined;
      default:
        return HomeLoanOfferStatus.offered;
    }
  }

  String get label => switch (this) {
        HomeLoanOfferStatus.offered => 'Offered',
        HomeLoanOfferStatus.accepted => 'Accepted',
        HomeLoanOfferStatus.declined => 'Declined',
      };
}

/// Supporting-document types accepted on a home-loan application. Mirrors the
/// backend `HomeLoanDocumentType` enum.
enum HomeLoanDocType {
  payslip,
  bankStatement,
  idDocument,
  proofOfAddress,
  offerToPurchase,
  other,
}

extension HomeLoanDocTypeX on HomeLoanDocType {
  String get wire => switch (this) {
        HomeLoanDocType.payslip => 'PAYSLIP',
        HomeLoanDocType.bankStatement => 'BANK_STATEMENT',
        HomeLoanDocType.idDocument => 'ID_DOCUMENT',
        HomeLoanDocType.proofOfAddress => 'PROOF_OF_ADDRESS',
        HomeLoanDocType.offerToPurchase => 'OFFER_TO_PURCHASE',
        HomeLoanDocType.other => 'OTHER',
      };

  String get label => switch (this) {
        HomeLoanDocType.payslip => 'Payslip (latest 3 months)',
        HomeLoanDocType.bankStatement => 'Bank statement (3 months)',
        HomeLoanDocType.idDocument => 'ID document',
        HomeLoanDocType.proofOfAddress => 'Proof of address',
        HomeLoanDocType.offerToPurchase => 'Offer to purchase',
        HomeLoanDocType.other => 'Other supporting document',
      };

  static HomeLoanDocType fromWire(String? value) {
    switch ((value ?? '').toUpperCase()) {
      case 'PAYSLIP':
        return HomeLoanDocType.payslip;
      case 'BANK_STATEMENT':
        return HomeLoanDocType.bankStatement;
      case 'ID_DOCUMENT':
        return HomeLoanDocType.idDocument;
      case 'PROOF_OF_ADDRESS':
        return HomeLoanDocType.proofOfAddress;
      case 'OFFER_TO_PURCHASE':
        return HomeLoanDocType.offerToPurchase;
      default:
        return HomeLoanDocType.other;
    }
  }
}

/// A document the applicant has already attached (as returned by the server).
class HomeLoanDocument {
  const HomeLoanDocument({
    required this.id,
    required this.docType,
    required this.fileName,
    required this.fileUrl,
  });

  final int id;
  final HomeLoanDocType docType;
  final String fileName;
  final String fileUrl;

  factory HomeLoanDocument.fromJson(Map<String, dynamic> json) {
    return HomeLoanDocument(
      id: asInt(json['id']),
      docType: HomeLoanDocTypeX.fromWire(json['docType']?.toString()),
      fileName: asString(json['fileName']),
      fileUrl: asString(json['fileUrl']),
    );
  }
}

/// A bank's offer on an application.
class HomeLoanOffer {
  const HomeLoanOffer({
    required this.id,
    required this.bankName,
    required this.approvedAmount,
    required this.annualInterestRate,
    required this.monthlyInstalment,
    required this.loanTermYears,
    required this.status,
  });

  final int id;
  final String bankName;
  final double approvedAmount;
  final double annualInterestRate;
  final double monthlyInstalment;
  final int loanTermYears;
  final HomeLoanOfferStatus status;

  factory HomeLoanOffer.fromJson(Map<String, dynamic> json) {
    return HomeLoanOffer(
      id: asInt(json['id']),
      bankName: asString(json['bankName']),
      approvedAmount: asDouble(json['approvedAmount']),
      annualInterestRate: asDouble(json['annualInterestRate']),
      monthlyInstalment: asDouble(json['monthlyInstalment']),
      loanTermYears: asInt(json['loanTermYears']),
      status: HomeLoanOfferStatusX.fromWire(json['status']?.toString()),
    );
  }
}

/// A multi-bank home-loan application plus its offers and documents.
class HomeLoanApplication {
  const HomeLoanApplication({
    required this.id,
    required this.requestedBondAmount,
    required this.propertyPrice,
    required this.depositAmount,
    required this.grossMonthlyIncome,
    required this.estimatedInstalment,
    required this.annualInterestRate,
    required this.loanTermYears,
    required this.originatorName,
    required this.status,
    required this.statusNote,
    required this.createdAt,
    required this.offers,
    required this.documents,
  });

  final int id;
  final double requestedBondAmount;
  final double propertyPrice;
  final double depositAmount;
  final double grossMonthlyIncome;
  final double estimatedInstalment;
  final double annualInterestRate;
  final int loanTermYears;
  final String? originatorName;
  final HomeLoanStatus status;
  final String? statusNote;
  final DateTime? createdAt;
  final List<HomeLoanOffer> offers;
  final List<HomeLoanDocument> documents;

  bool get isOpen =>
      status != HomeLoanStatus.accepted &&
      status != HomeLoanStatus.declined &&
      status != HomeLoanStatus.withdrawn;

  factory HomeLoanApplication.fromJson(Map<String, dynamic> json) {
    final offers = (json['offers'] as List?)
            ?.whereType<Map>()
            .map((e) => HomeLoanOffer.fromJson(Map<String, dynamic>.from(e)))
            .toList() ??
        <HomeLoanOffer>[];
    final documents = (json['documents'] as List?)
            ?.whereType<Map>()
            .map((e) => HomeLoanDocument.fromJson(Map<String, dynamic>.from(e)))
            .toList() ??
        <HomeLoanDocument>[];
    return HomeLoanApplication(
      id: asInt(json['id']),
      requestedBondAmount: asDouble(json['requestedBondAmount']),
      propertyPrice: asDouble(json['propertyPrice']),
      depositAmount: asDouble(json['depositAmount']),
      grossMonthlyIncome: asDouble(json['grossMonthlyIncome']),
      estimatedInstalment: asDouble(json['estimatedInstalment']),
      annualInterestRate: asDouble(json['annualInterestRate']),
      loanTermYears: asInt(json['loanTermYears']),
      originatorName: json['originatorName']?.toString(),
      status: HomeLoanStatusX.fromWire(json['status']?.toString()),
      statusNote: json['statusNote']?.toString(),
      createdAt: asDate(json['createdAt']),
      offers: offers,
      documents: documents,
    );
  }
}

/// A document picked on-device, ready to upload + attach.
class PendingDoc {
  const PendingDoc({
    required this.docType,
    required this.fileName,
    required this.mime,
    required this.base64,
  });

  final HomeLoanDocType docType;
  final String fileName;
  final String mime;
  final String base64;
}
