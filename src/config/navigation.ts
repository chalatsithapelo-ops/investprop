import type { UserRole } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  TrendingUp,
  Home,
  Building,
  DollarSign,
  BarChart3,
  Target,
  Upload,
  Plus,
  Settings,
  Landmark,
  Gavel,
  Wallet,
  BadgeDollarSign,
  FileText,
  Calculator,
  ShieldCheck,
  Shield,
  ArrowUpDown,
  FolderOpen,
  CreditCard,
  BookOpen,
  Scale,
  Zap,
  Send,
  ClipboardList,
  Award,
  Users,
  HardHat,
  Activity,
  Database,
  GitBranch,
  Inbox,
  Receipt,
  FileBarChart,
} from "lucide-react";

/**
 * Represents a navigation link in the application
 */
export type NavigationLink = {
  label: string;
  to: string;
  icon?: LucideIcon;
  roles?: UserRole[]; // If undefined, visible to all authenticated users
  description?: string;
  /**
   * When true, this link is hidden from ADMIN even though admins normally
   * see every link. Use for role-specific submission views that redirect
   * admins elsewhere (e.g. the property-owner-only Owner Portal).
   */
  adminHidden?: boolean;
};

/**
 * Main navigation links shown in the navbar
 */
export const mainNavigationLinks: NavigationLink[] = [
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: Building2,
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "INVESTOR", "PROPERTY_OWNER"],
  },
  {
    label: "Property Flips",
    to: "/flips",
    icon: TrendingUp,
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "INVESTOR", "PROPERTY_OWNER"],
  },
  {
    label: "Rental Bonds",
    to: "/rentals",
    icon: Home,
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "INVESTOR", "PROPERTY_OWNER"],
  },
  {
    label: "Developments",
    to: "/developments",
    icon: Building,
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "INVESTOR", "PROPERTY_OWNER"],
  },
  {
    label: "Investments",
    to: "/investments",
    icon: DollarSign,
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "INVESTOR", "PROPERTY_OWNER"],
  },
  {
    label: "Metrics",
    to: "/metrics",
    icon: BarChart3,
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "INVESTOR", "PROPERTY_OWNER"],
  },
  {
    label: "Project Management",
    to: "/project-management",
    icon: Target,
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
  },
  {
    label: "Contractor Management",
    to: "/contractor-management",
    icon: HardHat,
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
  },
  {
    label: "Contractor Portal",
    to: "/contractor-portal",
    icon: Upload,
    roles: ["CONTRACTOR"],
  },
  {
    label: "Investment Opportunities",
    to: "/investments/opportunities",
    icon: TrendingUp,
    roles: ["INVESTOR"],
  },
  {
    label: "My Investments",
    to: "/investments/my-contributions",
    icon: DollarSign,
    roles: ["INVESTOR"],
  },
  {
    label: "Investment Payments",
    to: "/investments/payments",
    icon: CreditCard,
    roles: ["INVESTOR"],
    description: "Complete approved investment payments and upload proof of payment",
  },
  {
    label: "Investment Preferences",
    to: "/investments/preferences",
    icon: Settings,
    roles: ["INVESTOR"],
  },
  {
    label: "My Certificates",
    to: "/investments/certificates",
    icon: Award,
    roles: ["INVESTOR"],
    description: "View your share certificates for fractional property investments",
  },
  {
    label: "Funding Campaigns",
    to: "/funding-campaigns",
    icon: Target,
    roles: ["DEVELOPMENT_MANAGER"],
  },
  {
    label: "Certificate Management",
    to: "/admin/certificates",
    icon: Shield,
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
    description: "Validate, track, and manage share certificates internally",
  },
  {
    label: "FICA Verification",
    to: "/admin/fica-verification",
    icon: ShieldCheck,
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
    description: "Verify investor identities and track FICA compliance status",
  },
  {
    label: "Action Required",
    to: "/admin/action-required",
    icon: Inbox,
    roles: ["DEVELOPMENT_MANAGER", "ADMIN"],
    description: "Everything needing admin attention in one inbox",
  },
  {
    label: "Distress Watchlist",
    to: "/admin/ai-distress",
    icon: Activity,
    roles: ["DEVELOPMENT_MANAGER", "ADMIN"],
    description: "AI early-warning scores for deals trending toward trouble",
  },
  {
    label: "Team Performance",
    to: "/admin/team",
    icon: Users,
    roles: ["DEVELOPMENT_MANAGER", "ADMIN"],
    description: "Per-manager delivery scorecards for internal oversight",
  },
  {
    label: "Audit Log",
    to: "/admin/audit-log",
    icon: ShieldCheck,
    roles: ["DEVELOPMENT_MANAGER", "ADMIN"],
    description: "Immutable POPIA-grade trail of every privileged action",
  },
  {
    label: "System Health",
    to: "/admin/system-health",
    icon: Activity,
    roles: ["ADMIN"],
    description: "Live system metrics, queue depths and recent activity",
  },
  {
    label: "Bulk Operations",
    to: "/admin/bulk-ops",
    icon: Users,
    roles: ["ADMIN"],
    description: "Approve or suspend multiple users at once",
  },
  {
    label: "Variations",
    to: "/admin/variations",
    icon: GitBranch,
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "ADMIN"],
    description: "Review and approve contractor variation orders",
  },
  {
    label: "Announcements",
    to: "/admin/announcements",
    icon: Send,
    roles: ["DEVELOPMENT_MANAGER", "ADMIN"],
    description: "Broadcast an announcement to investors and owners via in-app and email",
  },
  {
    label: "POPIA Subject Access",
    to: "/admin/popia-sar",
    icon: Database,
    roles: ["ADMIN"],
    description: "Export a user's full data record for POPIA SAR requests",
  },
  {
    label: "Document Vault",
    to: "/document-vault",
    icon: FolderOpen,
    roles: ["INVESTOR", "PROPERTY_OWNER"],
    description: "All your share certificates, receipts and legal documents",
  },
  {
    label: "SPV Management",
    to: "/spv-management",
    icon: Landmark,
    roles: ["DEVELOPMENT_MANAGER"],
    description: "Manage Special Purpose Vehicles for property ownership",
  },
  {
    label: "Acquisitions",
    to: "/acquisition-pipeline",
    icon: Gavel,
    roles: ["DEVELOPMENT_MANAGER"],
    description: "Track property acquisitions from auction to transfer",
  },
  {
    label: "My Portfolio",
    to: "/portfolio",
    icon: Wallet,
    roles: ["INVESTOR"],
    description: "View your fractional property holdings and returns",
  },
  {
    label: "Distributions & Voting",
    to: "/distributions",
    icon: BadgeDollarSign,
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "INVESTOR", "PROPERTY_OWNER"],
    description: "Income distributions and shareholder proposals",
  },
  {
    label: "Legal Documents",
    to: "/legal-documents",
    icon: FileText,
    roles: ["DEVELOPMENT_MANAGER"],
    description: "Generate MOI, share certificates, and compliance docs",
  },
  {
    label: "Property Financials",
    to: "/property-financials",
    icon: Calculator,
    roles: ["DEVELOPMENT_MANAGER"],
    description: "Track income, expenses, and cash flow per property",
  },
  {
    label: "KYC Compliance",
    to: "/kyc-compliance",
    icon: ShieldCheck,
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "INVESTOR", "PROPERTY_OWNER"],
    description: "FICA document upload and verification",
  },
  {
    label: "Compliance Dashboard",
    to: "/compliance-dashboard",
    icon: Shield,
    roles: ["DEVELOPMENT_MANAGER"],
    description: "Regulatory compliance overview and audit trail",
  },
  {
    label: "FSCA Readiness",
    to: "/fsca-readiness",
    icon: Scale,
    roles: ["DEVELOPMENT_MANAGER"],
    description: "CIS/CISCA compliance checklist for FSCA submission",
  },
  {
    label: "Financial Reports",
    to: "/financial-reports",
    icon: BarChart3,
    roles: ["DEVELOPMENT_MANAGER"],
    description: "SPV income statements, balance sheets, investor statements & tax reports",
  },
  {
    label: "Share Marketplace",
    to: "/share-marketplace",
    icon: ArrowUpDown,
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "INVESTOR", "PROPERTY_OWNER"],
    description: "Buy and sell fractional property shares",
  },
  {
    label: "Share Ledger",
    to: "/share-ledger",
    icon: BookOpen,
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "INVESTOR", "PROPERTY_OWNER"],
    description: "View your complete share transaction history",
  },
  {
    label: "My Documents",
    to: "/my-documents",
    icon: FolderOpen,
    roles: ["INVESTOR"],
    description: "Access your share certificates, tax certs, and SPV documents",
  },
  {
    label: "Tax Certificates",
    to: "/tax-certificates",
    icon: Receipt,
    roles: ["INVESTOR"],
    description: "Download your annual IT3 income summary for SARS filing",
  },
  {
    label: "Statements",
    to: "/statements",
    icon: FileBarChart,
    roles: ["INVESTOR"],
    description: "Download periodic statements of holdings, distributions and transactions",
  },
  {
    label: "Payments",
    to: "/payments",
    icon: CreditCard,
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "INVESTOR", "PROPERTY_OWNER"],
    description: "Payment gateway, transaction history & distribution payouts",
  },
  {
    label: "Distressed Finder",
    to: "/distressed-finder",
    icon: Zap,
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
    description: "AI-powered distressed property scanner for Gauteng bargains",
  },
  // ─── Owner Portal ────────────────────────────────────
  {
    label: "Owner Portal",
    to: "/owner-portal",
    icon: Send,
    roles: ["PROPERTY_OWNER"],
    adminHidden: true,
    description: "Submit and track your property sale proposals",
  },
  // ─── Dev Manager: Incoming Sale Proposals ────────────
  {
    label: "Sale Proposals",
    to: "/sale-proposals",
    icon: ClipboardList,
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "ADMIN"],
    description: "Review property sale submissions from owners",
  },
];

