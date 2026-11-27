import Foundation

// The customer-side capacity rules, in Swift. Pure Foundation: no UI, no Supabase.
//
// This is the FOURTH copy of the capacity rules. The others are the browser engine
// (`src/engine/capacity.ts`, the reference), the Deno copy
// (`supabase/functions/_shared/capacity.ts`) and the PostgreSQL trigger
// `validate_booking_capacity()`, which is the authority. This copy decides which
// times the app OFFERS. The database still decides whether a booking is ALLOWED,
// so a wrong offer here means a refusal the customer then sees, never a bad booking.
//
// To stop it drifting, `ios/AuthCoreTests/capacity-parity.json` holds every shared
// scenario (`src/engine/capacityParityFixtures.ts`) together with the answers the
// real website engine gives. `CapacityParityTests` runs this engine against that file
// and `src/engine/capacityParityFixtures.ios.test.ts` fails if the file is out of
// date. Change a rule: change all four, and add the scenario to the one governed list.
//
// Ported: seat counting, the 2-2-1 rule, early close, staff-blocked seats,
// `canBookSlot`, and the day's daily cap. Not ported yet: grouped allocation for
// several dogs (a later slice), staff overrides (staff use the website), and the
// extra-slot grid builder (extra slots reach customers only as same-day openings).

enum DogSize: String, Decodable, Equatable, Sendable {
    case small, medium, large
}

/// A booking already on the day. The occupancy RPCs return only bookings that still
/// hold a seat (Cancelled and No-show are filtered out on the server), so every
/// booking here counts, as `isActiveBooking` does on the website.
struct EngineBooking: Equatable, Sendable {
    var slot: String
    var size: DogSize
}

/// A staff decision about one seat of one slot (`day_settings.overrides`).
enum SeatOverride: String, Decodable, Equatable, Sendable {
    case blocked, open
}

struct BookingVerdict: Equatable, Sendable {
    var allowed: Bool
    var reason: String?
    var needsApproval = false

    static let yes = BookingVerdict(allowed: true)
    static func no(_ reason: String, needsApproval: Bool = false) -> BookingVerdict {
        BookingVerdict(allowed: false, reason: reason, needsApproval: needsApproval)
    }
}

enum CapacityEngine {
    /// `salon_config.daily_dog_cap`. The database is authoritative; a test checks this
    /// matches `DAILY_DOG_CAP` on the website.
    static let dailyDogCap = 14

    /// `LARGE_DOG_SLOTS`. One entry per line so a test can compare it with the website.
    /// A large dog has no entry for 09:30 to 11:30, which means it needs staff approval.
    struct LargeRule: Equatable, Sendable {
        var seats: Int
        var canShare: Bool
        var conditional: Bool
    }
    static let largeDogSlots: [String: LargeRule] = [
        "08:30": LargeRule(seats: 1, canShare: true, conditional: false),
        "09:00": LargeRule(seats: 1, canShare: true, conditional: true),
        "12:00": LargeRule(seats: 1, canShare: true, conditional: false),
        "12:30": LargeRule(seats: 2, canShare: false, conditional: false),
        "13:00": LargeRule(seats: 2, canShare: false, conditional: false),
    ]

    // MARK: seats

    static func seatsNeeded(_ size: DogSize, slot: String) -> Int {
        if size == .large {
            return largeDogSlots[slot]?.seats ?? 2
        }
        return 1
    }

    static func seatsUsed(_ bookings: [EngineBooking], slot: String) -> Int {
        bookings.filter { $0.slot == slot }.reduce(0) { $0 + seatsNeeded($1.size, slot: slot) }
    }

    static func hasLargeDog(_ bookings: [EngineBooking], slot: String) -> Bool {
        bookings.contains { $0.slot == slot && $0.size == .large }
    }

    /// Large dog at 12:00 closes 13:00.
    static func isEarlyCloseActive(_ bookings: [EngineBooking]) -> Bool {
        hasLargeDog(bookings, slot: "12:00")
    }

    // MARK: 2-2-1

