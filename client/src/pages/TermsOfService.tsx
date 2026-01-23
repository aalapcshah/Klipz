export function TermsOfService() {
  return (
    <div className="container max-w-4xl py-12">
      <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
      
      <div className="prose prose-invert max-w-none space-y-6">
        <p className="text-muted-foreground">
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">1. Acceptance of Terms</h2>
          <p>
            By accessing and using MetaClips, you accept and agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our service.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">2. Service Description</h2>
          <p>
            MetaClips is an AI-powered media management platform that allows you to upload, organize, enrich, and manage your media files (images, videos, documents). We provide features including:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>File upload and storage</li>
            <li>AI-powered enrichment (descriptions, tags, quality scoring)</li>
            <li>Voice annotations and transcriptions</li>
            <li>Collections and organization tools</li>
            <li>Search and discovery features</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">3. User Accounts</h2>
          <p>
            You must create an account to use MetaClips. You are responsible for:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Maintaining the confidentiality of your account credentials</li>
            <li>All activities that occur under your account</li>
            <li>Notifying us immediately of any unauthorized access</li>
            <li>Providing accurate and current information</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">4. Acceptable Use</h2>
          <p>You agree NOT to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Upload illegal, harmful, or infringing content</li>
            <li>Upload malware, viruses, or malicious code</li>
            <li>Violate intellectual property rights of others</li>
            <li>Use the service to harass, abuse, or harm others</li>
            <li>Attempt to gain unauthorized access to our systems</li>
            <li>Use automated tools to scrape or download content</li>
            <li>Resell or redistribute our service without permission</li>
            <li>Upload content depicting minors inappropriately</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">5. Content Ownership and License</h2>
          <p>
            You retain all ownership rights to the content you upload. By uploading content, you grant MetaClips a limited license to:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Store and process your files</li>
            <li>Use AI to analyze and enrich your content</li>
            <li>Display your content back to you through our service</li>
            <li>Create backups for service reliability</li>
          </ul>
          <p className="mt-4">
            We do NOT use your content to train AI models or share it with third parties except as necessary to provide the service.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">6. Storage Limits and Subscriptions</h2>
          <p>
            Free accounts include 10GB of storage. Additional storage requires a paid subscription. We reserve the right to:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Modify pricing and storage limits with 30 days notice</li>
            <li>Suspend accounts that exceed storage limits</li>
            <li>Delete files from inactive accounts after 180 days</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">7. Payment Terms</h2>
          <p>
            Paid subscriptions are processed through Stripe. By subscribing, you agree to:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Provide accurate payment information</li>
            <li>Authorize recurring charges for subscription renewals</li>
            <li>Pay all applicable taxes</li>
            <li>Accept that refunds are provided at our discretion</li>
          </ul>
          <p className="mt-4">
            You may cancel your subscription at any time. Cancellation takes effect at the end of the current billing period.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">8. Service Availability</h2>
          <p>
            We strive for 99.9% uptime but do not guarantee uninterrupted service. We may:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Perform scheduled maintenance with advance notice</li>
            <li>Experience temporary outages due to technical issues</li>
            <li>Modify or discontinue features with reasonable notice</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">9. Termination</h2>
          <p>
            We may suspend or terminate your account if you:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Violate these Terms of Service</li>
            <li>Engage in fraudulent or illegal activity</li>
            <li>Fail to pay subscription fees</li>
            <li>Pose a security risk to our service</li>
          </ul>
          <p className="mt-4">
            You may delete your account at any time through Account Settings. Upon termination, your files will be permanently deleted within 30 days.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">10. Disclaimer of Warranties</h2>
          <p>
            MetaClips is provided "AS IS" without warranties of any kind. We do not guarantee:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Accuracy of AI-generated enrichment data</li>
            <li>Uninterrupted or error-free service</li>
            <li>Security against all cyber threats</li>
            <li>Compatibility with all devices or browsers</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">11. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, MetaClips shall not be liable for:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Loss of data or content</li>
            <li>Indirect, incidental, or consequential damages</li>
            <li>Loss of profits or business opportunities</li>
            <li>Damages exceeding the amount you paid in the past 12 months</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">12. Indemnification</h2>
          <p>
            You agree to indemnify and hold MetaClips harmless from any claims, damages, or expenses arising from:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Your use of the service</li>
            <li>Content you upload</li>
            <li>Violation of these terms</li>
            <li>Infringement of third-party rights</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">13. Governing Law</h2>
          <p>
            These terms are governed by the laws of [Your Jurisdiction]. Any disputes shall be resolved through binding arbitration or in the courts of [Your Jurisdiction].
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">14. Changes to Terms</h2>
          <p>
            We may update these Terms of Service from time to time. We will notify you of material changes via email or through the service. Continued use after changes constitutes acceptance.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mt-8 mb-4">15. Contact</h2>
          <p>
            For questions about these terms, contact us at:
          </p>
          <ul className="list-none pl-0 space-y-2 mt-4">
            <li><strong>Email:</strong> legal@metaclips.com</li>
            <li><strong>Support:</strong> support@metaclips.com</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
