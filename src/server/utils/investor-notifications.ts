import { db } from "~/server/db";
import { sendNewOpportunityNotification, sendProgressSubmissionNotification as sendProgressSubmissionEmail } from "~/server/utils/email";

interface PropertyNotificationData {
  propertyId: number;
  title: string;
  propertyType: "flip" | "rental" | "development";
  developmentType?: "AFFORDABLE_RESALE" | "AFFORDABLE_RENTAL" | "COMMERCIAL_RENTAL";
  price: number;
  address: string;
  city: string;
  state: string;
  investmentStatus: string;
}

/**
 * Notify investors about new investment opportunities that match their preferences
 * This function is called when:
 * - A new property is created with status RAISING_FUNDS, FUNDED, or PROJECT_STARTED
 * - An existing property's status is changed to RAISING_FUNDS
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
      // If no preferences set, don't notify (investor hasn't opted in)
      if (!investor.investorPreferences) {
        return false;
      }

      try {
        const prefs = investor.investorPreferences as {
          propertyTypes?: string[];
          developmentTypes?: string[];
        };

        // Check if investor is interested in this property type
        if (prefs.propertyTypes && prefs.propertyTypes.includes(propertyData.propertyType)) {
          // For development properties, also check development type if specified
          if (propertyData.propertyType === "development" && propertyData.developmentType) {
            return (
              prefs.developmentTypes &&
              prefs.developmentTypes.includes(propertyData.developmentType)
            );
          }
          return true;
        }

        return false;
      } catch (error) {
        console.error(
          `Error parsing investor preferences for user ${investor.id}:`,
          error
        );
        return false;
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

    // Send email to each matching investor (non-blocking)
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

    // Send emails in background (don't wait for them)
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
