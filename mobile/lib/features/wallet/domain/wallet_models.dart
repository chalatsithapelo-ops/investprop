import '../../../core/format.dart';

/// A single wallet money movement (deposit, trade, withdrawal, fee, refund).
class WalletTransaction {
  const WalletTransaction({
    required this.id,
    required this.type,
    required this.amountRands,
    required this.balanceAfterRands,
    required this.status,
    required this.description,
    required this.reference,
    required this.createdAt,
  });

  final int id;
  final String type;
  final double amountRands;
  final double balanceAfterRands;
  final String status;
  final String? description;
  final String reference;
  final DateTime? createdAt;

  bool get isCredit => amountRands >= 0;

  String get typeLabel => switch (type) {
    'DEPOSIT' => 'Deposit',
    'WITHDRAWAL' => 'Withdrawal',
    'TRADE_DEBIT' => 'Share purchase',
    'TRADE_CREDIT' => 'Share sale',
    'FEE' => 'Fee',
    'REFUND' => 'Refund',
    'ADJUSTMENT' => 'Adjustment',
    _ => type,
  };

  factory WalletTransaction.fromJson(Map<String, dynamic> json) =>
      WalletTransaction(
        id: asInt(json['id']),
        type: asString(json['type'], 'ADJUSTMENT'),
        amountRands: asDouble(json['amountRands']),
        balanceAfterRands: asDouble(json['balanceAfterRands']),
        status: asString(json['status'], 'COMPLETED'),
        description: json['description']?.toString(),
        reference: asString(json['reference']),
        createdAt: asDate(json['createdAt']),
      );
}

/// Wallet overview: balance, reserved amount and recent transactions.
class Wallet {
  const Wallet({
    required this.balanceRands,
    required this.currency,
    required this.pendingWithdrawalRands,
    required this.transactions,
  });

  final double balanceRands;
  final String currency;
  final double pendingWithdrawalRands;
  final List<WalletTransaction> transactions;

  factory Wallet.fromJson(Map<String, dynamic> json) {
    final txns = json['transactions'];
    return Wallet(
      balanceRands: asDouble(json['balanceRands']),
      currency: asString(json['currency'], 'ZAR'),
      pendingWithdrawalRands: asInt(json['pendingWithdrawalCents']) / 100.0,
      transactions: txns is List
          ? txns
                .whereType<Map>()
                .map(
                  (e) =>
                      WalletTransaction.fromJson(Map<String, dynamic>.from(e)),
                )
                .toList()
          : const [],
    );
  }
}

/// An investor's own withdrawal request.
class MyWithdrawal {
  const MyWithdrawal({
    required this.id,
    required this.amountRands,
    required this.status,
    required this.bankName,
    required this.accountNumber,
    required this.reviewNotes,
    required this.createdAt,
    required this.processedAt,
  });

  final int id;
  final double amountRands;
  final String status;
  final String bankName;
  final String accountNumber;
  final String? reviewNotes;
  final DateTime? createdAt;
  final DateTime? processedAt;

  String get statusLabel => status
      .split('_')
      .map((w) => w.isEmpty ? w : w[0] + w.substring(1).toLowerCase())
      .join(' ');

  factory MyWithdrawal.fromJson(Map<String, dynamic> json) => MyWithdrawal(
    id: asInt(json['id']),
    amountRands: asDouble(json['amountRands']),
    status: asString(json['status'], 'REQUESTED'),
    bankName: asString(json['bankName']),
    accountNumber: asString(json['accountNumber']),
    reviewNotes: json['reviewNotes']?.toString(),
    createdAt: asDate(json['createdAt']),
    processedAt: asDate(json['processedAt']),
  );
}

/// A withdrawal awaiting manager review (payout queue).
class PendingWithdrawal {
  const PendingWithdrawal({
    required this.id,
    required this.amountRands,
    required this.status,
    required this.bankName,
    required this.accountNumber,
    required this.accountName,
    required this.branchCode,
    required this.investorName,
    required this.investorCode,
    required this.createdAt,
  });

  final int id;
  final double amountRands;
  final String status;
  final String bankName;
  final String accountNumber;
  final String accountName;
  final String? branchCode;
  final String investorName;
  final String? investorCode;
  final DateTime? createdAt;

  factory PendingWithdrawal.fromJson(Map<String, dynamic> json) {
    final inv = json['investor'] is Map
        ? Map<String, dynamic>.from(json['investor'] as Map)
        : const <String, dynamic>{};
    return PendingWithdrawal(
      id: asInt(json['id']),
      amountRands: asDouble(json['amountRands']),
      status: asString(json['status'], 'REQUESTED'),
      bankName: asString(json['bankName']),
      accountNumber: asString(json['accountNumber']),
      accountName: asString(json['accountName']),
      branchCode: json['branchCode']?.toString(),
      investorName: asString(inv['name'], 'Investor'),
      investorCode: inv['investorCode']?.toString(),
      createdAt: asDate(json['createdAt']),
    );
  }
}

/// Result of starting a Paystack wallet deposit.
class DepositInit {
  const DepositInit({required this.authorizationUrl, required this.reference});

  final String authorizationUrl;
  final String reference;
}
