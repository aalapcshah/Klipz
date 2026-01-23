export function PrivacyPolicy() {
  return (
    <div className="container max-w-4xl py-12">
      <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
      
      <div className="prose prose-invert max-w-none space-y-6">
        <p className="text-muted-foreground">
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">1. Introduction</h2>
          <p>
            MetaClips ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our AI-powered media management platform.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">2. Information We Collect</h2>
          <h3 className="text-xl font-semibold mt-6 mb-3">2.1 Personal Information</h3>
          <p>We collect the following personal information:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Account information (name, email address)</li>
            <li>Authentication data (OAuth tokens)</li>
            <li>Profile information you provide</li>
          </ul>

          <h3 className="text-xl font-semibold mt-6 mb-3">2.2 Media Files</h3>
          <p>When you upload files to MetaClips, we store:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>File content (images, videos, documents)</li>
            <li>File metadata (filename, size, type, upload date)</li>
            <li>AI-generated enrichment data (descriptions, tags, quality scores)</li>
            <li>Voice annotations and transcriptions</li>
          </ul>

          <h3 className="text-xl font-semibold mt-6 mb-3">2.3 Usage Data</h3>
          <p>We automatically collect:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Device information (browser type, operating system)</li>
            <li>Usage analytics (pages visited, features used)</li>
            <li>Performance data (load times, errors)</li>
            <li>IP address and location data (if permissions granted)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">3. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Provide and maintain the MetaClips service</li>
            <li>Process and enrich your media files using AI</li>
            <li>Improve our AI models and service quality</li>
            <li>Send service-related notifications</li>
            <li>Analyze usage patterns and optimize performance</li>
            <li>Detect and prevent fraud or abuse</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">4. Data Storage and Security</h2>
          <p>
            Your files are stored securely in cloud storage (Amazon S3) with encryption at rest and in transit. Metadata is stored in a secure database with regular backups. We implement industry-standard security measures including:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>HTTPS encryption for all data transmission</li>
            <li>Secure authentication via OAuth 2.0</li>
            <li>Regular security audits and updates</li>
            <li>Access controls and permission management</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">5. Third-Party Services</h2>
          <p>We use the following third-party services that may process your data:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>AI Processing:</strong> OpenAI and other AI providers for file enrichment</li>
            <li><strong>Storage:</strong> Amazon S3 for file storage</li>
            <li><strong>Payment Processing:</strong> Stripe for subscription payments</li>
            <li><strong>Analytics:</strong> Usage analytics for service improvement</li>
          </ul>
          <p className="mt-4">
            These services have their own privacy policies and are GDPR compliant.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">6. Your Rights (GDPR)</h2>
          <p>Under GDPR, you have the right to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Access:</strong> Request a copy of your personal data</li>
            <li><strong>Rectification:</strong> Correct inaccurate personal data</li>
            <li><strong>Erasure:</strong> Request deletion of your personal data</li>
            <li><strong>Portability:</strong> Export your data in a machine-readable format</li>
            <li><strong>Restriction:</strong> Limit how we process your data</li>
            <li><strong>Objection:</strong> Object to processing of your data</li>
            <li><strong>Withdraw Consent:</strong> Withdraw consent at any time</li>
          </ul>
          <p className="mt-4">
            To exercise these rights, visit your Account Settings or contact us at privacy@metaclips.com
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">7. Data Retention</h2>
          <p>
            We retain your personal data and files for as long as your account is active. When you delete your account, we will:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Immediately delete all your uploaded files from storage</li>
            <li>Anonymize or delete personal data within 30 days</li>
            <li>Retain anonymized usage data for analytics purposes</li>
            <li>Keep transaction records as required by law (up to 7 years)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">8. Cookies and Tracking</h2>
          <p>
            We use essential cookies for authentication and session management. We also use analytics cookies to understand how you use our service. You can manage cookie preferences in your browser settings or through our cookie consent banner.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">9. Children's Privacy</h2>
          <p>
            MetaClips is not intended for users under 16 years of age. We do not knowingly collect personal information from children. If you believe we have collected data from a child, please contact us immediately.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">10. International Data Transfers</h2>
          <p>
            Your data may be transferred to and processed in countries outside your jurisdiction. We ensure appropriate safeguards are in place, including Standard Contractual Clauses (SCCs) for transfers outside the EU.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of significant changes via email or through the service. Continued use after changes constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">12. Contact Us</h2>
          <p>
            For privacy-related questions or to exercise your rights, contact us at:
          </p>
          <ul className="list-none pl-0 space-y-2 mt-4">
            <li><strong>Email:</strong> privacy@metaclips.com</li>
            <li><strong>Data Protection Officer:</strong> dpo@metaclips.com</li>
            <li><strong>Address:</strong> [Your Company Address]</li>
          </ul>
          <p className="mt-4">
            EU residents can also lodge a complaint with your local data protection authority.
          </p>
        </section>
      </div>
    </div>
  );
}
