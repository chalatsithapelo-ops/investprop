# Email Integration Setup Guide

This application uses [Resend](https://resend.com) for sending transactional emails.

## Quick Start

### 1. Sign Up for Resend

1. Go to https://resend.com
2. Click "Sign Up" and create an account
3. You'll get 100 free emails per day (3,000/month)

### 2. Verify Your Domain

To send emails from `info@square15.co.za`, you need to verify the `square15.co.za` domain:

1. In your Resend dashboard, go to **Domains**
2. Click **Add Domain**
3. Enter `square15.co.za`
4. Resend will provide DNS records to add:
   - **SPF Record** (TXT)
   - **DKIM Records** (TXT)
   - **DMARC Record** (TXT) - optional but recommended

5. Add these DNS records to your domain registrar (where you manage square15.co.za)
   - This usually takes 5-30 minutes to propagate
   - Some registrars can take up to 48 hours

6. Return to Resend and click **Verify Domain**
   - Status will change from "Pending" to "Verified" when successful

### 3. Get Your API Key

1. In Resend dashboard, go to **API Keys**
2. Click **Create API Key**
3. Give it a name (e.g., "Investprop")
4. Select permissions: **Sending access**
5. Click **Create**
6. **Copy the API key** (starts with `re_`)
   - ⚠️ You can only see this once! Save it securely.

### 4. Update Environment Variables

Update your `.env` file with the API key:

```bash
EMAIL_SERVICE_API_KEY=re_your_actual_api_key_here
EMAIL_FROM_ADDRESS=info@square15.co.za
EMAIL_FROM_NAME=Square 15
```

### 5. Test the Integration

Once configured, the application will automatically send emails for:

- **Investment Milestones** - When properties reach important milestones
- **Return Distributions** - When returns are distributed to investors
- **New Opportunities** - When new investment opportunities become available

You can test by triggering one of these events in the application.

## DNS Record Example

When you add your domain to Resend, you'll need to add DNS records similar to these:

### SPF Record
```
Type: TXT
Name: @
Value: v=spf1 include:_spf.resend.com ~all
```

### DKIM Records (you'll get 3 of these)
```
Type: TXT
Name: resend._domainkey
Value: [long string provided by Resend]

Type: TXT
Name: resend2._domainkey
Value: [long string provided by Resend]

Type: TXT
Name: resend3._domainkey
Value: [long string provided by Resend]
```

### DMARC Record (optional but recommended)
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:info@square15.co.za
```

## Troubleshooting

### "Domain not verified" error
- Wait longer for DNS propagation (can take up to 48 hours)
- Check that DNS records are added correctly
- Use a DNS checker tool: https://mxtoolbox.com/SuperTool.aspx

### "Invalid API key" error
- Make sure you copied the entire API key (starts with `re_`)
- Check for extra spaces in the `.env` file
- Regenerate the API key in Resend dashboard if needed

### Emails not sending
- Check console logs for error messages
- Verify domain status is "Verified" in Resend
- Check Resend dashboard for email logs and errors
- Ensure you haven't exceeded the free tier limit (100/day)

## Alternative Email Providers

If you prefer a different provider, you can modify `src/server/utils/email.ts`:

### SendGrid
- API Endpoint: `https://api.sendgrid.com/v3/mail/send`
- Auth Header: `Authorization: Bearer YOUR_API_KEY`

### Mailgun
- API Endpoint: `https://api.mailgun.net/v3/YOUR_DOMAIN/messages`
- Auth: Basic auth with `api:YOUR_API_KEY`

### AWS SES
- Requires AWS SDK integration
- More complex setup but very scalable

## Email Templates

The application includes three email templates:

1. **Milestone Notification** - Purple gradient header
2. **Return Distribution** - Green gradient header
3. **New Opportunity** - Blue gradient header

All templates are responsive and include both HTML and plain text versions.

## Support

- Resend Documentation: https://resend.com/docs
- Resend Support: support@resend.com
- Check Resend status: https://status.resend.com
