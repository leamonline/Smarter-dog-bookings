import XCTest
@testable import AuthCore

// The wire rule, checked against answers recorded from the staging project on 24 November 2026
// (a throwaway test customer; the ids are test data). A real answer is the best test of a parser.
final class BookingWireTests: XCTestCase {
    private let recordedCreated = Data(#"[{"id":"ddb11404-3195-4feb-bc77-98c35d872667"}]"#.utf8)
    private let recordedDuplicate = Data(#"{"code":"23505","details":"Key (dog_id, booking_date, slot)=(4d6e6d9b-2c0a-40f4-98fc-8336ee2754be, 2026-11-25, 09:30) already exists.","hint":null,"message":"duplicate key value violates unique constraint \"bookings_one_active_per_dog_slot\""}"#.utf8)
    private let recordedPregnant = Data(#"{"code":"P0001","details":"pregnant","hint":null,"message":"We can't book a pregnant dog online — please call the salon."}"#.utf8)
    private let recordedUnsized = Data(#"{"code":"22023","details":"dog_size_unconfirmed","hint":null,"message":"dog_size_unconfirmed"}"#.utf8)
    private let recordedClosed = Data(#"{"code":"P0001","details":"calendar_closed","hint":null,"message":"The salon is closed on that date"}"#.utf8)
    private let recordedLargeMid = Data(#"{"code":"P0001","details":"large_dog_ineligible","hint":null,"message":"Large dogs need approval for this slot (10:30)"}"#.utf8)
    private let recordedProfile = Data(#"{"code":"P0001","details":"profile_incomplete","hint":null,"message":"Please complete your profile (name, address and policy agreement) before booking"}"#.utf8)

    func testARealCreatedAnswerGivesTheNewIds() {
        XCTAssertEqual(BookingWire.sendResult(status: 200, body: recordedCreated), .created(ids: ["ddb11404-3195-4feb-bc77-98c35d872667"]))
        XCTAssertEqual(BookingWire.sendResult(status: 201, body: recordedCreated), .created(ids: ["ddb11404-3195-4feb-bc77-98c35d872667"]))
    }

    func testEveryRealRefusalCarriesItsStableCodeAndMapsToTheRightReason() {
        let cases: [(String, Data, String)] = [
            ("pregnant", recordedPregnant, "pregnant"),
            ("unsized", recordedUnsized, "dog_size_unconfirmed"),
            ("closed", recordedClosed, "calendar_closed"),
            ("large dog", recordedLargeMid, "large_dog_ineligible"),
            ("profile", recordedProfile, "profile_incomplete"),
        ]
        for (name, body, reason) in cases {
            guard case .refused(let message, let details) = BookingWire.sendResult(status: 400, body: body) else {
                return XCTFail("\(name) should be a refusal")
            }
            XCTAssertEqual(details, reason, "\(name): the database's own code is passed through")
            guard case .refused(let mapped, let copy) = BookingConfirm.refusal(message: message, details: details) else {
                return XCTFail("\(name)")
            }
            XCTAssertEqual(mapped, reason, name)
            XCTAssertFalse(copy.contains("P0001"), name)
            XCTAssertNotEqual(copy, BookingDenial.genericCopy, "\(name) has its own wording")
        }
    }

    func testTheRealDuplicateKeyAnswerIsARefusalMappedFromItsMessage() {
        // A 409 with no stable code: the unique constraint on dog, date and slot.
        guard case .refused(let message, let details) = BookingWire.sendResult(status: 409, body: recordedDuplicate) else {
            return XCTFail("a duplicate is a refusal, not an unknown")
        }
        XCTAssertTrue(details?.hasPrefix("Key (dog_id") == true, "its details are a sentence, not a code")
        guard case .refused(let reason, _) = BookingConfirm.refusal(message: message, details: details) else { return XCTFail() }
        XCTAssertEqual(reason, "double_booked")
    }

    func testAnAnswerThatCannotBeTrustedIsUnknownNeverCreatedAndNeverRefused() {
        // Server said OK but the body is not a list of ids: the booking may exist.
        XCTAssertEqual(BookingWire.sendResult(status: 200, body: Data("[]".utf8)), .unknown)
        XCTAssertEqual(BookingWire.sendResult(status: 200, body: Data("<html>".utf8)), .unknown)
        XCTAssertEqual(BookingWire.sendResult(status: 200, body: Data(#"[{"id":"a"},{"nope":1}]"#.utf8)), .unknown)
        XCTAssertEqual(BookingWire.sendResult(status: 200, body: Data(#"{"id":"a"}"#.utf8)), .unknown)
        // A gateway or server fault might have come after the booking was made.
        for status in [500, 502, 503, 504] {
            XCTAssertEqual(BookingWire.sendResult(status: status, body: recordedPregnant), .unknown, "\(status)")
        }
        // A 4xx whose body cannot be read, or says nothing.
        XCTAssertEqual(BookingWire.sendResult(status: 400, body: Data("Bad Request".utf8)), .unknown)
        XCTAssertEqual(BookingWire.sendResult(status: 400, body: Data("{}".utf8)), .unknown)
        XCTAssertEqual(BookingWire.sendResult(status: 302, body: Data()), .unknown)
    }

    func testNonTextDetailsAreIgnoredButTheMessageStillGetsThrough() {
        let body = Data(#"{"code":"PGRST201","details":[{"a":1}],"message":"ambiguous"}"#.utf8)
        XCTAssertEqual(BookingWire.sendResult(status: 400, body: body), .refused(message: "ambiguous", details: nil))
    }

    func testAnAuthFailureIsARefusalWithTheGenericWording() {
        let body = Data(#"{"code":"PGRST301","message":"JWT expired","details":null,"hint":null}"#.utf8)
        guard case .refused(let message, let details) = BookingWire.sendResult(status: 401, body: body),
              case .refused(let reason, let copy) = BookingConfirm.refusal(message: message, details: details) else { return XCTFail() }
        XCTAssertEqual(reason, "unknown")
        XCTAssertEqual(copy, BookingDenial.genericCopy, "never the raw text")
    }

    func testOnlyAConnectionThatWasNeverMadeCountsAsNotSent() {
        for code in [URLError.Code.notConnectedToInternet, .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed] {
            XCTAssertTrue(BookingWire.neverLeftThePhone(code), "\(code)")
        }
        // The request may have arrived before these.
        for code in [URLError.Code.timedOut, .networkConnectionLost, .badServerResponse, .cancelled, .secureConnectionFailed] {
            XCTAssertFalse(BookingWire.neverLeftThePhone(code), "\(code)")
        }
    }

    func testTheLiveBookingSwitchAcceptsOnlyTheStagingProject() {
        XCTAssertTrue(LiveBookingGuard.isStaging("https://btjnxvgkpdbfrrqxvkfj.supabase.co"))
        XCTAssertTrue(LiveBookingGuard.isStaging("https://BTJNXVGKPDBFRRQXVKFJ.supabase.co/"))
        // Production, a look-alike, an empty value and a staging name in the wrong place are all refused.
        XCTAssertFalse(LiveBookingGuard.isStaging("https://nlzhllhkigmsvrzduefz.supabase.co"))
        XCTAssertFalse(LiveBookingGuard.isStaging("https://btjnxvgkpdbfrrqxvkfj.supabase.co.evil.example"))
        XCTAssertFalse(LiveBookingGuard.isStaging("https://evil.example/btjnxvgkpdbfrrqxvkfj.supabase.co"))
        XCTAssertFalse(LiveBookingGuard.isStaging("https://xbtjnxvgkpdbfrrqxvkfj.supabase.co"))
        XCTAssertFalse(LiveBookingGuard.isStaging(""))
        XCTAssertFalse(LiveBookingGuard.isStaging("placeholder"))
    }
}
