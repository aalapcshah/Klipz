/**
 * Klipz Branded Email Templates
 * 
 * These templates provide consistent, branded email designs for all
 * transactional and notification emails sent from the Klipz platform.
 */

// Brand colors
const BRAND_COLORS = {
  primary: '#14b8a6',
  primaryDark: '#0d9488',
  background: '#0a0a0a',
  cardBackground: '#1a1a1a',
  text: '#ffffff',
  textMuted: '#a1a1aa',
  border: '#27272a',
};

// Base email wrapper with Klipz branding
export function getEmailWrapper(content: string, previewText?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Klipz</title>
  ${previewText ? `<!--[if !mso]><!--><meta name="x-apple-disable-message-reformatting"><!--<![endif]--><span style="display:none;font-size:1px;color:#0a0a0a;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${previewText}</span>` : ''}
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: ${BRAND_COLORS.background};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: ${BRAND_COLORS.cardBackground};
    }
    .email-header {
      background-color: ${BRAND_COLORS.background};
      padding: 32px 40px;
      text-align: center;
      border-bottom: 1px solid ${BRAND_COLORS.border};
    }
    .email-logo {
      width: 48px;
      height: 48px;
    }
    .email-brand {
      color: ${BRAND_COLORS.primary};
      font-size: 24px;
      font-weight: 700;
      margin-top: 12px;
      letter-spacing: -0.5px;
    }
    .email-body {
      padding: 40px;
      color: ${BRAND_COLORS.text};
    }
    .email-footer {
      background-color: ${BRAND_COLORS.background};
      padding: 24px 40px;
      text-align: center;
      border-top: 1px solid ${BRAND_COLORS.border};
    }
    .email-footer p {
      color: ${BRAND_COLORS.textMuted};
      font-size: 12px;
      margin: 0;
      line-height: 1.6;
    }
    .email-footer a {
      color: ${BRAND_COLORS.primary};
      text-decoration: none;
    }
    .btn-primary {
      display: inline-block;
      background-color: ${BRAND_COLORS.primary};
      color: ${BRAND_COLORS.background} !important;
      padding: 14px 28px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      margin: 16px 0;
    }
    .btn-primary:hover {
      background-color: ${BRAND_COLORS.primaryDark};
    }
    h1 {
      color: ${BRAND_COLORS.text};
      font-size: 24px;
      font-weight: 600;
      margin: 0 0 16px 0;
    }
    p {
      color: ${BRAND_COLORS.textMuted};
      font-size: 14px;
      line-height: 1.6;
      margin: 0 0 16px 0;
    }
    .highlight {
      color: ${BRAND_COLORS.primary};
      font-weight: 600;
    }
    .divider {
      height: 1px;
      background-color: ${BRAND_COLORS.border};
      margin: 24px 0;
    }
    .info-box {
      background-color: ${BRAND_COLORS.background};
      border: 1px solid ${BRAND_COLORS.border};
      border-radius: 8px;
      padding: 16px;
      margin: 16px 0;
    }
    .info-box p {
      margin: 0;
    }
  </style>
</head>
<body>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${BRAND_COLORS.background};">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" class="email-container" width="600" cellspacing="0" cellpadding="0" style="background-color: ${BRAND_COLORS.cardBackground}; border-radius: 12px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td class="email-header">
              <img src="cid:klipz-logo" alt="Klipz" class="email-logo" style="width: 48px; height: 48px;">
              <div class="email-brand">Klipz</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td class="email-body">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td class="email-footer">
              <p>© ${new Date().getFullYear()} Klipz. All rights reserved.</p>
              <p style="margin-top: 8px;">
                <a href="#">Privacy Policy</a> · <a href="#">Terms of Service</a> · <a href="#">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// Welcome email template
