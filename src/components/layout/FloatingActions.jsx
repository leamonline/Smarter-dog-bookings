// src/components/layout/FloatingActions.jsx
import { useState } from "react";
import { PRICING } from "../../constants/index.js";

function computeRevenue(bookings, dogs) {
  let total = 0;
  for (const b of bookings) {
    const dog = dogs ? Object.values(dogs).find(d => d.id === b._dogId) : null;
    if (dog?.customPrice != null && dog.customPrice > 0) {
      total += dog.customPrice;
    } else {
      const priceStr = PRICING[b.service]?.[b.size] || "";
      const num = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
      if (!isNaN(num)) total += num;
    }
  }
  return total;
}

export default function FloatingActions({ bookings, dogs, onNewBooking }) {
  const [noteHover, setNoteHover] = useState(false);
  const [cardHover, setCardHover] = useState(false);

  const revenue = computeRevenue(bookings || [], dogs);

  return (
    <div className="fixed z-[200] flex items-end bottom-20 right-4 md:bottom-6 md:right-7">
      {/* Money Note */}
      <div
        onMouseEnter={() => setNoteHover(true)}
        onMouseLeave={() => setNoteHover(false)}
        className="transform -rotate-[4deg] -mr-[18px] mb-1 transition-all cursor-default"
        style={{
          transform: `rotate(-4deg) translateY(${noteHover ? "-6px" : "0"}) scale(${noteHover ? "1.04" : "1"})`,
          zIndex: noteHover ? 210 : 201,
        }}
      >
        <div
          className="border-2 border-white/20 rounded-lg px-5 md:px-6 py-2.5 min-w-[120px] text-center text-white relative"
          style={{
            background: "linear-gradient(135deg, #16A34A, #15803D)",
            boxShadow: "0 4px 16px rgba(22,163,74,0.35), 0 2px 6px rgba(0,0,0,0.1)",
          }}
        >
          {/* Dashed inner border */}
          <div className="absolute inset-[5px] border-[1.5px] border-dashed border-white/15 rounded pointer-events-none" />

          {/* Corner pound symbols */}
          <span className="absolute top-[7px] left-2 text-[7px] font-black text-white/20">&pound;</span>
          <span className="absolute top-[7px] right-2 text-[7px] font-black text-white/20">&pound;</span>
          <span className="absolute bottom-[7px] left-2 text-[7px] font-black text-white/20">&pound;</span>
          <span className="absolute bottom-[7px] right-2 text-[7px] font-black text-white/20">&pound;</span>

          {/* Label */}
          <div className="text-[8px] font-extrabold uppercase tracking-[1px] text-white/55">
            Today&apos;s Revenue
          </div>

          {/* Amount */}
          <div className="text-2xl font-black leading-tight" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.15)" }}>
            &pound;{revenue}
          </div>
        </div>
      </div>

      {/* Book Now Card */}
      <div
        onMouseEnter={() => setCardHover(true)}
        onMouseLeave={() => setCardHover(false)}
        onClick={onNewBooking}
        className="transform rotate-[3deg] transition-all cursor-pointer"
        style={{
          transform: `rotate(3deg) translateY(${cardHover ? "-6px" : "0"}) scale(${cardHover ? "1.04" : "1"})`,
          zIndex: cardHover ? 210 : 202,
        }}
      >
        <div
          className="bg-white rounded-[10px] p-[14px_30px] text-center min-w-[150px] border-[1.5px] border-slate-200 shadow-lg relative overflow-hidden"
        >
          {/* Top accent */}
          <div
            className="absolute top-0 left-0 right-0 h-[3px]"
            style={{ background: "linear-gradient(90deg, #00B8E0, #0099BD)" }}
          />

          {/* Bottom accent */}
          <div
            className="absolute bottom-0 left-0 right-0 h-[2px] opacity-30"
            style={{ background: "linear-gradient(90deg, #00B8E0, #0099BD)" }}
          />

          {/* Brand name */}
          <div className="text-[9px] font-extrabold text-[#0099BD] uppercase tracking-[1.5px] mb-[3px]">
            Smarter Dog
          </div>

          {/* CTA */}
          <div className="text-lg font-black text-slate-800 leading-none">
            Book Now
          </div>
        </div>
      </div>
    </div>
  );
}
