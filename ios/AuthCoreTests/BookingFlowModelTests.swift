import XCTest
@testable import AuthCore

@MainActor
final class BookingFlowModelTests: XCTestCase {
    private final class FakeClient: SalonBookingDataClient, @unchecked Sendable {
        var rows: [BookingDogRow] = []
        var fails = false
        var calls = 0
        func loadDogs() async throws -> [BookingDogRow] {
            calls += 1
            if fails { throw URLError(.notConnectedToInternet) }
            return rows
        }
    }

    private func row(_ id: String, _ name: String, size: String? = "medium", pregnant: Bool = false) -> BookingDogRow {
        BookingDogRow(id: id, name: name, breed: "Cockapoo", size: size, is_pregnant: pregnant)
    }

    private func loaded(_ rows: [BookingDogRow]) async -> (BookingFlowModel, FakeClient) {
        let client = FakeClient()
        client.rows = rows
        let model = BookingFlowModel(client: client)
        await model.loadDogs()
        return (model, client)
    }

    func testItStartsLoadingAndThenShowsTheDogsSortedWithTheBlockedOnesMarked() async {
        let client = FakeClient()
        client.rows = [row("2", "Moose", size: "large"), row("1", "Biscuit"), row("3", "Pip", size: nil), row("4", "Bella", pregnant: true)]
        let model = BookingFlowModel(client: client)
        XCTAssertEqual(model.dogsState, .loading)
        XCTAssertTrue(model.dogs.isEmpty)
        await model.loadDogs()
        XCTAssertEqual(model.dogs.map(\.name), ["Bella", "Biscuit", "Moose", "Pip"])
        XCTAssertEqual(model.dogs.first { $0.name == "Pip" }?.blocker, .sizeUnconfirmed)
        XCTAssertEqual(model.dogs.first { $0.name == "Bella" }?.blocker, .pregnant)
        XCTAssertTrue(model.hasUnsizedDog)
        XCTAssertTrue(model.hasPregnantDog)
    }

    func testTheNotesAboutBlockedDogsAppearOnlyWhenThereIsOne() async {
        let (model, _) = await loaded([row("1", "Biscuit"), row("2", "Moose", size: "large")])
        XCTAssertFalse(model.hasUnsizedDog)
        XCTAssertFalse(model.hasPregnantDog)
    }

    func testAFailedLookupIsFailedNeverNoDogsAndATryAgainWorks() async {
        let client = FakeClient()
        client.fails = true
        let model = BookingFlowModel(client: client)
        await model.loadDogs()
        XCTAssertEqual(model.dogsState, .failed)
        XCTAssertTrue(model.dogs.isEmpty)
        client.fails = false
        client.rows = [row("1", "Biscuit")]
        await model.loadDogs()
        XCTAssertEqual(model.dogs.map(\.name), ["Biscuit"])
    }

    func testNoClientAtAllIsAFailureNotAnEmptyList() async {
        let model = BookingFlowModel(client: nil)
        await model.loadDogs()
        XCTAssertEqual(model.dogsState, .failed)
    }

    func testPickingADogLetsYouContinueAndABlockedDogIsIgnored() async {
        let (model, _) = await loaded([row("1", "Biscuit"), row("2", "Pip", size: nil), row("3", "Bella", pregnant: true)])
        XCTAssertFalse(model.canContinue)
        XCTAssertNil(model.selectedDogId)
        for blocked in model.dogs where blocked.name != "Biscuit" { model.select(dog: blocked) }
        XCTAssertNil(model.selectedDogId, "a dog that cannot be booked is not selected")
        XCTAssertFalse(model.canContinue)

        model.select(dog: model.dogs.first { $0.name == "Biscuit" }!)
        XCTAssertEqual(model.selectedDogId, "1")
        XCTAssertTrue(model.canContinue)
    }

    func testPickingAnotherDogMovesTheTick() async {
        let (model, _) = await loaded([row("1", "Biscuit"), row("2", "Moose", size: "large")])
        model.select(dog: model.dogs[0])
        model.select(dog: model.dogs[1])
        XCTAssertEqual(model.selectedDogId, "2")
    }

    func testContinueAndBackMoveThroughTheStepsWithTheirCaption() async {
        let (model, _) = await loaded([row("1", "Biscuit")])
        XCTAssertEqual(model.step, .dog)
        XCTAssertEqual(model.stepCaption, "Step 1 of 5")
        model.next()
        XCTAssertEqual(model.step, .dog, "no dog chosen yet")
        model.select(dog: model.dogs[0])
        model.next()
        XCTAssertEqual(model.step, .service)
        XCTAssertEqual(model.stepCaption, "Step 2 of 5")
        model.back()
        XCTAssertEqual(model.step, .dog)
        model.back()
        XCTAssertEqual(model.step, .dog, "there is nothing before the first step")
    }

    func testAReloadKeepsAChosenDogThatIsStillBookable() async {
        let (model, client) = await loaded([row("1", "Biscuit")])
        model.select(dog: model.dogs[0])
        await model.loadDogs()
        XCTAssertEqual(client.calls, 2)
        XCTAssertEqual(model.selectedDogId, "1")
    }

    func testAReloadStartsAgainIfTheChosenDogIsNowBlockedOrGone() async {
        let (model, client) = await loaded([row("1", "Biscuit"), row("2", "Moose", size: "large")])
        model.select(dog: model.dogs[0])
        model.next()
        XCTAssertEqual(model.step, .service)

        // Biscuit is now marked pregnant by the salon.
        client.rows = [row("1", "Biscuit", pregnant: true), row("2", "Moose", size: "large")]
        await model.loadDogs()
        XCTAssertNil(model.selectedDogId)
        XCTAssertEqual(model.step, .dog, "back to the start rather than carry a choice the salon would refuse")

        model.select(dog: model.dogs.first { $0.name == "Moose" }!)
        client.rows = [row("1", "Biscuit")]
        await model.loadDogs()
        XCTAssertNil(model.selectedDogId, "the chosen dog is gone")
    }

    func testAFailedReloadKeepsWhatWasChosen() async {
        let (model, client) = await loaded([row("1", "Biscuit")])
        model.select(dog: model.dogs[0])
        client.fails = true
        await model.loadDogs()
        XCTAssertEqual(model.dogsState, .failed)
        XCTAssertEqual(model.selectedDogId, "1", "a network blip does not throw the customer's choice away")
    }
}