export function getWelcomeEmail(userName: string): string {
  const content = `
    <h1>Welcome to Klipz! 🎬</h1>
    <p>Hi <span class="highlight">${userName}</span>,</p>
    <p>Thanks for joining Klipz! We're excited to help you organize, enrich, and manage your media files with the power of AI.</p>
    <div class="divider"></div>
    <p><strong>Here's what you can do:</strong></p>
    <div class="info-box">
      <p>📁 <strong>Upload & Organize</strong> - Import your media and let AI categorize it automatically</p>
    </div>
    <div class="info-box">
      <p>✨ <strong>AI Enrichment</strong> - Generate titles, descriptions, and tags with one click</p>
    </div>
    <div class="info-box">
      <p>🎥 <strong>Video Recording</strong> - Capture screen, camera, or both with advanced features</p>
    </div>
    <div class="info-box">
      <p>📦 <strong>Collections</strong> - Group your files into smart collections for easy access</p>
    </div>
    <div style="text-align: center; margin-top: 24px;">
      <a href="#" class="btn-primary">Get Started</a>
    </div>
    <p style="text-align: center; margin-top: 24px; font-size: 12px;">Need help? Reply to this email or visit our help center.</p>
  `;
  return getEmailWrapper(content, 'Welcome to Klipz! Get started with AI-powered media management.');
}

// File enrichment complete notification
export function getEnrichmentCompleteEmail(userName: string, fileCount: number): string {
  const content = `
    <h1>Enrichment Complete! ✨</h1>
    <p>Hi <span class="highlight">${userName}</span>,</p>
    <p>Great news! We've finished enriching <span class="highlight">${fileCount} file${fileCount > 1 ? 's' : ''}</span> with AI-generated metadata.</p>
    <div class="info-box">
      <p>Your files now have:</p>
      <p style="margin-top: 8px;">• AI-generated titles and descriptions</p>
      <p>• Smart tags for easy searching</p>
      <p>• Quality scores and recommendations</p>
    </div>
    <div style="text-align: center; margin-top: 24px;">
      <a href="#" class="btn-primary">View Your Files</a>
    </div>
  `;
  return getEmailWrapper(content, `${fileCount} file${fileCount > 1 ? 's' : ''} enriched with AI metadata.`);
}

// Export complete notification
export function getExportCompleteEmail(userName: string, exportName: string, downloadUrl: string): string {
  const content = `
    <h1>Export Ready! 📦</h1>
    <p>Hi <span class="highlight">${userName}</span>,</p>
    <p>Your export "<span class="highlight">${exportName}</span>" is ready for download.</p>
    <div class="info-box">
      <p>⏰ This download link will expire in 24 hours.</p>
    </div>
    <div style="text-align: center; margin-top: 24px;">
      <a href="${downloadUrl}" class="btn-primary">Download Export</a>
    </div>
    <p style="text-align: center; margin-top: 16px; font-size: 12px; color: ${BRAND_COLORS.textMuted};">
      If the button doesn't work, copy this link:<br>
      <a href="${downloadUrl}" style="color: ${BRAND_COLORS.primary}; word-break: break-all;">${downloadUrl}</a>
    </p>
  `;
  return getEmailWrapper(content, `Your export "${exportName}" is ready for download.`);
}

// Storage quota warning
export function getStorageWarningEmail(userName: string, usedPercent: number): string {
  const content = `
    <h1>Storage Almost Full ⚠️</h1>
    <p>Hi <span class="highlight">${userName}</span>,</p>
    <p>Your Klipz storage is <span class="highlight">${usedPercent}%</span> full. You may not be able to upload new files soon.</p>
    <div class="info-box">
      <p><strong>Options to free up space:</strong></p>
      <p style="margin-top: 8px;">• Delete files you no longer need</p>
      <p>• Export and archive old collections</p>
      <p>• Upgrade your plan for more storage</p>
    </div>
    <div style="text-align: center; margin-top: 24px;">
      <a href="#" class="btn-primary">Manage Storage</a>
    </div>
  `;
  return getEmailWrapper(content, `Your storage is ${usedPercent}% full. Take action to avoid upload issues.`);
}

