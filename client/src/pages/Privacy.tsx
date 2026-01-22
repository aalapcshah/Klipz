export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-12 px-4 max-w-4xl">
        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
            <p className="text-muted-foreground">Last Updated: January 22, 2026</p>
          </div>

          <section className="space-y-4">
            <p className="text-foreground/90 leading-relaxed">
              At MetaClips, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service. Please read this privacy policy carefully.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">1. Information We Collect</h2>
            
            <h3 className="text-xl font-semibold mt-4">Personal Information</h3>
            <p className="text-foreground/90 leading-relaxed">
              We collect personal information that you voluntarily provide when registering for an account, including:
            </p>
            <ul className="list-disc list-inside space-y-2 text-foreground/90 ml-4">
              <li>Name and email address</li>
              <li>Profile information (location, age, company, job title, bio)</li>
              <li>Authentication credentials (managed through third-party OAuth providers)</li>
            </ul>

            <h3 className="text-xl font-semibold mt-4">User Content</h3>
            <p className="text-foreground/90 leading-relaxed">
              We store the media files, annotations, tags, collections, and other content you upload to the Service ("User Content"). This may include images, videos, audio recordings, transcripts, and associated metadata.
            </p>

            <h3 className="text-xl font-semibold mt-4">Usage Data</h3>
            <p className="text-foreground/90 leading-relaxed">
              We automatically collect certain information about your device and how you interact with the Service, including:
            </p>
            <ul className="list-disc list-inside space-y-2 text-foreground/90 ml-4">
              <li>IP address and browser type</li>
              <li>Pages visited and features used</li>
              <li>Time and date of visits</li>
              <li>File upload and download activity</li>
              <li>Search queries and filter preferences</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">2. How We Use Your Information</h2>
            <p className="text-foreground/90 leading-relaxed">
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-foreground/90 ml-4">
              <li>Provide, operate, and maintain the Service</li>
              <li>Process and store your User Content</li>
              <li>Perform AI analysis and enrichment on your media files</li>
              <li>Improve and personalize your experience</li>
              <li>Communicate with you about the Service, including updates and support</li>
              <li>Send marketing communications (only if you opt in)</li>
              <li>Detect, prevent, and address technical issues and security threats</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">3. AI Processing and Third-Party Services</h2>
            <p className="text-foreground/90 leading-relaxed">
              We use third-party AI services to analyze your User Content and provide features such as automatic tagging, object detection, OCR, and transcription. Your User Content may be processed by these third-party services in accordance with their own privacy policies. We carefully select service providers that maintain high standards of data protection.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">4. Data Sharing and Disclosure</h2>
            <p className="text-foreground/90 leading-relaxed">
              We do not sell your personal information. We may share your information in the following circumstances:
            </p>
            <ul className="list-disc list-inside space-y-2 text-foreground/90 ml-4">
              <li><strong>Service Providers:</strong> We share data with third-party vendors who perform services on our behalf, such as cloud hosting, AI processing, and email delivery</li>
              <li><strong>Legal Requirements:</strong> We may disclose your information if required by law or in response to valid legal requests</li>
              <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred to the acquiring entity</li>
              <li><strong>With Your Consent:</strong> We may share your information with third parties when you explicitly consent</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">5. Data Storage and Security</h2>
            <p className="text-foreground/90 leading-relaxed">
              We store your User Content on secure cloud storage infrastructure. We implement industry-standard security measures to protect your information, including encryption in transit and at rest, access controls, and regular security audits. However, no method of transmission over the internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">6. Data Retention</h2>
            <p className="text-foreground/90 leading-relaxed">
              We retain your personal information and User Content for as long as your account is active or as needed to provide you the Service. You may delete your User Content at any time. If you deactivate your account, we will delete your data from our active systems within 30 days, though backup copies may persist for a reasonable period for disaster recovery purposes.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">7. Your Rights (GDPR)</h2>
            <p className="text-foreground/90 leading-relaxed">
              If you are a resident of the European Economic Area (EEA), you have certain data protection rights under the General Data Protection Regulation (GDPR):
            </p>
            <ul className="list-disc list-inside space-y-2 text-foreground/90 ml-4">
              <li><strong>Right to Access:</strong> You can request a copy of your personal data</li>
              <li><strong>Right to Rectification:</strong> You can request correction of inaccurate data</li>
              <li><strong>Right to Erasure:</strong> You can request deletion of your personal data</li>
              <li><strong>Right to Restrict Processing:</strong> You can request limitation of how we process your data</li>
              <li><strong>Right to Data Portability:</strong> You can request a copy of your data in a structured format</li>
              <li><strong>Right to Object:</strong> You can object to our processing of your data</li>
              <li><strong>Right to Withdraw Consent:</strong> You can withdraw consent for marketing communications at any time</li>
            </ul>
            <p className="text-foreground/90 leading-relaxed mt-4">
              To exercise these rights, please contact us at privacy@metaclips.com.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">8. Cookies and Tracking Technologies</h2>
            <p className="text-foreground/90 leading-relaxed">
              We use cookies and similar tracking technologies to maintain your session, remember your preferences, and analyze usage patterns. You can control cookie settings through your browser, but disabling cookies may limit your ability to use certain features of the Service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">9. Children's Privacy</h2>
            <p className="text-foreground/90 leading-relaxed">
              The Service is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that we have collected personal information from a child under 13, we will take steps to delete such information.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">10. International Data Transfers</h2>
            <p className="text-foreground/90 leading-relaxed">
              Your information may be transferred to and processed in countries other than your country of residence. These countries may have data protection laws that are different from the laws of your country. We take appropriate safeguards to ensure that your personal information remains protected in accordance with this Privacy Policy.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">11. Changes to This Privacy Policy</h2>
            <p className="text-foreground/90 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. We encourage you to review this Privacy Policy periodically.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">12. Contact Us</h2>
            <p className="text-foreground/90 leading-relaxed">
              If you have any questions about this Privacy Policy or our privacy practices, please contact us at:
            </p>
            <p className="text-foreground/90 leading-relaxed">
              Email: privacy@metaclips.com<br />
              Address: [Your Business Address]
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