    /// Two seats, unless two double slots would end up side by side, in which case one.
    static func maxSeats(slotIndex: Int, seats: [String: Int], activeSlots: [String]) -> Int {
        func isDouble(_ index: Int) -> Bool {
            guard index >= 0, index < activeSlots.count else { return false }
            return (seats[activeSlots[index]] ?? 0) >= 2
        }
        let prevPrev = isDouble(slotIndex - 2)
        let prev = isDouble(slotIndex - 1)
        let next = isDouble(slotIndex + 1)
        let nextNext = isDouble(slotIndex + 2)
        let wouldViolate = (prevPrev && prev) || (prev && next) || (next && nextNext)
        return wouldViolate ? 1 : 2
    }

    struct SlotCapacity: Equatable, Sendable {
        var used: Int
        var max: Int
        var isConstrained: Bool
        var hasLargeDog: Bool
        var isEarlyClosed: Bool
    }

    static func capacities(_ bookings: [EngineBooking], activeSlots: [String]) -> [String: SlotCapacity] {
        var seats: [String: Int] = [:]
        for slot in activeSlots { seats[slot] = seatsUsed(bookings, slot: slot) }
        let earlyClose = isEarlyCloseActive(bookings)
        var result: [String: SlotCapacity] = [:]
        for (index, slot) in activeSlots.enumerated() {
            var max = maxSeats(slotIndex: index, seats: seats, activeSlots: activeSlots)
            if slot == "13:00" && earlyClose { max = 0 }
            result[slot] = SlotCapacity(
                used: seats[slot] ?? 0,
                max: max,
                isConstrained: max < 2,
                hasLargeDog: hasLargeDog(bookings, slot: slot),
                isEarlyClosed: slot == "13:00" && earlyClose
            )
        }
        return result
    }

    // MARK: seats the customer could actually take

    private enum Seat { case booking, reserved, available, blocked }

    /// How many seats of this slot are free once bookings, large dogs and staff blocks
    /// are laid out. Mirrors `getBookableSeatCount` / `getSeatStatesForSlot`.
    static func bookableSeatCount(
        _ bookings: [EngineBooking],
        slot: String,
        activeSlots: [String],
        overrides: [Int: SeatOverride]
    ) -> Int {
        guard let cap = capacities(bookings, activeSlots: activeSlots)[slot] else { return 0 }
        let slotBookings = bookings.filter { $0.slot == slot }

        // Only the two physical seats can be blocked; other indexes are ignored here.
        var blockedIndexes = Set<Int>()
        for key in [0, 1] where overrides[key] == .blocked { blockedIndexes.insert(key) }

        let totalSeats = Swift.max(2, slotBookings.count + blockedIndexes.count)
        var states = [Seat](repeating: .blocked, count: totalSeats)

        var anchors: [(size: DogSize, seatIndex: Int)] = []
        var cursor = 0
        for booking in slotBookings {
            while cursor < totalSeats && (states[cursor] == .booking || blockedIndexes.contains(cursor)) {
                cursor += 1
            }
            if cursor >= totalSeats { break }
            states[cursor] = .booking
            anchors.append((booking.size, cursor))
            cursor += 1
        }

        for anchor in anchors {
            let needed = seatsNeeded(anchor.size, slot: slot)
            var used = 1
            var j = anchor.seatIndex + 1
            while used < needed && j < totalSeats {
                if blockedIndexes.contains(j) || states[j] == .booking || states[j] == .reserved {
                    j += 1
                    continue
                }
                states[j] = .reserved
                used += 1
                j += 1
            }
        }

        for i in 0..<totalSeats {
            if states[i] == .booking || states[i] == .reserved { continue }
            let override = overrides[i]
            if override == .blocked {
                states[i] = .blocked
                continue
            }
            if override == .open {
                states[i] = .available
                continue
            }
            states[i] = i < cap.max ? .available : .blocked
        }
        return states.filter { $0 == .available }.count
    }

    // MARK: can this dog take this slot?