// Trial expiring notification
export function getTrialExpiringEmail(userName: string, daysRemaining: number): string {
  const content = `
    <h1>Your Trial is Ending Soon ⏳</h1>
    <p>Hi <span class="highlight">${userName}</span>,</p>
    <p>Your Klipz Pro trial expires in <span class="highlight">${daysRemaining} day${daysRemaining > 1 ? 's' : ''}</span>.</p>
    <p>Upgrade now to keep access to all Pro features:</p>
    <div class="info-box">
      <p>✓ Unlimited AI enrichment</p>
      <p>✓ Advanced video recording features</p>
      <p>✓ Priority processing</p>
      <p>✓ Extended storage</p>
    </div>
    <div style="text-align: center; margin-top: 24px;">
      <a href="#" class="btn-primary">Upgrade to Pro</a>
    </div>
    <p style="text-align: center; margin-top: 16px; font-size: 12px;">
      Have questions? <a href="#" style="color: ${BRAND_COLORS.primary};">Contact our team</a>
    </p>
  `;
  return getEmailWrapper(content, `Your Pro trial expires in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}. Upgrade now!`);
}

// Weekly digest email
export function getWeeklyDigestEmail(
  userName: string,
  stats: {
    filesUploaded: number;
    filesEnriched: number;
    collectionsCreated: number;
    storageUsed: string;
  }
): string {
  const content = `
    <h1>Your Weekly Summary 📊</h1>
    <p>Hi <span class="highlight">${userName}</span>,</p>
    <p>Here's what happened in your Klipz account this week:</p>
    <div class="divider"></div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td style="padding: 12px; text-align: center; border: 1px solid ${BRAND_COLORS.border}; border-radius: 8px 0 0 8px;">
          <div style="font-size: 28px; font-weight: 700; color: ${BRAND_COLORS.primary};">${stats.filesUploaded}</div>
          <div style="font-size: 12px; color: ${BRAND_COLORS.textMuted}; margin-top: 4px;">Files Uploaded</div>
        </td>
        <td style="padding: 12px; text-align: center; border: 1px solid ${BRAND_COLORS.border}; border-left: none;">
          <div style="font-size: 28px; font-weight: 700; color: ${BRAND_COLORS.primary};">${stats.filesEnriched}</div>
          <div style="font-size: 12px; color: ${BRAND_COLORS.textMuted}; margin-top: 4px;">Files Enriched</div>
        </td>
        <td style="padding: 12px; text-align: center; border: 1px solid ${BRAND_COLORS.border}; border-left: none; border-radius: 0 8px 8px 0;">
          <div style="font-size: 28px; font-weight: 700; color: ${BRAND_COLORS.primary};">${stats.collectionsCreated}</div>
          <div style="font-size: 12px; color: ${BRAND_COLORS.textMuted}; margin-top: 4px;">Collections</div>
        </td>
      </tr>
    </table>
    <div class="info-box" style="margin-top: 24px;">
      <p>💾 <strong>Storage Used:</strong> ${stats.storageUsed}</p>
    </div>
    <div style="text-align: center; margin-top: 24px;">
      <a href="#" class="btn-primary">View Dashboard</a>
    </div>
  `;
  return getEmailWrapper(content, `Your weekly Klipz summary: ${stats.filesUploaded} uploads, ${stats.filesEnriched} enriched.`);
}

// Password reset email (if needed in future)
export function getPasswordResetEmail(resetUrl: string): string {
  const content = `
    <h1>Reset Your Password 🔐</h1>
    <p>We received a request to reset your Klipz password.</p>
    <p>Click the button below to create a new password. This link expires in 1 hour.</p>
    <div style="text-align: center; margin-top: 24px;">
      <a href="${resetUrl}" class="btn-primary">Reset Password</a>
    </div>
    <div class="divider"></div>
    <p style="font-size: 12px;">If you didn't request this, you can safely ignore this email. Your password won't be changed.</p>
    <p style="font-size: 12px; color: ${BRAND_COLORS.textMuted};">
      If the button doesn't work, copy this link:<br>
      <a href="${resetUrl}" style="color: ${BRAND_COLORS.primary}; word-break: break-all;">${resetUrl}</a>
    </p>
  `;
  return getEmailWrapper(content, 'Reset your Klipz password');
}
