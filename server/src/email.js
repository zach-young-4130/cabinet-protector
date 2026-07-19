const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function appUrl() {
  return (process.env.APP_URL || 'http://localhost:4200').replace(/\/$/, '');
}

export function verificationUrl(token) {
  return `${appUrl()}/verify-email?token=${token}`;
}

export function passwordResetUrl(token) {
  return `${appUrl()}/reset-password?token=${token}`;
}

function firstNameOf(fullName) {
  return (fullName || '').trim().split(/\s+/)[0] || 'there';
}

function emailLayout(heading, bodyHtml, actionUrl, actionLabel, footer) {
  return `
    <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #1f2937;">
      <h1 style="color: #1f3a5f; font-size: 22px;">${heading}</h1>
      ${bodyHtml}
      <p style="margin: 28px 0;">
        <a href="${actionUrl}"
           style="background: #1f3a5f; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
          ${actionLabel}
        </a>
      </p>
      <p style="color: #6b7280; font-size: 13px;">
        Or paste this link into your browser:<br>${actionUrl}
      </p>
      <p style="color: #6b7280; font-size: 13px;">${footer}</p>
    </div>`;
}

// Fire-and-forget: email failures are logged, never thrown, so a signup, a
// paid order, or an admin action is never rolled back because an email didn't
// send. Without RESEND_API_KEY (dev) the link is logged to the console instead.
async function sendEmail({ to, subject, html, fallbackUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY not set — "${subject}" for ${to}: ${fallbackUrl}`);
    return;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'ProTectVinyl <onboarding@resend.dev>',
        to: [to],
        subject,
        html
      })
    });
    if (!res.ok) {
      console.error(`[email] Resend responded ${res.status} for ${to}: ${await res.text()}`);
    }
  } catch (err) {
    console.error(`[email] Failed to send "${subject}" to ${to}:`, err);
  }
}

export async function sendWelcomeEmail({ to, fullName, verifyUrl }) {
  await sendEmail({
    to,
    subject: 'Welcome to ProTectVinyl — please verify your email',
    fallbackUrl: verifyUrl,
    html: emailLayout(
      `Welcome to ProTectVinyl, ${firstNameOf(fullName)}!`,
      '<p>Your account is ready. Verify your email address to see your order history and manage your account.</p>',
      verifyUrl,
      'Verify my email',
      "This link expires in 7 days. If you didn't create a ProTectVinyl account, you can ignore this email."
    )
  });
}

export async function sendPasswordResetEmail({ to, fullName, resetUrl }) {
  await sendEmail({
    to,
    subject: 'Reset your ProTectVinyl password',
    fallbackUrl: resetUrl,
    html: emailLayout(
      `Hi ${firstNameOf(fullName)}, let's reset your password`,
      '<p>Click below to choose a new password for your ProTectVinyl account.</p>',
      resetUrl,
      'Reset my password',
      "This link expires in 1 hour and can be used once. If you didn't request a reset, you can ignore this email — your password is unchanged."
    )
  });
}
