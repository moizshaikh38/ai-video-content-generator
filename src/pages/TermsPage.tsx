import React from 'react';
import { LegalPageShell } from '../components/legal/LegalPageShell';

export const TermsPage: React.FC = () => {
  return (
    <LegalPageShell
      eyebrow="Legal Agreement"
      title="Terms of Service"
      subtitle="The rules that keep VireoClip fair, safe, and reliable for every creator."
      lastUpdated="November 2026"
    >
      <div className="max-w-none text-[#FAFAFA] space-y-8 leading-relaxed text-sm">
        <section>
          <p>
            VireoClip is operated by Moiz Shaikh. It is a prelaunch video-content service. These terms cover the
            website, waitlist and the app features currently accessible to you.
          </p>
        </section>

        <section>
          <h2 id="accounts" className="text-xl font-bold text-[#FAFAFA] mb-3">Accounts and your content</h2>
          <p>
            Use accurate account details, keep your account secure, and upload or import only content you have
            permission to use. Do not use the service for unlawful activity, infringement, abuse or attempts to
            compromise accounts or systems. You keep your rights to your content. You allow VireoClip and its
            processing services to handle that content to provide the features you request.
          </p>
        </section>

        <section>
          <h2 id="ai-features" className="text-xl font-bold text-[#FAFAFA] mb-3">AI and preview features</h2>
          <p>
            Transcripts, clip selections, captions and other AI output can be wrong. Review results before
            publishing or relying on them. Features and processing availability may change during prelaunch.
            We do not promise particular views, income or audience results. Third-party platforms have their
            own terms and availability.
          </p>
        </section>

        <section>
          <h2 id="waitlist" className="text-xl font-bold text-[#FAFAFA] mb-3">Waitlist</h2>
          <p>
            Joining the waitlist does not buy a subscription or guarantee access or a launch date. We use your
            email to confirm your signup and contact you about it. Confirmation emails include a link to leave
            the waitlist. See the privacy notice for how app and waitlist data are handled.
          </p>
        </section>

        <section>
          <h2 id="prices" className="text-xl font-bold text-[#FAFAFA] mb-3">Prices and paid service</h2>
          <p>
            Website plan prices are previews, not an offer to charge you now. These prelaunch terms do not set
            a new refund, renewal or cancellation policy or change any existing subscription. Any future paid
            offer needs its price, billing interval and applicable payment, cancellation and refund terms stated
            before purchase. Nothing here limits rights that applicable law gives you.
          </p>
        </section>

        <section>
          <h2 id="contact" className="text-xl font-bold text-[#FAFAFA] mb-3">Contact</h2>
          <p>
            For questions about these terms, contact <span className="font-mono text-xs">support@vireoclip.com</span>.
          </p>
        </section>
      </div>
    </LegalPageShell>
  );
};
