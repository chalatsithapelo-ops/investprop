import '../../../core/format.dart';

/// A governance proposal shareholders can vote on.
class Proposal {
  Proposal({
    required this.id,
    required this.propertyId,
    required this.propertyTitle,
    required this.title,
    required this.description,
    required this.proposalType,
    required this.status,
    required this.result,
    required this.deadline,
    required this.requiredQuorum,
    required this.requiredMajority,
    required this.tally,
    required this.myVote,
  });

  final int id;
  final int propertyId;
  final String propertyTitle;
  final String title;
  final String description;
  final String proposalType;
  final String status; // OPEN | CLOSED | EXECUTED | CANCELLED
  final String? result; // PASSED | FAILED | QUORUM_NOT_MET
  final DateTime? deadline;
  final double requiredQuorum;
  final double requiredMajority;
  final ProposalTally tally;
  final String? myVote; // YES | NO | ABSTAIN | null

  bool get isOpen => status == 'OPEN';

  bool get isExpired =>
      deadline != null && DateTime.now().isAfter(deadline!);

  bool get canVote => isOpen && !isExpired;

  String get typeLabel => proposalType
      .split('_')
      .map((w) => w.isEmpty ? w : w[0] + w.substring(1).toLowerCase())
      .join(' ');

  String get statusLabel {
    if (status == 'OPEN') return 'Open for voting';
    if (result != null) {
      return switch (result) {
        'PASSED' => 'Passed',
        'FAILED' => 'Failed',
        'QUORUM_NOT_MET' => 'Quorum not met',
        _ => result!,
      };
    }
    return status[0] + status.substring(1).toLowerCase();
  }

  factory Proposal.fromJson(Map<String, dynamic> json, {int? myInvestorId}) {
    final property = json['property'] is Map
        ? Map<String, dynamic>.from(json['property'] as Map)
        : const <String, dynamic>{};
    final tally = json['tally'] is Map
        ? Map<String, dynamic>.from(json['tally'] as Map)
        : const <String, dynamic>{};

    String? myVote;
    if (myInvestorId != null && json['votes'] is List) {
      for (final v in (json['votes'] as List)) {
        if (v is Map) {
          final investor = v['investor'] is Map
              ? Map<String, dynamic>.from(v['investor'] as Map)
              : const <String, dynamic>{};
          if (asInt(investor['id']) == myInvestorId) {
            myVote = v['voteChoice']?.toString();
            break;
          }
        }
      }
    }

    return Proposal(
      id: asInt(json['id']),
      propertyId: asInt(json['propertyId']),
      propertyTitle: asString(property['title'], 'Property'),
      title: asString(json['title']),
      description: asString(json['description']),
      proposalType: asString(json['proposalType'], 'OTHER'),
      status: asString(json['status'], 'OPEN'),
      result: json['result']?.toString(),
      deadline: asDate(json['deadline']),
      requiredQuorum: asDouble(json['requiredQuorum']),
      requiredMajority: asDouble(json['requiredMajority']),
      tally: ProposalTally.fromJson(tally),
      myVote: myVote,
    );
  }
}

class ProposalTally {
  const ProposalTally({
    required this.yesCount,
    required this.noCount,
    required this.abstainCount,
    required this.yesShares,
    required this.noShares,
    required this.abstainShares,
    required this.totalVotedShares,
    required this.yesPercentage,
  });

  final int yesCount;
  final int noCount;
  final int abstainCount;
  final double yesShares;
  final double noShares;
  final double abstainShares;
  final double totalVotedShares;
  final double yesPercentage;

  int get totalVoters => yesCount + noCount + abstainCount;

  factory ProposalTally.fromJson(Map<String, dynamic> json) => ProposalTally(
        yesCount: asInt(json['yesCount']),
        noCount: asInt(json['noCount']),
        abstainCount: asInt(json['abstainCount']),
        yesShares: asDouble(json['yesShares']),
        noShares: asDouble(json['noShares']),
        abstainShares: asDouble(json['abstainShares']),
        totalVotedShares: asDouble(json['totalVotedShares']),
        yesPercentage: asDouble(json['yesPercentage']),
      );
}
