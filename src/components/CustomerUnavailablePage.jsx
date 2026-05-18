import { PawPrint } from "lucide-react";
import { CenteredScreen, PortalCard } from "./ui/PageShell.jsx";

export function CustomerUnavailablePage() {
  return (
    <CenteredScreen fontClassName="font-['Montserrat',sans-serif]">
      <PortalCard>
        <div className="flex flex-col items-center text-center gap-4">
          <PawPrint
            className="w-10 h-10 text-brand-purple"
            aria-hidden="true"
          />
          <h1 className="text-2xl font-display font-bold text-brand-purple">
            We can&apos;t take online bookings right now
          </h1>
          <p className="text-slate-700 leading-relaxed">
            Sorry about this — our booking system is temporarily unavailable.
            Please give us a call, text, or WhatsApp and we&apos;ll get your
            dog booked in.
          </p>
          <a
            href="tel:+447507731487"
            className="block w-full bg-brand-purple text-white font-semibold py-3 rounded-lg hover:opacity-90 transition"
          >
            Call 07507 731487
          </a>
          <a
            href="https://wa.me/447507731487"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full border border-brand-purple text-brand-purple font-semibold py-3 rounded-lg hover:bg-brand-purple/5 transition"
          >
            WhatsApp 07507 731487
          </a>
          <p className="text-sm text-slate-500 pt-2">
            Smarter Dog Grooming
            <br />
            183 Kings Road, Ashton-under-Lyne, OL6 8HD
          </p>
        </div>
      </PortalCard>
    </CenteredScreen>
  );
}