    /// The customer's version of `canBookSlot`: no staff override. The reason strings are
    /// the website's, word for word, so the parity test can compare them.
    static func canBookSlot(
        _ bookings: [EngineBooking],
        slot: String,
        size: DogSize,
        activeSlots: [String],
        overrides: [Int: SeatOverride] = [:]
    ) -> BookingVerdict {
        let caps = capacities(bookings, activeSlots: activeSlots)
        guard let cap = caps[slot] else { return .no("Invalid slot") }

        let needed = seatsNeeded(size, slot: slot)

        if size == .large {
            guard let rule = largeDogSlots[slot] else {
                return .no("Needs manager approval for this slot", needsApproval: true)
            }

            if rule.conditional && slot == "09:00" {
                if seatsUsed(bookings, slot: "08:30") > 0 {
                    return .no("9:00am conditional: 8:30am must be empty")
                }
                if seatsUsed(bookings, slot: "10:00") > 1 {
                    return .no("9:00am conditional: 10:00am must have 0–1 seats")
                }
            }

            if slot == "12:00" && seatsUsed(bookings, slot: "13:00") > 0 {
                return .no("12:00 large dog requires 1:00pm to be empty (early close)")
            }

            if slot == "13:00" && isEarlyCloseActive(bookings) {
                return .no("1:00pm is closed — large dog at 12:00 triggered early close")
            }

            if !rule.canShare, let index = activeSlots.firstIndex(of: slot) {
                if index > 0 {
                    let previous = activeSlots[index - 1]
                    if let previousRule = largeDogSlots[previous], !previousRule.canShare,
                       hasLargeDog(bookings, slot: previous) {
                        let pair = [previous, slot].sorted()
                        if !(pair[0] == "12:30" && pair[1] == "13:00") {
                            return .no("Back-to-back large dogs only allowed at 12:30 + 1:00pm")
                        }
                    }
                }
                if index < activeSlots.count - 1 {
                    let next = activeSlots[index + 1]
                    if let nextRule = largeDogSlots[next], !nextRule.canShare,
                       hasLargeDog(bookings, slot: next) {
                        let pair = [slot, next].sorted()
                        if !(pair[0] == "12:30" && pair[1] == "13:00") {
                            return .no("Back-to-back large dogs only allowed at 12:30 + 1:00pm")
                        }
                    }
                }
            }

            if rule.canShare && hasLargeDog(bookings, slot: slot) {
                return .no("Only a small/medium dog can share this slot with a large dog")
            }

            if !rule.canShare && cap.used > 0 {
                return .no("Large dog fills this slot — already has bookings")
            }

            if !rule.canShare && needed > cap.max {
                return .no("Not enough capacity (2-2-1 rule)")
            }
        }

        let available = bookableSeatCount(bookings, slot: slot, activeSlots: activeSlots, overrides: overrides)
        if available < needed {
            if size == .large { return .no("Not enough capacity (2-2-1 rule)") }
            if cap.isEarlyClosed { return .no("1:00pm closed — early close from 12:00 large dog") }
            if cap.isConstrained { return .no("Capped at 1 (2-2-1 rule)") }
            return .no("Slot is full")
        }

        if size != .large && cap.hasLargeDog {
            if let rule = largeDogSlots[slot], !rule.canShare {
                return .no("Large dog fills this slot")
            }
        }

        return .yes
    }

    // MARK: which times to offer

    /// The slots to offer one dog, in grid order. Same answer as the website's grouped
    /// search with a single dog: the day's total cap first (the whole booking must fit
    /// under it), then every slot `canBookSlot` allows. Several dogs need the grouped
    /// allocation, which is not ported yet.
    static func offeredSlots(
        size: DogSize,
        bookings: [EngineBooking],
        activeSlots: [String],
        overrides: [String: [Int: SeatOverride]] = [:],
        dailyCap: Int = dailyDogCap
    ) -> [String] {
        if bookings.count + 1 > dailyCap { return [] }
        return activeSlots.filter {
            canBookSlot(bookings, slot: $0, size: size, activeSlots: activeSlots, overrides: overrides[$0] ?? [:]).allowed
        }
    }
}
