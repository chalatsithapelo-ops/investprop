import {
  createCallerFactory,
  createTRPCRouter,
} from "~/server/trpc/main";
import { register } from "~/server/trpc/procedures/register";
import { login } from "~/server/trpc/procedures/login";
import { logout } from "~/server/trpc/procedures/logout";
import { refreshToken } from "~/server/trpc/procedures/refreshToken";
import { getMe } from "~/server/trpc/procedures/getMe";
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
import { createBudgetEntry } from "~/server/trpc/procedures/createBudgetEntry";
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
import { getAllUsers, getUserById, updateUser, deleteUser, resetUserPassword, getSystemStats, createUser, approveUser, suspendUser, unsuspendUser, appointComplianceOfficer } from "~/server/trpc/procedures/admin";
import { uploadFile } from "~/server/trpc/procedures/uploadFile";
// SPV & Acquisition Pipeline
import { getSPVs, getSPVById, createSPV, updateSPV, assignPropertyToSPV, removePropertyFromSPV } from "~/server/trpc/procedures/spv";
import { createAcquisition, getAcquisitions, updateAcquisitionStatus } from "~/server/trpc/procedures/acquisition";
// Fractional Ownership (Shares)
import { createShareClass, getShareInfo, purchaseShares, transferShares, getShareLedger, getInvestorPortfolio, requestCoolingOffWithdrawal } from "~/server/trpc/procedures/shares";
// Distribution Engine
import { createDistribution, getDistributions, executeDistribution, getMyDistributions } from "~/server/trpc/procedures/distributions";
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
import { placeShareOrder, getOrderBook, getMyOrders, cancelShareOrder, getTradeHistory, getSharePriceHistory, getMarketplaceOverview } from "~/server/trpc/procedures/share-marketplace";
// Phase 8: Payment Gateway (Paystack)
import { initiateDistributionPayout, verifyPaystackTransfer, initializePayment, verifyPayment, getPaystackBalance, getPaymentGatewayStatus } from "~/server/trpc/procedures/payments";
// Phase 9: Distressed Property Finder
import { getDistressedListings, triggerDistressedScrape, getScrapeLogs, getDistressedSources, toggleDistressedFavourite, addDistressedListing, updateDistressedStatus, deleteDistressedListing } from "~/server/trpc/procedures/distressed-finder";
// Owner Sale Proposals
import { submitSaleProposal, getMySaleProposals, getSaleProposals, reviewSaleProposal, withdrawSaleProposal } from "~/server/trpc/procedures/owner-proposals";
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

export const appRouter = createTRPCRouter({
  register,
  login,
  logout,
  refreshToken,
  getMe,
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
  createProgressSubmission,
  getProgressSubmissions,
  reviewProgressSubmission,
  createRisk,
  getRisks,
  updateRisk,
  getInvestorPreferences,
  updateInvestorPreferences,
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
  uploadFile,
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
  // Distribution Engine
  createDistribution,
  getDistributions,
  executeDistribution,
  getMyDistributions,
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
  getScrapeLogs,
  getDistressedSources,
  toggleDistressedFavourite,
  addDistressedListing,
  updateDistressedStatus,
  deleteDistressedListing,
  // Owner Sale Proposals
  submitSaleProposal,
  getMySaleProposals,
  getSaleProposals,
  reviewSaleProposal,
  withdrawSaleProposal,
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
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
