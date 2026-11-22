import React from 'react';
import { LegalPageShell } from '../components/legal/LegalPageShell';

export const PrivacyPage: React.FC = () => {
  return (
    <LegalPageShell
      eyebrow="Privacy & Data"
      title="Privacy Policy"
      subtitle="What we collect, why we collect it, and the controls you have over your data."
      lastUpdated="November 2026"
    >
      <div className="max-w-none text-[#FAFAFA] space-y-8 leading-relaxed text-sm">
        <section>
          <p>
            VireoClip is operated by Moiz Shaikh. For any privacy question or request, contact{' '}
            <span className="font-mono text-xs">support@vireoclip.com</span>.
          </p>
        </section>

        <section>
          <h2 id="waitlist" className="text-xl font-bold text-[#FAFAFA] mb-3">If you join the waitlist</h2>
          <p>
            If you join the waitlist, we store your email address and use it to confirm your signup and contact
            you about it, from <span className="font-mono text-xs">waitlist@updates.vireoclip.com</span>. You can
            leave the waitlist any time using the link in the confirmation email, or by emailing us.
          </p>
        </section>

        <section>
          <h2 id="using-the-app" className="text-xl font-bold text-[#FAFAFA] mb-3">If you sign in and use VireoClip now</h2>
          <p>
            We process your account email (sign-in is provided by Supabase), the videos you upload and their
            audio (stored in Cloudflare R2; the service runs on Render), transcripts (audio is transcribed by an
            external AI provider, OpenRouter and/or Groq, depending on the server's current configuration), and
            the clips you render. The site uses your browser's storage to keep you signed in and remember
            preferences.
          </p>
        </section>

        <section>
          <p>
            We are finalizing our full Privacy Policy, and it will replace this notice. This notice describes
            what we do today; it makes no promises beyond that.
          </p>
        </section>
      </div>
    </LegalPageShell>
  );
};
