import 'dart:convert';

enum OfficePersona {
  accountant('ACCOUNTANT', 'Accountant', 'Explain holdings and paid income.'),
  tax('TAX', 'Tax', 'Organise tax questions for a qualified adviser.'),
  asset('ASSET', 'Asset manager', 'Review property evidence and data gaps.'),
  admin('ADMIN', 'Administrator', 'Prepare reminders and owner checklists.');

  const OfficePersona(this.wire, this.label, this.description);
  final String wire;
  final String label;
  final String description;
}

enum OfficeTaskKind {
  reminder('REMINDER', 'Reminder'),
  accountantPack('ACCOUNTANT_PACK', 'Accountant pack'),
  ownerChecklist('OWNER_CHECKLIST', 'Owner checklist');

  const OfficeTaskKind(this.wire, this.label);
  final String wire;
  final String label;
}

// Fail visibly on incompatible responses instead of inventing balances or
// enabling approval from incomplete data. IDs can be numeric on the wire.
Map<String, dynamic> officeObject(dynamic value) {
  if (value is! Map) throw const FormatException('Expected an office object.');
  return Map<String, dynamic>.from(value);
}

List<T> officeList<T>(dynamic value, T Function(dynamic) parse) {
  if (value is! List) throw const FormatException('Expected an office list.');
  return List.unmodifiable(value.map(parse));
}

String _text(dynamic value) {
  if (value is! String) throw const FormatException('Expected office text.');
  return value;
}

String _id(dynamic value) {
  if (value is String && value.isNotEmpty) return value;
  if (value is num && value.isFinite) return value.toString();
  throw const FormatException('Invalid office identifier.');
}

num _number(dynamic value) {
  if (value is num && value.isFinite) return value;
  throw const FormatException('Invalid office amount or count.');
}

DateTime? _date(dynamic value) {
  if (value == null) return null;
  if (value is DateTime) return value;
  return value is String ? DateTime.tryParse(value) : null;
}

String officeJson(dynamic value) =>
    const JsonEncoder.withIndent('  ').convert(value);

class OfficeHolding {
  OfficeHolding.fromJson(dynamic value) {
    final j = officeObject(value);
    propertyId = _id(j['propertyId']);
    title = _text(j['title']);
    shares = _number(j['shares']);
    basisValue = _number(j['basisValue']);
    basisLabel = _text(j['basisLabel']);
  }
  late final String propertyId, title, basisLabel;
  late final num shares, basisValue;
}

class OfficeDistributions {
  OfficeDistributions.fromJson(dynamic value) {
    final j = officeObject(value);
    gross = _number(j['gross']);
    net = _number(j['net']);
    withheld = _number(j['withheld']);
    count = _number(j['count']);
  }
  late final num gross, net, withheld, count;
}

class OfficeDocument {
  OfficeDocument.fromJson(dynamic value) {
    final j = officeObject(value);
    id = _id(j['id']);
    title = _text(j['title']);
    documentType = _text(j['documentType']);
    propertyId = j['propertyId'] == null ? null : _id(j['propertyId']);
  }
  late final String id, title, documentType;
  late final String? propertyId;
}

class OfficeProposal {
  OfficeProposal.fromJson(dynamic value) {
    final j = officeObject(value);
    id = _id(j['id']);
    title = _text(j['title']);
    status = _text(j['status']);
  }
  late final String id, title, status;
}

class OfficeEvidence {
  OfficeEvidence.fromJson(dynamic value) {
    final j = officeObject(value);
    id = _id(j['id']);
    label = _text(j['label']);
    kind = _text(j['kind']);
    asOf = _date(j['asOf']);
  }
  late final String id, label, kind;
  late final DateTime? asOf;
}

class OfficeOverview {
  OfficeOverview.fromJson(dynamic value) {
    final j = officeObject(value);
    final capabilities = officeObject(j['capabilities']);
    if (capabilities['textAI'] is! bool ||
        capabilities['voice'] is! bool ||
        capabilities['regulatedActions'] != false) {
      throw const FormatException('Unsupported office capabilities.');
    }
    textAI = capabilities['textAI'] as bool;
    voice = capabilities['voice'] as bool;
    holdings = officeList(j['holdings'], OfficeHolding.fromJson);
    paidDistributions = OfficeDistributions.fromJson(j['paidDistributions']);
    documents = officeList(j['documents'], OfficeDocument.fromJson);
    proposals = officeList(j['proposals'], OfficeProposal.fromJson);
    evidence = officeList(j['evidence'], OfficeEvidence.fromJson);
    gaps = officeList(j['gaps'], _text);
  }
  late final bool textAI, voice;
  late final List<OfficeHolding> holdings;
  late final OfficeDistributions paidDistributions;
  late final List<OfficeDocument> documents;
  late final List<OfficeProposal> proposals;
  late final List<OfficeEvidence> evidence;
  late final List<String> gaps;
}

class OfficeMessage {
  OfficeMessage.fromJson(dynamic value) {
    final j = officeObject(value);
    id = _id(j['id']);
    role = _text(j['role']);
    content = _text(j['content']);
    evidence = j['evidence'];
    createdAt = _date(j['createdAt']);
  }
  late final String id, role, content;
  late final dynamic evidence;
  late final DateTime? createdAt;
}

class OfficeConversation {
  OfficeConversation.fromJson(dynamic value) {
    final j = officeObject(value);
    id = _id(j['id']);
    title = _text(j['title']);
    createdAt = _date(j['createdAt']);
    messages = j.containsKey('messages')
        ? officeList(j['messages'], OfficeMessage.fromJson)
        : const [];
  }
  late final String id, title;
  late final DateTime? createdAt;
  late final List<OfficeMessage> messages;
}

class OfficeChatReply {
  OfficeChatReply.fromJson(dynamic value) {
    final j = officeObject(value);
    conversationId = _id(j['conversationId']);
    message = OfficeMessage.fromJson(j['message']);
  }
  late final String conversationId;
  late final OfficeMessage message;
}

class OfficeVoiceReply extends OfficeChatReply {
  OfficeVoiceReply.fromJson(dynamic value) : super.fromJson(value) {
    final j = officeObject(value);
    transcript = _text(j['transcript']);
    speechError = j['speechError'] == null ? null : _text(j['speechError']);
    // Audio playback is optional. Keep the persisted answer even if speech
    // synthesis fails; never interpret a voice response as a task command.
  }

  late final String transcript;
  late final String? speechError;
}

class OfficeTask {
  OfficeTask.fromJson(dynamic value) {
    final j = officeObject(value);
    id = _id(j['id']);
    title = _text(j['title']);
    kind = _text(j['kind']);
    status = _text(j['status']);
    parameters = j['parameters'];
    result = j['result'];
    approvalDigest = j['approvalDigest'] == null
        ? null
        : _text(j['approvalDigest']);
    expiresAt = _date(j['expiresAt']);
    createdAt = _date(j['createdAt']);
  }
  late final String id, title, kind, status;
  late final dynamic parameters, result;
  late final String? approvalDigest;
  late final DateTime? expiresAt, createdAt;

  bool canApproveAt(DateTime now) =>
      status == 'PREPARED' &&
      OfficeTaskKind.values.any((value) => value.wire == kind) &&
      parameters is Map &&
      approvalDigest != null &&
      approvalDigest!.trim().isNotEmpty &&
      expiresAt != null &&
      expiresAt!.isAfter(now);
}
