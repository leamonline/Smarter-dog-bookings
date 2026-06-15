import { PawPrint } from "lucide-react";
import { CenteredScreen, PortalCard } from "./ui/PageShell.jsx";
import {
  SALON_PHONE_DISPLAY,
  SALON_EMAIL,
  SALON_EMAIL_HREF,
  SALON_WHATSAPP_URL,
} from "../constants/salonContact.ts";

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
            Message us on WhatsApp or drop us an email and we&apos;ll get your
            dog booked in.
          </p>
          <a
            href={SALON_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-brand-purple text-white font-semibold py-3 rounded-lg hover:opacity-90 transition"
          >
            WhatsApp {SALON_PHONE_DISPLAY}
          </a>
          <a
            href={SALON_EMAIL_HREF}
            className="block w-full border border-brand-purple text-brand-purple font-semibold py-3 rounded-lg hover:bg-brand-purple/5 transition break-words"
          >
            Email {SALON_EMAIL}
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
