import '../../../core/format.dart';

bool _asBool(dynamic v) => v == true || v == 1 || v == '1' || v == 'true';

/// Read-only investor due-diligence pack for a greenfield development — mirrors
/// the web app's "Due Diligence Pack" (feasibility, capital stack, returns,
/// professional team and statutory approvals). Returned by
/// `getDevelopmentDueDiligence`; null when the opportunity is not a development.
class DevelopmentDueDiligence {
  DevelopmentDueDiligence({
    required this.projectName,
    required this.developmentType,
    required this.developmentStage,
    required this.economics,
    required this.capital,
    required this.readiness,
    required this.professionals,
    required this.professionalsSummary,
    required this.approvals,
    required this.approvalsSummary,
  });

  final String projectName;
  final String developmentType;
  final String developmentStage;
  final DdEconomics economics;
  final DdCapital capital;
  final DdReadiness readiness;
  final List<DdProfessional> professionals;
  final DdCountSummary professionalsSummary;
  final List<DdApproval> approvals;
  final DdCountSummary approvalsSummary;

  factory DevelopmentDueDiligence.fromJson(Map<String, dynamic> j) {
    List<T> list<T>(dynamic raw, T Function(Map<String, dynamic>) f) =>
        raw is List
        ? raw
              .whereType<Map>()
              .map((e) => f(Map<String, dynamic>.from(e)))
              .toList()
        : <T>[];

    return DevelopmentDueDiligence(
      projectName: asString(j['projectName'], 'Development'),
      developmentType: asString(j['developmentType']),
      developmentStage: asString(j['developmentStage']),
      economics: DdEconomics.fromJson(
        Map<String, dynamic>.from(j['economics'] as Map? ?? {}),
      ),
      capital: DdCapital.fromJson(
        Map<String, dynamic>.from(j['capital'] as Map? ?? {}),
      ),
      readiness: DdReadiness.fromJson(
        Map<String, dynamic>.from(j['readiness'] as Map? ?? {}),
      ),
      professionals: list(j['professionals'], DdProfessional.fromJson),
      professionalsSummary: DdCountSummary.fromJson(
        Map<String, dynamic>.from(j['professionalsSummary'] as Map? ?? {}),
      ),
      approvals: list(j['approvals'], DdApproval.fromJson),
      approvalsSummary: DdCountSummary.fromJson(
        Map<String, dynamic>.from(j['approvalsSummary'] as Map? ?? {}),
      ),
    );
  }
}

class DdEconomics {
  DdEconomics({
    required this.grossDevelopmentValue,
    required this.totalCost,
    required this.profit,
    required this.profitOnCost,
    required this.profitOnGdv,
    required this.projectIRR,
    required this.equityIRR,
    required this.equityMultiple,
    required this.timelineMonths,
    required this.residualLandValue,
    required this.landAcquisitionCost,
    required this.landHeadroom,
  });

  final double grossDevelopmentValue;
  final double totalCost;
  final double profit;
  final double profitOnCost;
  final double profitOnGdv;
  final double projectIRR;
  final double equityIRR;
  final double equityMultiple;
  final int timelineMonths;
  final double residualLandValue;
  final double landAcquisitionCost;
  final double landHeadroom;

  factory DdEconomics.fromJson(Map<String, dynamic> j) => DdEconomics(
    grossDevelopmentValue: asDouble(j['grossDevelopmentValue']),
    totalCost: asDouble(j['totalCost']),
    profit: asDouble(j['profit']),
    profitOnCost: asDouble(j['profitOnCost']),
    profitOnGdv: asDouble(j['profitOnGdv']),
    projectIRR: asDouble(j['projectIRR']),
    equityIRR: asDouble(j['equityIRR']),
    equityMultiple: asDouble(j['equityMultiple']),
    timelineMonths: asInt(j['timelineMonths']),
    residualLandValue: asDouble(j['residualLandValue']),
    landAcquisitionCost: asDouble(j['landAcquisitionCost']),
    landHeadroom: asDouble(j['landHeadroom']),
  );
}

