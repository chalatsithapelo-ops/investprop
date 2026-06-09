import { db } from "~/server/db";
import { sendNewOpportunityNotification, sendProgressSubmissionNotification as sendProgressSubmissionEmail } from "~/server/utils/email";

interface PropertyNotificationData {
  propertyId: number;
  title: string;
  /** "flip" | "rental" | "development" — derived from the related property model */
  propertyType: string;
  developmentType?: string;
  price: number;
  address: string;
  city: string;
  state: string;
  investmentStatus: string;
}

interface InvestorPreferences {
  preferredPropertyTypes?: string[];
  propertyTypes?: string[];
  developmentTypes?: string[];
  preferredLocations?: string[];
  preferredCities?: string[];
  preferredStates?: string[];
  notificationsEnabled?: boolean;
}

/** Normalise a string for loose, case-insensitive comparison. */
function norm(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Decide whether a property matches an investor's stated preferences.
 * Rules:
 *  - If the investor has explicitly disabled notifications, never match.
 *  - If a preference category is empty/unset, it does not restrict (treated as "any").
 *  - Property-type preferences are matched loosely (substring either direction) so the
 *    human-friendly UI labels (e.g. "Residential", "Affordable Housing") still match the
 *    underlying property/development type keys ("flip" | "rental" | "development").
 *  - Location preferences are matched loosely against the property's city/state/address.
 */
export function propertyMatchesPreferences(
  prefs: InvestorPreferences | null,
  property: PropertyNotificationData
): boolean {
  // No preferences object at all → opted in by default so investors aren't silently excluded.
  if (!prefs) return true;

  // Explicit opt-out always wins.
  if (prefs.notificationsEnabled === false) return false;

  // --- Property type matching ---
  const typePrefs = [
    ...(prefs.preferredPropertyTypes ?? []),
    ...(prefs.propertyTypes ?? []),
    ...(prefs.developmentTypes ?? []),
  ].map(norm);

  if (typePrefs.length > 0) {
    const propertyTypeTokens = [property.propertyType, property.developmentType ?? ""]
      .filter(Boolean)
      .map(norm);

    const typeMatch = typePrefs.some((pref) =>
      propertyTypeTokens.some(
        (token) => token.includes(pref) || pref.includes(token)
      )
    );

    if (!typeMatch) return false;
  }

  // --- Location matching ---
  const locationPrefs = [
    ...(prefs.preferredLocations ?? []),
    ...(prefs.preferredCities ?? []),
    ...(prefs.preferredStates ?? []),
  ].map(norm);

  if (locationPrefs.length > 0) {
    const locationTokens = [property.city, property.state, property.address]
      .filter(Boolean)
      .map(norm);

    const locationMatch = locationPrefs.some((pref) =>
      locationTokens.some(
        (token) => token.includes(pref) || pref.includes(token)
      )
    );

    if (!locationMatch) return false;
  }

  return true;
}

/**
 * Notify investors about new investment opportunities that match their preferences.
 * Sends BOTH an in-app notification and an email to each matching investor.
 * This function is called when:
 * - A property is published for funding (status set to RAISING_FUNDS)
 */
export async function notifyMatchingInvestors(
  propertyData: PropertyNotificationData
): Promise<void> {
  try {
    // Fetch all investors
    const allInvestors = await db.user.findMany({
      where: { role: "INVESTOR" },
      select: {
        id: true,
        name: true,
        email: true,
        investorPreferences: true,
      },
    });

    // Filter investors based on preferences
    const matchingInvestors = allInvestors.filter((investor) => {
      try {
        return propertyMatchesPreferences(
          investor.investorPreferences as InvestorPreferences | null,
          propertyData
        );
      } catch (error) {
        console.error(
          `Error parsing investor preferences for user ${investor.id}:`,
          error
        );
        // On parse failure, default to notifying so investors aren't silently dropped.
        return true;
      }
    });

    // If no matching investors, return early
    if (matchingInvestors.length === 0) {
      console.log(`No matching investors found for property ${propertyData.propertyId}`);
      return;
    }

    console.log(
      `Sending new opportunity notifications to ${matchingInvestors.length} investor(s) for property ${propertyData.propertyId}`
    );

    // Create in-app notifications in bulk.
    await db.notification
      .createMany({
        data: matchingInvestors.map((investor) => ({
          userId: investor.id,
          title: "New Investment Opportunity",
          message: `"${propertyData.title}" is now open for funding in ${propertyData.city}. Asking price: R${propertyData.price.toLocaleString("en-ZA")}.`,
          type: "INFO",
          category: "PROPERTY",
          relatedId: propertyData.propertyId,
        })),
      })
      .catch((error) => {
        console.error("Failed to create in-app opportunity notifications:", error);
      });

    // Send email to each matching investor (non-blocking, errors swallowed per-recipient).
    const emailPromises = matchingInvestors.map((investor) =>
      sendNewOpportunityNotification(
        {
          email: investor.email,
          name: investor.name,
        },
        {
          propertyTitle: propertyData.title,
          propertyId: propertyData.propertyId,
          propertyType: propertyData.propertyType,
          price: propertyData.price,
          address: propertyData.address,
          city: propertyData.city,
          state: propertyData.state,
          investmentStatus: propertyData.investmentStatus,
        }
      ).catch((error) => {
        console.error(
          `Failed to send new opportunity notification to ${investor.email}:`,
          error
        );
      })
    );

    await Promise.all(emailPromises);
    console.log(`Successfully sent notifications to ${matchingInvestors.length} investor(s)`);
  } catch (error) {
    console.error("Error in notifyMatchingInvestors:", error);
    // Don't throw - we don't want to block the main operation if notifications fail
  }
}

interface ProgressSubmissionNotificationData {
  propertyTitle: string;
  milestoneName: string;
  submitterName: string;
  propertyId: number;
  milestoneId: number;
}

/**
 * Notify an investor about a new progress submission for a property they invested in
 */
export async function sendProgressSubmissionNotification(
  investor: { email: string; name: string },
  data: ProgressSubmissionNotificationData
): Promise<void> {
  try {
    await sendProgressSubmissionEmail(investor, data);
    console.log(
      `✅ Sent progress notification to ${investor.email}: ${data.submitterName} submitted progress for "${data.milestoneName}" on ${data.propertyTitle}`
    );
  } catch (error) {
    console.error(
      `Failed to send progress notification to ${investor.email}:`,
      error
    );
    throw error;
  }
}
