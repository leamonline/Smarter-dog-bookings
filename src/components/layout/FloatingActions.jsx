import { useState } from "react";
import { PRICING } from "../../constants/index.js";

function computeRevenue(bookings) {
  let total = 0;
  for (const b of bookings) {
    const priceStr = PRICING[b.service]?.[b.size] || "";
    const num = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
    if (!isNaN(num)) total += num;
  }
  return total;
}

export default function FloatingActions({ bookings, onNewBooking }) {
  const [noteHover, setNoteHover] = useState(false);
  const [cardHover, setCardHover] = useState(false);

  const revenue = computeRevenue(bookings || []);

  const transition = "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)";

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 28,
        zIndex: 200,
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      {/* Money Note */}
      <div
        onMouseEnter={() => setNoteHover(true)}
        onMouseLeave={() => setNoteHover(false)}
        style={{
          transform: `rotate(-4deg) translateY(${noteHover ? "-6px" : "0"}) scale(${noteHover ? "1.04" : "1"})`,
          marginRight: -18,
          marginBottom: 4,
          zIndex: noteHover ? 210 : 201,
          transition,
          cursor: "default",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #16A34A, #15803D)",
            border: "2px solid rgba(255,255,255,0.2)",
            borderRadius: 8,
            padding: "10px 24px 10px 20px",
            minWidth: 120,
            textAlign: "center",
            color: "white",
            boxShadow:
              "0 4px 16px rgba(22,163,74,0.35), 0 2px 6px rgba(0,0,0,0.1)",
            position: "relative",
          }}
        >
          {/* Dashed inner border */}
          <div
            style={{
              position: "absolute",
              inset: 5,
              border: "1.5px dashed rgba(255,255,255,0.15)",
              borderRadius: 4,
              pointerEvents: "none",
            }}
          />

          {/* Corner £ symbols */}
          <span
            style={{
              position: "absolute",
              top: 7,
              left: 8,
              fontSize: 7,
              fontWeight: 900,
              color: "rgba(255,255,255,0.2)",
            }}
          >
            £
          </span>
          <span
            style={{
              position: "absolute",
              top: 7,
              right: 8,
              fontSize: 7,
              fontWeight: 900,
              color: "rgba(255,255,255,0.2)",
            }}
          >
            £
          </span>
          <span
            style={{
              position: "absolute",
              bottom: 7,
              left: 8,
              fontSize: 7,
              fontWeight: 900,
              color: "rgba(255,255,255,0.2)",
            }}
          >
            £
          </span>
          <span
            style={{
              position: "absolute",
              bottom: 7,
              right: 8,
              fontSize: 7,
              fontWeight: 900,
              color: "rgba(255,255,255,0.2)",
            }}
          >
            £
          </span>

          {/* Label */}
          <div
            style={{
              fontSize: 8,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 1,
              color: "rgba(255,255,255,0.55)",
            }}
          >
            Today&apos;s Revenue
          </div>

          {/* Amount */}
          <div
            style={{
              fontSize: 24,
              fontWeight: 900,
              lineHeight: 1.1,
              textShadow: "0 1px 2px rgba(0,0,0,0.15)",
            }}
          >
            £{revenue}
          </div>
        </div>
      </div>

      {/* Book Now Card */}
      <div
        onMouseEnter={() => setCardHover(true)}
        onMouseLeave={() => setCardHover(false)}
        onClick={onNewBooking}
        style={{
          transform: `rotate(3deg) translateY(${cardHover ? "-6px" : "0"}) scale(${cardHover ? "1.04" : "1"})`,
          zIndex: cardHover ? 210 : 202,
          transition,
          cursor: "pointer",
        }}
      >
        <div
          style={{
            background: "white",
            borderRadius: 10,
            padding: "14px 30px",
            textAlign: "center",
            minWidth: 150,
            border: "1.5px solid #E5E7EB",
            boxShadow:
              "0 4px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Top accent */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: "linear-gradient(90deg, #00B8E0, #0099BD)",
            }}
          />

          {/* Bottom accent */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 2,
              background: "linear-gradient(90deg, #00B8E0, #0099BD)",
              opacity: 0.3,
            }}
          />

          {/* Brand name */}
          <div
            style={{
              fontSize: 9,
              fontWeight: 800,
              color: "#0099BD",
              textTransform: "uppercase",
              letterSpacing: 1.5,
              marginBottom: 3,
            }}
          >
            Smarter Dog
          </div>

          {/* CTA */}
          <div
            style={{
              fontSize: 18,
              fontWeight: 900,
              color: "#1F2937",
              lineHeight: 1,
            }}
          >
            Book Now
          </div>
        </div>
      </div>
    </div>
  );
}