class DdCapital {
  DdCapital({
    required this.equityAmount,
    required this.seniorDebtAmount,
    required this.seniorDebtRate,
    required this.committedFunding,
    required this.peakFunding,
    required this.fundingShortfall,
    required this.loanToCost,
    required this.totalInterest,
  });

  final double equityAmount;
  final double seniorDebtAmount;
  final double seniorDebtRate;
  final double committedFunding;
  final double peakFunding;
  final double fundingShortfall;
  final double loanToCost;
  final double totalInterest;

  factory DdCapital.fromJson(Map<String, dynamic> j) => DdCapital(
    equityAmount: asDouble(j['equityAmount']),
    seniorDebtAmount: asDouble(j['seniorDebtAmount']),
    seniorDebtRate: asDouble(j['seniorDebtRate']),
    committedFunding: asDouble(j['committedFunding']),
    peakFunding: asDouble(j['peakFunding']),
    fundingShortfall: asDouble(j['fundingShortfall']),
    loanToCost: asDouble(j['loanToCost']),
    totalInterest: asDouble(j['totalInterest']),
  );
}

class DdReadiness {
  DdReadiness({
    required this.readinessScore,
    required this.economicsPass,
    required this.professionalsPass,
    required this.approvalsPass,
    required this.fundingPass,
    required this.constructionReady,
    required this.reasons,
  });

  final int readinessScore;
  final bool economicsPass;
  final bool professionalsPass;
  final bool approvalsPass;
  final bool fundingPass;
  final bool constructionReady;
  final List<String> reasons;

  factory DdReadiness.fromJson(Map<String, dynamic> j) => DdReadiness(
    readinessScore: asInt(j['readinessScore']),
    economicsPass: _asBool(j['economicsPass']),
    professionalsPass: _asBool(j['professionalsPass']),
    approvalsPass: _asBool(j['approvalsPass']),
    fundingPass: _asBool(j['fundingPass']),
    constructionReady: _asBool(j['constructionReady']),
    reasons: j['reasons'] is List
        ? (j['reasons'] as List).map((e) => e.toString()).toList()
        : <String>[],
  );
}

class DdProfessional {
  DdProfessional({
    required this.role,
    required this.firmName,
    required this.status,
    required this.isRequired,
    required this.registrationBody,
  });

  final String role;
  final String firmName;
  final String status;
  final bool isRequired;
  final String registrationBody;

  factory DdProfessional.fromJson(Map<String, dynamic> j) => DdProfessional(
    role: asString(j['role']),
    firmName: asString(j['firmName']),
    status: asString(j['status'], 'NOT_APPOINTED'),
    isRequired: _asBool(j['isRequired']),
    registrationBody: asString(j['registrationBody']),
  );
}

class DdApproval {
  DdApproval({
    required this.type,
    required this.status,
    required this.authority,
    required this.isRequired,
    required this.targetDate,
    required this.documentUrl,
  });

  final String type;
  final String status;
  final String authority;
  final bool isRequired;
  final DateTime? targetDate;
  final String documentUrl;

  factory DdApproval.fromJson(Map<String, dynamic> j) => DdApproval(
    type: asString(j['type']),
    status: asString(j['status'], 'NOT_STARTED'),
    authority: asString(j['authority']),
    isRequired: _asBool(j['isRequired']),
    targetDate: asDate(j['targetDate']),
    documentUrl: asString(j['documentUrl']),
  );
}

class DdCountSummary {
  DdCountSummary({
    required this.total,
    required this.required,
    required this.appointed,
    required this.approved,
    required this.outstanding,
  });

  final int total;
  final int required;
  final int appointed;
  final int approved;
  final int outstanding;

  factory DdCountSummary.fromJson(Map<String, dynamic> j) => DdCountSummary(
    total: asInt(j['total']),
    required: asInt(j['required']),
    appointed: asInt(j['appointed']),
    approved: asInt(j['approved']),
    outstanding: asInt(j['outstanding']),
  );
}

/// Title-case a SCREAMING_SNAKE enum value for display.
String ddLabel(String raw) => raw
    .split('_')
    .where((w) => w.isNotEmpty)
    .map((w) => w[0] + w.substring(1).toLowerCase())
    .join(' ');