/**
 * Quick action links for creating new properties (shown on dashboard)
 */
export const quickActionLinks: NavigationLink[] = [
  {
    label: "Add Property Flip",
    to: "/properties/new",
    icon: Plus,
    description: "Create a new property flip investment",
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
  },
  {
    label: "Add Rental Property",
    to: "/properties/new",
    icon: Plus,
    description: "Create a new rental property",
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
  },
  {
    label: "Add Development",
    to: "/properties/new",
    icon: Plus,
    description: "Create a new development project",
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
  },
];

/**
 * Management tool links (shown on dashboard for managers and contractors)
 */
export const managementToolLinks: NavigationLink[] = [
  {
    label: "Project Management",
    to: "/project-management",
    icon: Target,
    description: "Manage milestones, track progress, review submissions, and monitor risks across all projects",
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
  },
  {
    label: "Contractor Management",
    to: "/contractor-management",
    icon: HardHat,
    description: "Onboard contractors, send RFQs, issue work orders, review invoices and track progress",
    roles: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
  },
  {
    label: "Contractor Portal",
    to: "/contractor-portal",
    icon: Upload,
    description: "View work orders, submit quotes, invoices, and progress reports",
    roles: ["CONTRACTOR"],
  },
  {
    label: "Admin Panel",
    to: "/admin",
    icon: Users,
    description: "Manage users, reset passwords, and assign roles",
    roles: ["DEVELOPMENT_MANAGER", "ADMIN"],
  },
];

