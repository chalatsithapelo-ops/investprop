export const emailTemplates = {
  emailVerification: (verificationUrl: string, userName: string) => ({
    subject: "Verify Your Email - Investprop",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
            .content { background: #f9fafb; padding: 30px; }
            .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to Investprop</h1>
            </div>
            <div class="content">
              <h2>Hello ${userName}!</h2>
              <p>Thank you for registering with us. Please verify your email address to activate your account.</p>
              <p>Click the button below to verify your email:</p>
              <a href="${verificationUrl}" class="button">Verify Email</a>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #2563eb;">${verificationUrl}</p>
              <p><strong>This link will expire in 24 hours.</strong></p>
              <p>If you didn't create an account, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Investprop. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      Hello ${userName}!

      Thank you for registering with Investprop.

      Please verify your email address by clicking the link below:
      ${verificationUrl}

      This link will expire in 24 hours.

      If you didn't create an account, please ignore this email.

      © ${new Date().getFullYear()} Investprop. All rights reserved.
    `,
  }),

  passwordReset: (resetUrl: string, userName: string) => ({
    subject: "Reset Your Password - Investprop",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
            .content { background: #f9fafb; padding: 30px; }
            .button { display: inline-block; padding: 12px 24px; background: #dc2626; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <h2>Hello ${userName}!</h2>
              <p>We received a request to reset your password. Click the button below to create a new password:</p>
              <a href="${resetUrl}" class="button">Reset Password</a>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #dc2626;">${resetUrl}</p>
              <p><strong>This link will expire in 1 hour.</strong></p>
              <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Investprop. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      Hello ${userName}!

      We received a request to reset your password.

      Click the link below to reset your password:
      ${resetUrl}

      This link will expire in 1 hour.

      If you didn't request a password reset, please ignore this email.

      © ${new Date().getFullYear()} Investprop. All rights reserved.
    `,
  }),

  investmentProposalReceived: (propertyTitle: string, amount: number, investorName: string) => ({
    subject: `New Investment Proposal - ${propertyTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #059669; color: white; padding: 20px; text-align: center; }
            .content { background: #f9fafb; padding: 30px; }
            .button { display: inline-block; padding: 12px 24px; background: #059669; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>New Investment Proposal</h1>
            </div>
            <div class="content">
              <h2>You have a new investment proposal!</h2>
              <p><strong>${investorName}</strong> has submitted an investment proposal for:</p>
              <ul>
                <li><strong>Property:</strong> ${propertyTitle}</li>
                <li><strong>Amount:</strong> R${amount.toLocaleString()}</li>
              </ul>
              <p>Please review and respond to this proposal in your dashboard.</p>
              <a href="${process.env.BASE_URL || 'http://localhost:3000'}/funding-campaigns" class="button">Review Proposal</a>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Investprop. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      New Investment Proposal

      ${investorName} has submitted an investment proposal for:
      - Property: ${propertyTitle}
      - Amount: R${amount.toLocaleString()}

      Please review this proposal in your dashboard at:
      ${process.env.BASE_URL || 'http://localhost:3000'}/funding-campaigns

      © ${new Date().getFullYear()} Investprop. All rights reserved.
    `,
  }),

  proposalStatusUpdate: (propertyTitle: string, status: string, investorName: string) => ({
    subject: `Investment Proposal ${status} - ${propertyTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${status === 'APPROVED' ? '#059669' : '#dc2626'}; color: white; padding: 20px; text-align: center; }
            .content { background: #f9fafb; padding: 30px; }
            .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Proposal ${status}</h1>
            </div>
            <div class="content">
              <h2>Hello ${investorName}!</h2>
              <p>Your investment proposal for <strong>${propertyTitle}</strong> has been <strong>${status.toLowerCase()}</strong>.</p>
              ${status === 'APPROVED' ? '<p>Congratulations! You can now proceed with your investment.</p>' : '<p>We appreciate your interest. Please feel free to explore other investment opportunities.</p>'}
              <a href="${process.env.BASE_URL || 'http://localhost:3000'}/investments/my-contributions" class="button">View Details</a>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Investprop. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      Proposal ${status}

      Hello ${investorName}!

      Your investment proposal for ${propertyTitle} has been ${status.toLowerCase()}.

      View details at:
      ${process.env.BASE_URL || 'http://localhost:3000'}/investments/my-contributions

      © ${new Date().getFullYear()} Investprop. All rights reserved.
    `,
  }),

  paymentConfirmed: (userName: string, propertyTitle: string, amount: number) => ({
    subject: `Payment Confirmed - ${propertyTitle}`,
    html: `
      <!DOCTYPE html>
      <html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #059669; color: white; padding: 20px; text-align: center;"><h1>Payment Confirmed</h1></div>
          <div style="background: #f9fafb; padding: 30px;">
            <h2>Hello ${userName},</h2>
            <p>We have confirmed receipt of your payment of <strong>R${amount.toLocaleString()}</strong> for <strong>${propertyTitle}</strong>.</p>
            <p>Your investment is now active. A share certificate will be issued shortly once all post-payment checks are complete.</p>
            <a href="${process.env.BASE_URL || 'http://localhost:3000'}/investments/my-contributions" style="display:inline-block;padding:12px 24px;background:#059669;color:white;text-decoration:none;border-radius:5px;margin:20px 0;">View My Investments</a>
            <p style="font-size:12px;color:#666;">A 5-business-day cooling-off period now applies. You may cancel this investment at no charge during this window.</p>
          </div>
          <div style="text-align:center;padding:20px;color:#666;font-size:12px;">&copy; ${new Date().getFullYear()} Investprop. All rights reserved.</div>
        </div>
      </body></html>
    `,
    text: `Payment Confirmed\n\nHello ${userName},\n\nWe have confirmed receipt of your payment of R${amount.toLocaleString()} for ${propertyTitle}.\n\nYour investment is now active. A share certificate will be issued shortly.\n\nA 5-business-day cooling-off period applies — you may cancel at no charge during this window.\n\n${process.env.BASE_URL || 'http://localhost:3000'}/investments/my-contributions`,
  }),

  certificateIssued: (userName: string, propertyTitle: string, certificateNumber: string, shareCount: number) => ({
    subject: `Share Certificate Issued - ${propertyTitle}`,
    html: `
      <!DOCTYPE html>
      <html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #d97706; color: white; padding: 20px; text-align: center;"><h1>Share Certificate Issued</h1></div>
          <div style="background: #f9fafb; padding: 30px;">
            <h2>Hello ${userName},</h2>
            <p>Your share certificate for <strong>${propertyTitle}</strong> has been issued.</p>
            <ul>
              <li>Certificate number: <strong>${certificateNumber}</strong></li>
              <li>Shares held: <strong>${shareCount.toLocaleString()}</strong></li>
            </ul>
            <a href="${process.env.BASE_URL || 'http://localhost:3000'}/investments/certificates" style="display:inline-block;padding:12px 24px;background:#d97706;color:white;text-decoration:none;border-radius:5px;margin:20px 0;">Download Certificate</a>
            <p style="font-size:12px;color:#666;">Keep this certificate safe — it is proof of your shareholding under SA Companies Act 71 of 2008.</p>
          </div>
          <div style="text-align:center;padding:20px;color:#666;font-size:12px;">&copy; ${new Date().getFullYear()} Investprop. All rights reserved.</div>
        </div>
      </body></html>
    `,
    text: `Share Certificate Issued\n\nHello ${userName},\n\nYour share certificate for ${propertyTitle} has been issued.\n\nCertificate number: ${certificateNumber}\nShares held: ${shareCount.toLocaleString()}\n\nDownload: ${process.env.BASE_URL || 'http://localhost:3000'}/investments/certificates`,
  }),

  distributionNotification: (userName: string, propertyTitle: string, amount: number, distributionType: string, period?: string) => ({
    subject: `Distribution Paid - ${propertyTitle}`,
    html: `
      <!DOCTYPE html>
      <html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #059669; color: white; padding: 20px; text-align: center;"><h1>Distribution Paid</h1></div>
          <div style="background: #f9fafb; padding: 30px;">
            <h2>Hello ${userName},</h2>
            <p>A distribution has been paid to you for <strong>${propertyTitle}</strong>.</p>
            <ul>
              <li>Type: <strong>${distributionType}</strong></li>
              <li>Amount: <strong>R${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></li>
              ${period ? `<li>Period: <strong>${period}</strong></li>` : ""}
            </ul>
            <p>Funds will reflect in your nominated bank account within 1–3 business days.</p>
            <a href="${process.env.BASE_URL || 'http://localhost:3000'}/distributions" style="display:inline-block;padding:12px 24px;background:#059669;color:white;text-decoration:none;border-radius:5px;margin:20px 0;">View Distribution History</a>
            <p style="font-size:12px;color:#666;">An IT3(b) tax certificate will be issued at the end of the tax year for SARS reporting.</p>
          </div>
          <div style="text-align:center;padding:20px;color:#666;font-size:12px;">&copy; ${new Date().getFullYear()} Investprop. All rights reserved.</div>
        </div>
      </body></html>
    `,
    text: `Distribution Paid\n\nHello ${userName},\n\nA ${distributionType} distribution of R${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} has been paid for ${propertyTitle}${period ? ` (${period})` : ""}.\n\nFunds will reflect in 1–3 business days.\n\n${process.env.BASE_URL || 'http://localhost:3000'}/distributions`,
  }),

  coolingOffExpiringReminder: (userName: string, propertyTitle: string, hoursRemaining: number) => ({
    subject: `Cooling-off period ending soon - ${propertyTitle}`,
    html: `
      <!DOCTYPE html>
      <html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #d97706; color: white; padding: 20px; text-align: center;"><h1>Cooling-off Period Ending Soon</h1></div>
          <div style="background: #f9fafb; padding: 30px;">
            <h2>Hello ${userName},</h2>
            <p>Your statutory 5-business-day cooling-off period for your investment in <strong>${propertyTitle}</strong> ends in approximately <strong>${hoursRemaining} hours</strong>.</p>
            <p>After this period, the investment becomes irrevocable and standard refund procedures will apply.</p>
            <p>If you wish to cancel and receive a full refund at no charge, please act now.</p>
            <a href="${process.env.BASE_URL || 'http://localhost:3000'}/investments/my-contributions" style="display:inline-block;padding:12px 24px;background:#d97706;color:white;text-decoration:none;border-radius:5px;margin:20px 0;">Review Investment</a>
            <p style="font-size:12px;color:#666;">This reminder is sent in terms of the Consumer Protection Act 68 of 2008 and FAIS Act 37 of 2002.</p>
          </div>
          <div style="text-align:center;padding:20px;color:#666;font-size:12px;">&copy; ${new Date().getFullYear()} Investprop. All rights reserved.</div>
        </div>
      </body></html>
    `,
    text: `Cooling-off Period Ending Soon\n\nHello ${userName},\n\nYour 5-business-day cooling-off period for ${propertyTitle} ends in approximately ${hoursRemaining} hours.\n\nAfter this period the investment is irrevocable.\n\nTo cancel: ${process.env.BASE_URL || 'http://localhost:3000'}/investments/my-contributions`,
  }),
};
