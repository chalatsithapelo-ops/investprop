import {
  createCallerFactory,
  createTRPCRouter,
} from "~/server/trpc/main";
import { register } from "~/server/trpc/procedures/register";
import { login } from "~/server/trpc/procedures/login";
import { logout } from "~/server/trpc/procedures/logout";
import { refreshToken } from "~/server/trpc/procedures/refreshToken";
import { getMe } from "~/server/trpc/procedures/getMe";
import { updateProfile } from "~/server/trpc/procedures/update-profile";
import { getProperties } from "~/server/trpc/procedures/getProperties";
import { getPropertyById } from "~/server/trpc/procedures/getPropertyById";
import { createProperty } from "~/server/trpc/procedures/createProperty";
import { deleteProperty } from "~/server/trpc/procedures/deleteProperty";
import { updateProperty } from "~/server/trpc/procedures/updateProperty";
import { getPresignedUploadUrl } from "~/server/trpc/procedures/getPresignedUploadUrl";
import { generatePropertyImage } from "~/server/trpc/procedures/generatePropertyImage";
import { getDevelopmentMetrics } from "~/server/trpc/procedures/getDevelopmentMetrics";
import { getInvestmentPackages } from "~/server/trpc/procedures/getInvestmentPackages";
import { updateInvestmentStatus } from "~/server/trpc/procedures/updateInvestmentStatus";
import { createBudgetEntry, approveBudgetEntry, rejectBudgetEntry } from "~/server/trpc/procedures/createBudgetEntry";
import { getBudgetEntries } from "~/server/trpc/procedures/getBudgetEntries";
import { getBudgetHistory } from "~/server/trpc/procedures/getBudgetHistory";
import { getInvestors } from "~/server/trpc/procedures/getInvestors";
import { createInvestorContribution } from "~/server/trpc/procedures/createInvestorContribution";
import { getInvestorContributions } from "~/server/trpc/procedures/getInvestorContributions";
import { updateInvestorContribution } from "~/server/trpc/procedures/updateInvestorContribution";
import { deleteInvestorContribution } from "~/server/trpc/procedures/deleteInvestorContribution";
import { getGlobalInvestorMetrics } from "~/server/trpc/procedures/getGlobalInvestorMetrics";
import { getMyContributions } from "~/server/trpc/procedures/getMyContributions";
import { distributeReturns } from "~/server/trpc/procedures/distributeReturns";
import { analyzeProperty } from "~/server/trpc/procedures/analyzeProperty";
import { createTemplate } from "~/server/trpc/procedures/createTemplate";
import { getTemplates } from "~/server/trpc/procedures/getTemplates";
import { deleteTemplate } from "~/server/trpc/procedures/deleteTemplate";
import { createMilestone } from "~/server/trpc/procedures/createMilestone";
import { getMilestones } from "~/server/trpc/procedures/getMilestones";
import { updateMilestone } from "~/server/trpc/procedures/updateMilestone";
import { createProgressSubmission } from "~/server/trpc/procedures/createProgressSubmission";
import { getProgressSubmissions } from "~/server/trpc/procedures/getProgressSubmissions";
import { reviewProgressSubmission } from "~/server/trpc/procedures/reviewProgressSubmission";
import { createRisk } from "~/server/trpc/procedures/createRisk";
import { getRisks } from "~/server/trpc/procedures/getRisks";
import { updateRisk } from "~/server/trpc/procedures/updateRisk";
import { getInvestorPreferences } from "~/server/trpc/procedures/getInvestorPreferences";
import { updateInvestorPreferences } from "~/server/trpc/procedures/updateInvestorPreferences";
import { getAiDigestPrefs, setAiDigestOptOut, runAiDigestNow, runPortfolioWatchdogNow, getAiPredictionStats } from "~/server/trpc/procedures/ai-digest";
import { getInvestmentOpportunities } from "~/server/trpc/procedures/getInvestmentOpportunities";
import { submitInvestmentProposal } from "~/server/trpc/procedures/submitInvestmentProposal";
import { updateInvestmentProposal, cancelInvestmentProposal, getMyPropertyInvestments } from "~/server/trpc/procedures/updateInvestmentProposal";
import { publishPropertyForFunding } from "~/server/trpc/procedures/publishPropertyForFunding";
import { reviewInvestmentProposal } from "~/server/trpc/procedures/reviewInvestmentProposal";
import { getPendingInvestmentProposals } from "~/server/trpc/procedures/getPendingInvestmentProposals";
import { sendVerificationEmail, verifyEmail } from "~/server/trpc/procedures/email-verification";
import { requestPasswordReset, resetPassword, validateResetToken } from "~/server/trpc/procedures/password-reset";
import { getAuditLogs } from "~/server/trpc/procedures/audit-log";
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead, deleteNotification } from "~/server/trpc/procedures/notifications";
import { getVapidPublicKey, savePushSubscription, deletePushSubscription, registerDeviceToken, unregisterDeviceToken } from "~/server/trpc/procedures/push";
import { getAllUsers, getUserById, updateUser, deleteUser, resetUserPassword, getSystemStats, createUser, approveUser, suspendUser, unsuspendUser, appointComplianceOfficer } from "~/server/trpc/procedures/admin";
import { uploadFile } from "~/server/trpc/procedures/uploadFile";
import { cancelContributionDuringCoolingOff, screenSanctions, generateTaxCertificate, generateInvestmentReceipt } from "~/server/trpc/procedures/investor-compliance";
import { reconcilePayouts, markPayoutReconciled } from "~/server/trpc/procedures/reconciliation";
import { broadcastAnnouncement } from "~/server/trpc/procedures/broadcastAnnouncement";
// SPV & Acquisition Pipeline
import { getSPVs, getSPVById, createSPV, updateSPV, assignPropertyToSPV, removePropertyFromSPV } from "~/server/trpc/procedures/spv";
import { createAcquisition, getAcquisitions, updateAcquisitionStatus } from "~/server/trpc/procedures/acquisition";
// Fractional Ownership (Shares)
import { createShareClass, getShareInfo, purchaseShares, transferShares, getShareLedger, getInvestorPortfolio, requestCoolingOffWithdrawal, getMyShareHoldings, lookupInvestorByCode } from "~/server/trpc/procedures/shares";
// Distribution Engine
import { createDistribution, getDistributions, executeDistribution, getMyDistributions } from "~/server/trpc/procedures/distributions";
// Platform Revenue (Phase 1 monetization)
import { getPlatformRevenueSummary, getPlatformRevenueLedger, getPlatformFeeConfig, updatePlatformFeeConfig, getOwnerFeeSchedule } from "~/server/trpc/procedures/platform-revenue";
// Investor Statements
import { generateInvestorStatement } from "~/server/trpc/procedures/statements";
// Governance & Voting
import { createProposal, getProposals, castVote, closeProposal, getGovernanceRules } from "~/server/trpc/procedures/governance";
// KYC / FICA Compliance
import { submitKYCProfile, getKYCProfile, uploadKYCDocument, getKYCDocuments, reviewKYCDocument, checkKYCCompliance } from "~/server/trpc/procedures/kyc";
// Phase 2: Legal Documents
import { generateLegalDocument, getLegalDocuments, updateDocumentStatus, getLegalDocumentById, getMyDocuments } from "~/server/trpc/procedures/legal-documents";
// Phase 3: Property Financials
import { createFinancialEntry, getFinancialEntries, getFinancialSummary, getMonthlyCashFlow, deleteFinancialEntry } from "~/server/trpc/procedures/property-financials";
// Phase 6: Compliance & Audit
import { getComplianceDashboard, logAuditEvent, getFICAStatus, getRegulatoryChecklist, getFSCAReadiness } from "~/server/trpc/procedures/compliance";
// Phase 7: Share Marketplace
import { placeShareOrder, getOrderBook, getMyOrders, cancelShareOrder, getTradeHistory, getSharePriceHistory, getMarketplaceOverview, submitTradePayment, reviewTradeSettlement, cancelTradeSettlement, getMyTradeSettlements, getPendingTradeSettlements, expireStaleSettlements, setShareClassTradingHalted, updateShareClassMarketParams, reverseShareTrade } from "~/server/trpc/procedures/share-marketplace";
// Phase 7c: In-app Wallet + share integrity
import { getMyWallet, getWalletTransactions, initiateWalletDeposit, verifyWalletDeposit, requestWithdrawal, getMyWithdrawals, getPendingWithdrawals, reviewWithdrawal } from "~/server/trpc/procedures/wallet";
import { auditShareConservation, getShareProvenance } from "~/server/trpc/procedures/share-audit";
// Phase 8: Payment Gateway (Paystack)
import { initiateDistributionPayout, verifyPaystackTransfer, initializePayment, verifyPayment, getPaystackBalance, getPaymentGatewayStatus } from "~/server/trpc/procedures/payments";
// Phase 9: Distressed Property Finder
import { getDistressedListings, triggerDistressedScrape, getDistressedDashboardSummary, getScrapeLogs, getDistressedSources, toggleDistressedFavourite, addDistressedListing, updateDistressedStatus, deleteDistressedListing } from "~/server/trpc/procedures/distressed-finder";
import { screenDistressedListing, screenDistressedBatch, promoteDistressedToProperty, getDistressedPriceHistory, getDistressedComparables, runDistressedDedup, runDistressedReminders } from "~/server/trpc/procedures/distressed-ai";
// Owner Sale Proposals
import { submitSaleProposal, getMySaleProposals, getSaleProposals, reviewSaleProposal, withdrawSaleProposal, bookOwnerRecurringFee, valuateSaleProposal, promoteSaleProposalToProperty } from "~/server/trpc/procedures/owner-proposals";
// Investment Payments (POP + Paystack)
import { initiateInvestmentPayment, verifyInvestmentPayment, submitProofOfPayment, reviewProofOfPayment, getPendingPayments, getMyAwaitingPayment } from "~/server/trpc/procedures/investment-payments";
// Share Certificates
import { getMyCertificates, getCertificateDetail, getCertificatePDFData, validateCertificate, revokeCertificate, getAllCertificates, updateCertificateNotes, calculateSharePreview } from "~/server/trpc/procedures/share-certificates";
// FICA Verification
import { getMyFicaStatus, verifyInvestorFica, getInvestorsFicaStatus } from "~/server/trpc/procedures/fica-verification";
// Phase 10: Financial Reports
import { getSPVIncomeStatement, getSPVBalanceSheet, getInvestorStatement, getAnnualTaxReport, getSPVPortfolioSummary } from "~/server/trpc/procedures/financial-reports";
// Contractor Management
import {
  getContractors, createContractorProfile, updateContractorProfile,
  createRFQ, getRFQs, updateRFQStatus,
  submitQuotation, reviewQuotation,
  createWorkOrder, getWorkOrders, updateWorkOrderStatus,
  submitContractorInvoice, getContractorInvoices, reviewContractorInvoice,
  getMyContractorProfile, updateMyContractorProfile,
  getContractorDashboard,
  submitContractorSelfProfile, uploadContractorDocument, deleteContractorDocument,
  getPendingContractorProfiles, approveContractorProfile, rejectContractorProfile,
  submitWorkOrderUpdate, getWorkOrderUpdates, rateWorkOrder,
} from "~/server/trpc/procedures/contractor-management";
import {
  counterOfferSaleProposal,
  respondToCounterOffer,
  generateLetterOfIntent,
  acceptWorkOrder,
  proposeVariation,
  respondToVariation,
  listVariations,
  listAuditLog,
  impersonateUser,
  listCoolingOffContributions,
  getPmTodayInbox,
  getAdminActionInbox,
} from "~/server/trpc/procedures/extended-workflows";
import {
  resubmitPaymentProof,
  requestRefund,
  submitAppropriatenessQuestionnaire,
  getAppropriatenessStatus,
  getCapTablePreview,
  getDistributionForecast,
  getSystemHealth,
  bulkApproveUsers,
  bulkSuspendUsers,
  popiaSubjectAccessExport,
  listMyDocuments,
} from "~/server/trpc/procedures/investor-admin-extras";
// AI Strategy — Tier 1
import { propertyChatHistory, chatAboutProperty, clearPropertyChat } from "~/server/trpc/procedures/ai-copilot";
import { getMatchScore, getMatchScoresBatch } from "~/server/trpc/procedures/ai-match-score";
import { summariseLegalDocument, getLegalDocumentSummary } from "~/server/trpc/procedures/ai-doc-summary";
import { coachListing, getListingCoachResult } from "~/server/trpc/procedures/ai-listing-coach";
// AI Strategy — Tier 2
import { runUnderwriting, getUnderwriting } from "~/server/trpc/procedures/ai-underwriting";
import { verifyConstructionPhotos, getPhotoChecks } from "~/server/trpc/procedures/ai-photo-check";
import { generatePortfolioInsight, getPortfolioInsight, dismissPortfolioInsight } from "~/server/trpc/procedures/ai-portfolio-advisor";
import { generateInvestorUpdate, updateInvestorDraft, sendInvestorUpdate, listInvestorUpdates } from "~/server/trpc/procedures/ai-investor-updates";
// AI Strategy — Tier 3
import { startOnboardingSession, continueOnboardingSession } from "~/server/trpc/procedures/ai-onboarding";
import { predictDistress, getLatestDistress, listDistressedPortfolio } from "~/server/trpc/procedures/ai-distress";
import { getSponsorTrackRecord } from "~/server/trpc/procedures/ai-sponsor-track";
import { getPlatformTrackRecord } from "~/server/trpc/procedures/platform-track";
// Phase 2: SaaS Subscriptions
import { getSubscriptionPlans, getMySubscription, startFreeTrial, initializeSubscription, verifySubscription, cancelSubscription, getSubscriptionStats, syncPaystackPlans, upsertSubscriptionPlan } from "~/server/trpc/procedures/subscriptions";
// Phase 3: Distressed standalone — alerts, referrals, market data
import { getMyDistressedAlerts, upsertDistressedAlerts, runDistressedSubscriberAlerts } from "~/server/trpc/procedures/distressed-alerts";
import { requestReferralIntro, getReferralPartners, upsertReferralPartner, getReferralLeads, updateReferralLead, getReferralSummary } from "~/server/trpc/procedures/referrals";
import { previewPrequalification, submitPrequalification, getMyPrequalifications } from "~/server/trpc/procedures/prequalification";
import { submitHomeLoanApplication, getMyHomeLoanApplications, withdrawHomeLoanApplication, acceptHomeLoanOffer, getHomeLoanApplicationsAdmin, updateHomeLoanApplicationAdmin } from "~/server/trpc/procedures/home-loan-application";
import { getSubscriberDistressedDeals, getSubscriberDistressedDetail, screenSubscriberDistressedDeal, getSubscriberDistressedMarketAnalysis } from "~/server/trpc/procedures/distressed-subscriber";
import { getAnonymisedMarketData } from "~/server/trpc/procedures/market-data";
// Development management — progress, cost report, approvals, units, lifecycle, appraisal
import {
  updateMilestoneProgress,
  getDevelopmentCostReport,
  drawContingency,
  createDevelopmentApproval,
  getDevelopmentApprovals,
  updateDevelopmentApproval,
  createDevelopmentUnit,
  updateDevelopmentUnit,
  getDevelopmentUnits,
  updateDevelopmentStage,
  getDevelopmentAppraisal,
  createDevelopmentProfessional,
  updateDevelopmentProfessional,
  getDevelopmentProfessionals,
  getProjectReadiness,
  getDevelopmentDueDiligence,
} from "~/server/trpc/procedures/development-management";
import {
  getChartOfAccounts,
  getTrialBalance,
  getCapitalAccounts,
  getLedgerEntries,
  reverseJournalEntry,
  recordDeposit,
  recognizeRevenue,
  recordCapitalContribution,
  recordDistribution,
  recordNrvImpairment,
  recordRetention,
  recordDefectsProvision,
  recordInterest,
  recordDeferredTax,
} from "~/server/trpc/procedures/ledger";
export const appRouter = createTRPCRouter({
  register,
  login,
  logout,
  refreshToken,
  getMe,
  updateProfile,
  getProperties,
  getPropertyById,
  createProperty,
  deleteProperty,
  updateProperty,
  getPresignedUploadUrl,
  generatePropertyImage,
  getDevelopmentMetrics,
  getInvestmentPackages,
  updateInvestmentStatus,
  createBudgetEntry,
  approveBudgetEntry,
  rejectBudgetEntry,
  getBudgetEntries,
  getBudgetHistory,
  getInvestors,
  createInvestorContribution,
  getInvestorContributions,
  updateInvestorContribution,
  deleteInvestorContribution,
  getGlobalInvestorMetrics,
  getMyContributions,
  distributeReturns,
  analyzeProperty,
  createTemplate,
  getTemplates,
  deleteTemplate,
  createMilestone,
  getMilestones,
  updateMilestone,
  updateMilestoneProgress,
  getDevelopmentCostReport,
  drawContingency,
  createDevelopmentApproval,
  getDevelopmentApprovals,
  updateDevelopmentApproval,
  createDevelopmentUnit,
  updateDevelopmentUnit,
  getDevelopmentUnits,
  updateDevelopmentStage,
  getDevelopmentAppraisal,
  createDevelopmentProfessional,
  updateDevelopmentProfessional,
  getDevelopmentProfessionals,
  getProjectReadiness,
  getDevelopmentDueDiligence,
  getChartOfAccounts,
  getTrialBalance,
  getCapitalAccounts,
  getLedgerEntries,
  reverseJournalEntry,
  recordDeposit,
  recognizeRevenue,
  recordCapitalContribution,
  recordDistribution,
  recordNrvImpairment,
  recordRetention,
  recordDefectsProvision,
  recordInterest,
  recordDeferredTax,
  createProgressSubmission,
  getProgressSubmissions,
  reviewProgressSubmission,
  createRisk,
  getRisks,
  updateRisk,
  getInvestorPreferences,
  updateInvestorPreferences,
  getAiDigestPrefs,
  setAiDigestOptOut,
  runAiDigestNow,
  runPortfolioWatchdogNow,
  getAiPredictionStats,
  getInvestmentOpportunities,
  submitInvestmentProposal,
  updateInvestmentProposal,
  cancelInvestmentProposal,
  getMyPropertyInvestments,
  publishPropertyForFunding,
  reviewInvestmentProposal,
  getPendingInvestmentProposals,
  sendVerificationEmail,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  validateResetToken,
  getAuditLogs,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getVapidPublicKey,
  savePushSubscription,
  deletePushSubscription,
  registerDeviceToken,
  unregisterDeviceToken,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  resetUserPassword,
  getSystemStats,
  createUser,
  approveUser,
  suspendUser,
  unsuspendUser,
  appointComplianceOfficer,
  getPlatformRevenueSummary,
  getPlatformRevenueLedger,
  getPlatformFeeConfig,
  updatePlatformFeeConfig,
  getOwnerFeeSchedule,
  uploadFile,
  cancelContributionDuringCoolingOff,
  screenSanctions,
  generateTaxCertificate,
  generateInvestmentReceipt,
  reconcilePayouts,
  markPayoutReconciled,
  broadcastAnnouncement,
  // SPV & Acquisition Pipeline
  getSPVs,
  getSPVById,
  createSPV,
  updateSPV,
  assignPropertyToSPV,
  removePropertyFromSPV,
  createAcquisition,
  getAcquisitions,
  updateAcquisitionStatus,
  // Fractional Ownership (Shares)
  createShareClass,
  getShareInfo,
  purchaseShares,
  transferShares,
  getShareLedger,
  getInvestorPortfolio,
  requestCoolingOffWithdrawal,
  getMyShareHoldings,
  lookupInvestorByCode,
  // Distribution Engine
  createDistribution,
  getDistributions,
  executeDistribution,
  getMyDistributions,
  // Investor Statements
  generateInvestorStatement,
  // Governance & Voting
  createProposal,
  getProposals,
  castVote,
  closeProposal,
  getGovernanceRules,
  // KYC / FICA Compliance
  submitKYCProfile,
  getKYCProfile,
  uploadKYCDocument,
  getKYCDocuments,
  reviewKYCDocument,
  checkKYCCompliance,
  // Phase 2: Legal Documents
  generateLegalDocument,
  getLegalDocuments,
  updateDocumentStatus,
  getLegalDocumentById,
  getMyDocuments,
  // Phase 3: Property Financials
  createFinancialEntry,
  getFinancialEntries,
  getFinancialSummary,
  getMonthlyCashFlow,
  deleteFinancialEntry,
  // Phase 6: Compliance & Audit
  getComplianceDashboard,
  logAuditEvent,
  getFICAStatus,
  getRegulatoryChecklist,
  getFSCAReadiness,
  // Phase 7: Share Marketplace
  placeShareOrder,
  getOrderBook,
  getMyOrders,
  cancelShareOrder,
  getTradeHistory,
  getSharePriceHistory,
  getMarketplaceOverview,
  // Phase 7b: DvP cash-settlement + market admin controls
  submitTradePayment,
  reviewTradeSettlement,
  cancelTradeSettlement,
  getMyTradeSettlements,
  getPendingTradeSettlements,
  expireStaleSettlements,
  setShareClassTradingHalted,
  updateShareClassMarketParams,
  reverseShareTrade,
  // Phase 7c: In-app Wallet + share integrity
  getMyWallet,
  getWalletTransactions,
  initiateWalletDeposit,
  verifyWalletDeposit,
  requestWithdrawal,
  getMyWithdrawals,
  getPendingWithdrawals,
  reviewWithdrawal,
  auditShareConservation,
  getShareProvenance,
  // Phase 8: Payment Gateway
  initiateDistributionPayout,
  verifyPaystackTransfer,
  initializePayment,
  verifyPayment,
  getPaystackBalance,
  getPaymentGatewayStatus,
  // Phase 9: Distressed Property Finder
  getDistressedListings,
  triggerDistressedScrape,
  getDistressedDashboardSummary,
  getScrapeLogs,
  getDistressedSources,
  toggleDistressedFavourite,
  addDistressedListing,
  updateDistressedStatus,
  deleteDistressedListing,
  // Distressed AI + workflow
  screenDistressedListing,
  screenDistressedBatch,
  promoteDistressedToProperty,
  getDistressedPriceHistory,
  getDistressedComparables,
  runDistressedDedup,
  runDistressedReminders,
  // Owner Sale Proposals
  submitSaleProposal,
  getMySaleProposals,
  getSaleProposals,
  reviewSaleProposal,
  withdrawSaleProposal,
  bookOwnerRecurringFee,
  valuateSaleProposal,
  promoteSaleProposalToProperty,
  // Investment Payments
  initiateInvestmentPayment,
  verifyInvestmentPayment,
  submitProofOfPayment,
  reviewProofOfPayment,
  getPendingPayments,
  getMyAwaitingPayment,
  // Share Certificates
  getMyCertificates,
  getCertificateDetail,
  getCertificatePDFData,
  validateCertificate,
  revokeCertificate,
  getAllCertificates,
  updateCertificateNotes,
  calculateSharePreview,
  // FICA Verification
  getMyFicaStatus,
  verifyInvestorFica,
  getInvestorsFicaStatus,
  // Phase 10: Financial Reports
  getSPVIncomeStatement,
  getSPVBalanceSheet,
  getInvestorStatement,
  getAnnualTaxReport,
  getSPVPortfolioSummary,
  // Contractor Management
  getContractors,
  createContractorProfile,
  updateContractorProfile,
  createRFQ,
  getRFQs,
  updateRFQStatus,
  submitQuotation,
  reviewQuotation,
  createWorkOrder,
  getWorkOrders,
  updateWorkOrderStatus,
  submitContractorInvoice,
  getContractorInvoices,
  reviewContractorInvoice,
  getMyContractorProfile,
  updateMyContractorProfile,
  getContractorDashboard,
  submitContractorSelfProfile,
  uploadContractorDocument,
  deleteContractorDocument,
  getPendingContractorProfiles,
  approveContractorProfile,
  rejectContractorProfile,
  submitWorkOrderUpdate,
  getWorkOrderUpdates,
  rateWorkOrder,
  // Phase 8-13 extended workflows
  counterOfferSaleProposal,
  respondToCounterOffer,
  generateLetterOfIntent,
  acceptWorkOrder,
  proposeVariation,
  respondToVariation,
  listVariations,
  listAuditLog,
  impersonateUser,
  listCoolingOffContributions,
  getPmTodayInbox,
  getAdminActionInbox,
  // Phase 10/13/14 investor + admin extras
  resubmitPaymentProof,
  requestRefund,
  submitAppropriatenessQuestionnaire,
  getAppropriatenessStatus,
  getCapTablePreview,
  getDistributionForecast,
  getSystemHealth,
  bulkApproveUsers,
  bulkSuspendUsers,
  popiaSubjectAccessExport,
  listMyDocuments,
  // AI Strategy — Tier 1
  propertyChatHistory,
  chatAboutProperty,
  clearPropertyChat,
  getMatchScore,
  getMatchScoresBatch,
  summariseLegalDocument,
  getLegalDocumentSummary,
  coachListing,
  getListingCoachResult,
  // AI Strategy — Tier 2
  runUnderwriting,
  getUnderwriting,
  verifyConstructionPhotos,
  getPhotoChecks,
  generatePortfolioInsight,
  getPortfolioInsight,
  dismissPortfolioInsight,
  generateInvestorUpdate,
  updateInvestorDraft,
  sendInvestorUpdate,
  listInvestorUpdates,
  // AI Strategy — Tier 3
  startOnboardingSession,
  continueOnboardingSession,
  predictDistress,
  getLatestDistress,
  listDistressedPortfolio,
  getSponsorTrackRecord,
  getPlatformTrackRecord,
  // Phase 2: SaaS Subscriptions
  getSubscriptionPlans,
  getMySubscription,
  startFreeTrial,
  initializeSubscription,
  verifySubscription,
  cancelSubscription,
  getSubscriptionStats,
  syncPaystackPlans,
  upsertSubscriptionPlan,
  // Phase 3: Distressed standalone
  getMyDistressedAlerts,
  upsertDistressedAlerts,
  runDistressedSubscriberAlerts,
  getSubscriberDistressedDeals,
  getSubscriberDistressedDetail,
  screenSubscriberDistressedDeal,
  getSubscriberDistressedMarketAnalysis,
  requestReferralIntro,
  getReferralPartners,
  upsertReferralPartner,
  getReferralLeads,
  updateReferralLead,
  getReferralSummary,
  previewPrequalification,
  submitPrequalification,
  getMyPrequalifications,
  submitHomeLoanApplication,
  getMyHomeLoanApplications,
  withdrawHomeLoanApplication,
  acceptHomeLoanOffer,
  getHomeLoanApplicationsAdmin,
  updateHomeLoanApplicationAdmin,
  getAnonymisedMarketData,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
