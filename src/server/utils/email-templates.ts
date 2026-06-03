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
};