/**
 * Filters navigation links based on user role
 *
 * @param links - Array of navigation links to filter
 * @param userRole - The user's role
 * @returns Filtered array of navigation links visible to the user
 */
export function getNavigationLinksForRole(
  links: NavigationLink[],
  userRole: UserRole | undefined
): NavigationLink[] {
  if (!userRole) return [];

  // ADMIN sees every link — admins are a superset of every operational role —
  // except links explicitly marked adminHidden (role-specific submission views
  // that redirect admins elsewhere, e.g. the Owner Portal).
  if (userRole === "ADMIN") return links.filter((link) => !link.adminHidden);

  return links.filter((link) => {
    // If no roles specified, link is visible to all authenticated users
    if (!link.roles) return true;

    // Check if user's role is in the allowed roles
    return link.roles.includes(userRole);
  });
}

/**
 * Gets main navigation links for a specific user role
 */
export function getMainNavigation(userRole: UserRole | undefined): NavigationLink[] {
  return getNavigationLinksForRole(mainNavigationLinks, userRole);
}

/**
 * Gets quick action links for a specific user role
 */
export function getQuickActions(userRole: UserRole | undefined): NavigationLink[] {
  return getNavigationLinksForRole(quickActionLinks, userRole);
}

/**
 * Gets management tool links for a specific user role
 */
export function getManagementTools(userRole: UserRole | undefined): NavigationLink[] {
  return getNavigationLinksForRole(managementToolLinks, userRole);
}
