import { env } from "~/server/env";

interface EmailRecipient {
  email: string;
  name: string;
}

interface MilestoneEmailData {
  propertyTitle: string;
  milestone: string;
  propertyId: number;
  amount: number;
  category: string;
}

interface ReturnDistributionEmailData {
  propertyTitle: string;
  propertyId: number;
  returnAmount: number;
  contributionAmount: number;
  returnRate: number;
}

interface NewOpportunityEmailData {
  propertyTitle: string;
  propertyId: number;
  propertyType: string;
  price: number;
  address: string;
  city: string;
  state: string;
  investmentStatus: string;
}

interface ProgressSubmissionEmailData {
  propertyTitle: string;
  milestoneName: string;
  submitterName: string;
  propertyId: number;
  milestoneId: number;
}

interface AnnouncementEmailData {
  title: string;
  message: string;
  senderName: string;
}

/**
 * Send an email using Resend (https://resend.com)
 * Requires EMAIL_SERVICE_API_KEY to be set in environment variables
 */
export async function sendEmail(
  to: EmailRecipient,
  subject: string,
  htmlContent: string,
  textContent: string
): Promise<void> {
  // Check if email service is configured
  if (!env.EMAIL_SERVICE_API_KEY || !env.EMAIL_FROM_ADDRESS) {
    console.log("⚠️  Email service not configured. Email would be sent:");
    console.log(`To: ${to.name} <${to.email}>`);
    console.log(`Subject: ${subject}`);
    console.log(`Content: ${textContent}`);
    return;
  }

  try {
    // Send email via Resend API
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.EMAIL_SERVICE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM_NAME
          ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`
          : env.EMAIL_FROM_ADDRESS,
        to: [to.email],
        subject,
        html: htmlContent,
        text: textContent,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Failed to send email:", errorData);
      throw new Error(`Failed to send email: ${response.statusText}`);
    }

    const result = await response.json();
    console.log("✅ Email sent successfully:", result.id);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}

/**
 * Send email notification when an investment reaches a milestone
 */
export async function sendMilestoneNotification(
  recipient: EmailRecipient,
  data: MilestoneEmailData
): Promise<void> {
  const subject = `Milestone Achieved: ${data.milestone} - ${data.propertyTitle}`;

  const textContent = `
Hello ${recipient.name},

Great news! Your investment in "${data.propertyTitle}" has reached an important milestone.

Milestone: ${data.milestone}
Budget Entry: R${data.amount.toLocaleString()} - ${data.category}

You can view more details about this property at:
Property ID: ${data.propertyId}

Thank you for your continued investment.

Best regards,
Investprop
  `.trim();

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .milestone { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Milestone Achieved!</h1>
    </div>
    <div class="content">
      <p>Hello ${recipient.name},</p>
      <p>Great news! Your investment in <strong>"${data.propertyTitle}"</strong> has reached an important milestone.</p>

      <div class="milestone">
        <h3>${data.milestone}</h3>
        <p><strong>Budget Entry:</strong> R${data.amount.toLocaleString()} - ${data.category}</p>
      </div>

      <p>This milestone represents significant progress in your investment. You can view more details about this property in your dashboard.</p>

      <p>Thank you for your continued investment.</p>

      <p>Best regards,<br>Investprop</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  await sendEmail(recipient, subject, htmlContent, textContent);
}

/**
 * Send email notification when returns are distributed to an investor
 */
export async function sendReturnDistributionNotification(
  recipient: EmailRecipient,
  data: ReturnDistributionEmailData
): Promise<void> {
  const subject = `Returns Distributed: ${data.propertyTitle}`;

  const textContent = `
Hello ${recipient.name},

Excellent news! Returns have been distributed for your investment in "${data.propertyTitle}".

Investment Details:
- Your Contribution: R${data.contributionAmount.toLocaleString()}
- Return Rate: ${data.returnRate.toFixed(2)}%
- Return Amount: R${data.returnAmount.toLocaleString()}

The returns have been processed and should reflect in your account shortly.

You can view more details about this property at:
Property ID: ${data.propertyId}

Thank you for investing with us!

Best regards,
Investprop
  `.trim();

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .returns-box { background: white; padding: 25px; border-radius: 8px; margin: 20px 0; border: 2px solid #10b981; }
    .amount { font-size: 32px; font-weight: bold; color: #10b981; margin: 10px 0; }
    .details { background: #f0fdf4; padding: 15px; border-radius: 6px; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💰 Returns Distributed!</h1>
    </div>
    <div class="content">
      <p>Hello ${recipient.name},</p>
      <p>Excellent news! Returns have been distributed for your investment in <strong>"${data.propertyTitle}"</strong>.</p>

      <div class="returns-box">
        <h3>Your Return</h3>
        <div class="amount">R${data.returnAmount.toLocaleString()}</div>

        <div class="details">
          <p><strong>Your Contribution:</strong> R${data.contributionAmount.toLocaleString()}</p>
          <p><strong>Return Rate:</strong> ${data.returnRate.toFixed(2)}%</p>
        </div>
      </div>

      <p>The returns have been processed and should reflect in your account shortly.</p>

      <p>Thank you for investing with us!</p>

      <p>Best regards,<br>Investprop</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  await sendEmail(recipient, subject, htmlContent, textContent);
}

/**
 * Send email notification when a new investment opportunity matching investor interests becomes available
 */
export async function sendNewOpportunityNotification(
  recipient: EmailRecipient,
  data: NewOpportunityEmailData
): Promise<void> {
  const subject = `New Investment Opportunity: ${data.propertyTitle}`;

  const textContent = `
Hello ${recipient.name},

A new investment opportunity matching your interests is now available!

Property: ${data.propertyTitle}
Type: ${data.propertyType}
Price: R${data.price.toLocaleString()}
Location: ${data.address}, ${data.city}, ${data.state}
Investment Status: ${data.investmentStatus.replace("_", " ")}

This opportunity matches your investment preferences. We encourage you to review the details and consider participating.

You can view more details about this property at:
Property ID: ${data.propertyId}

Don't miss out on this opportunity!

Best regards,
Investprop
  `.trim();

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .property-card { background: white; padding: 25px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .price { font-size: 28px; font-weight: bold; color: #3b82f6; margin: 10px 0; }
    .badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 6px 12px; border-radius: 4px; font-size: 14px; margin: 5px 5px 5px 0; }
    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏠 New Investment Opportunity!</h1>
    </div>
    <div class="content">
      <p>Hello ${recipient.name},</p>
      <p>A new investment opportunity matching your interests is now available!</p>

      <div class="property-card">
        <h2>${data.propertyTitle}</h2>
        <div class="price">R${data.price.toLocaleString()}</div>

        <p><strong>📍 Location:</strong> ${data.address}, ${data.city}, ${data.state}</p>

        <div>
          <span class="badge">${data.propertyType}</span>
          <span class="badge">${data.investmentStatus.replace("_", " ")}</span>
        </div>
      </div>

      <p>This opportunity matches your investment preferences. We encourage you to review the details and consider participating.</p>

      <p><strong>Don't miss out on this opportunity!</strong></p>

      <p>Best regards,<br>Investprop</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  await sendEmail(recipient, subject, htmlContent, textContent);
}

/**
 * Send email notification when a contractor submits progress for a milestone
 */
export async function sendProgressSubmissionNotification(
  recipient: EmailRecipient,
  data: ProgressSubmissionEmailData
): Promise<void> {
  const subject = `Progress Update: ${data.milestoneName} - ${data.propertyTitle}`;

  const textContent = `
Hello ${recipient.name},

A new progress update has been submitted for your investment in "${data.propertyTitle}".

Milestone: ${data.milestoneName}
Submitted by: ${data.submitterName}

${data.submitterName} has submitted photos and details documenting the progress on this milestone. You can review the submission and see the progress photos in your investment dashboard.

You can view more details about this property at:
Property ID: ${data.propertyId}

Thank you for your investment.

Best regards,
Investprop
  `.trim();

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .update-card { background: white; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
    .milestone-name { font-size: 20px; font-weight: bold; color: #d97706; margin-bottom: 10px; }
    .info-row { margin: 8px 0; }
    .label { font-weight: bold; color: #6b7280; }
    .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📸 New Progress Update</h1>
    </div>
    <div class="content">
      <p>Hello ${recipient.name},</p>
      <p>A new progress update has been submitted for your investment in <strong>"${data.propertyTitle}"</strong>.</p>

      <div class="update-card">
        <div class="milestone-name">${data.milestoneName}</div>
        <div class="info-row">
          <span class="label">Submitted by:</span> ${data.submitterName}
        </div>
      </div>

      <p>${data.submitterName} has submitted photos and details documenting the progress on this milestone. You can review the submission and see the progress photos in your investment dashboard.</p>

      <p>Thank you for your investment.</p>

      <p>Best regards,<br>Investprop</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  await sendEmail(recipient, subject, htmlContent, textContent);
}

/**
 * Send a general announcement email broadcast by an admin or development manager.
 */
export async function sendAnnouncementEmail(
  recipient: EmailRecipient,
  data: AnnouncementEmailData
): Promise<void> {
  const subject = data.title;

  // Preserve author line breaks in the plain-text and HTML versions.
  const messageHtml = data.message
    .split("\n")
    .map((line) => (line.trim() === "" ? "<br>" : `<p>${line}</p>`))
    .join("");

  const textContent = `
Hello ${recipient.name},

${data.message}

—
${data.senderName}
Investprop
  `.trim();

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .announcement-card { background: white; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4f46e5; }
    .sender { margin-top: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📢 ${data.title}</h1>
    </div>
    <div class="content">
      <p>Hello ${recipient.name},</p>

      <div class="announcement-card">
        ${messageHtml}
      </div>

      <p class="sender">— ${data.senderName}<br>Investprop</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  await sendEmail(recipient, subject, htmlContent, textContent);
}
