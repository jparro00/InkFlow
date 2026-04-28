// Pre-signing disclosure step for the public consent wizard. Satisfies the
// ESIGN §7001(c) "consumer disclosure" requirement that must be presented
// BEFORE consent to electronic records is obtained — covering scope, right
// to a paper copy, and right to withdraw.
//
// Hardware/software statement intentionally omitted: the consumer is
// completing this disclosure on the same device that will display the PDF,
// which under §7001(c)(1)(C)(ii) "reasonably demonstrates" they can access
// the electronic form.
//
// Privacy notice not included by product decision; the studio handles
// privacy questions directly via the "Contact the studio" pointer.

interface Props {
  agreed: boolean;
  onAgreedChange: (next: boolean) => void;
  onContinue: () => void;
  onBack: () => void;
}

export default function ConsentDisclosure({ agreed, onAgreedChange, onContinue, onBack }: Props) {
  return (
    <div className="pt-4 space-y-6">
      <h2 className="font-display text-2xl text-text-p">Before you sign</h2>

      <p className="text-md text-text-s leading-relaxed">
        This studio uses electronic records and signatures for tattoo consent forms. Before you continue, please review the following.
      </p>

      <div className="space-y-4">
        <Section title="Electronic records consent">
          By tapping "I agree" below, you consent to use electronic records and signatures for this consent form. This applies only to today's tattoo consent — not to any future records.
        </Section>

        <Section title="Right to a paper copy">
          You may ask the studio for a paper copy of your signed form at any time. There is no charge.
        </Section>

        <Section title="Right to withdraw">
          You may withdraw your consent to use electronic records at any time before you sign by closing this page; nothing will be saved. After signing, your electronic signature is binding, but you can still request a paper copy or ask the studio to delete your record.
        </Section>

        <Section title="Questions?">
          Contact the studio directly.
        </Section>
      </div>

      <label className="flex items-start gap-3 cursor-pointer pt-2">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => onAgreedChange(e.target.checked)}
          className="w-7 h-7 mt-0.5 accent-accent shrink-0 cursor-pointer"
        />
        <span className="text-md text-text-p leading-relaxed">
          I have read this disclosure and consent to electronic records and signatures for this form.
        </span>
      </label>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-3.5 text-md text-text-s rounded-md border border-border/40 cursor-pointer press-scale transition-all min-h-[48px]"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!agreed}
          className="flex-1 py-3.5 text-md bg-accent text-bg rounded-md font-medium cursor-pointer press-scale transition-all shadow-glow active:shadow-glow-strong disabled:opacity-40 min-h-[48px]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-display text-md text-text-p mb-1">{title}</div>
      <div className="text-base text-text-s leading-relaxed">{children}</div>
    </div>
  );
}
