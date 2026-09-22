import 'package:equatable/equatable.dart';

import '../../../core/format.dart';

class AppUser extends Equatable {
  const AppUser({
    required this.id,
    required this.email,
    required this.name,
    required this.role,
    this.investorCode,
    this.phoneNumber,
  });

  final int id;
  final String email;
  final String name;
  final String role;
  final String? investorCode;
  final String? phoneNumber;

  bool get isInvestor => role == 'INVESTOR';

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return (parts.first[0] + parts.last[0]).toUpperCase();
  }

  String get roleLabel => switch (role) {
    'INVESTOR' => 'Investor',
    'DEVELOPMENT_MANAGER' => 'Development Manager',
    'PROJECT_MANAGER' => 'Project Manager',
    'PROPERTY_OWNER' => 'Property Owner',
    'CONTRACTOR' => 'Contractor',
    'ADMIN' => 'Administrator',
    _ => role,
  };

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: asInt(json['id']),
      email: asString(json['email']),
      name: asString(json['name']),
      role: asString(json['role'], 'INVESTOR'),
      investorCode: json['investorCode']?.toString(),
      phoneNumber: json['phoneNumber']?.toString(),
    );
  }

  @override
  List<Object?> get props => [id, email, name, role, investorCode, phoneNumber];
}
