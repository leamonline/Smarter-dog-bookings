import Foundation

// What the service step shows for each of the four bookable services: the website's id, its
// one-line description, the starting price for a dog's size, and its mascot. Pure Foundation,
// so Linux CI tests it.
//
// Every price a customer sees on the website (the service step, the summary and the
// confirmation) comes from one fixed table, `PRICING` in `src/constants/salon.ts`, and the
// customer pages pass no other pricing. This mirrors that table and the website's wording.
// The prices are STARTING prices: the website says "the final cost depends on coat condition
// and any extras", and so does the app. `src/security/iosBookingServices.test.ts` fails if
// the table, the descriptions or the "from" marks drift from the website.

extension BookingService {
    /// The website's id for this service (`SERVICES` in `src/constants/salon.ts`).
    var webId: String {
        switch self {
        case .fullGroom: "full-groom"
        case .bathAndBrush: "bath-and-brush"
        case .bathAndDeshed: "bath-and-deshed"
        case .puppyGroom: "puppy-groom"
        }
    }

    /// `SERVICE_DESCRIPTIONS` in the website's service step, word for word. One per line.
    static let descriptions: [String: String] = [
        "full-groom": "Bath, dry, and full clip to breed standard",
        "bath-and-brush": "Bath, blow-dry, and a thorough brush-out",
        "bath-and-deshed": "Bath, blow-dry, and de-shedding treatment",
        "puppy-groom": "A gentle introduction to grooming for pups under 6 months",
    ]

    var summary: String { Self.descriptions[webId] ?? "" }

    /// `PRICING` in pence. A size that is missing is a size the service is not offered for.
    /// One service per line so the drift test can read it.
    static let guidePricePence: [String: [DogSize: Int]] = [
        "full-groom": [.small: 4200, .medium: 4600, .large: 6000],
        "bath-and-brush": [.small: 3800, .medium: 4200, .large: 5500],
        "bath-and-deshed": [.small: 3800, .medium: 4200, .large: 5500],
        "puppy-groom": [.small: 3800, .medium: 3800],
    ]

    /// `FROM_PRICED_SERVICES`: quoted as "from £X" because the final price depends on coat
    /// condition. Puppy Groom is a fixed price.
    static let fromPriced: Set<String> = ["full-groom", "bath-and-brush", "bath-and-deshed"]

    func pricePence(for size: DogSize) -> Int? {
        Self.guidePricePence[webId]?[size]
    }

    /// "£46+" for a from-priced service, "£38" for a fixed one, nil when not offered for this
    /// size. The website's `getServicePriceLabel`, with nil where it says "N/A".
    func priceLabel(for size: DogSize) -> String? {
        guard let pence = pricePence(for: size) else { return nil }
        return Self.formatPounds(pence) + (Self.fromPriced.contains(webId) ? "+" : "")
    }

    /// What the service tile shows: the website renders "From " in front of the label.
    func priceLine(for size: DogSize) -> String? {
        priceLabel(for: size).map { "From \($0)" }
    }

    /// The services offered for a dog of this size, in the salon's order. A service is offered
    /// when it has a price for that size, as on the website.
    static func offered(for size: DogSize) -> [BookingService] {
        allCases.filter { $0.pricePence(for: size) != nil }
    }

    /// The website's `formatGBP`: whole pounds without decimals, otherwise two.
    static func formatPounds(_ pence: Int) -> String {
        if pence % 100 == 0 { return "£\(pence / 100)" }
        return "£\(pence / 100).\(String(format: "%02d", pence % 100))"
    }

    /// The website's sentence above the service tiles.
    static let startingPriceNote =
        "Choose a service for each pup. Prices shown are starting prices — the final cost depends on coat condition and any extras."
}
