import Foundation
import Supabase

/// Reads and writes for the My dogs screen. Row Level Security returns only
/// this customer's dogs. Writes use the two customer RPCs, which take the
/// owner from the signed-in user and work out the confirmed size themselves.
final class SupabaseDogsClient: SalonDogsClient, Sendable {
    private let supabase: SupabaseClient

    init(supabase: SupabaseClient) {
        self.supabase = supabase
    }

    static func make() -> SupabaseDogsClient? {
        guard let supabase = SalonClient.make() else { return nil }
        return SupabaseDogsClient(supabase: supabase)
    }

    private struct IdRow: Decodable { var id: String }

    // Nil fields are left out, and the database treats a missing value as empty.
    private struct CreateParams: Encodable {
        var p_name: String
        var p_breed: String?
        var p_size: String?
        var p_human_id: String
    }

    private struct UpdateParams: Encodable {
        var p_dog_id: String
        var p_name: String
        var p_breed: String?
        var p_size: String?
        var p_dob: String?
    }

    func loadDogs() async throws -> [DogDetailRow] {
        try await supabase
            .from("dogs")
            .select("id,name,breed,size,reported_size,dob,human_id")
            .execute()
            .value
    }

    func ownHumanId() async throws -> String? {
        let rows: [IdRow] = try await supabase
            .from("humans")
            .select("id")
            .limit(1)
            .execute()
            .value
        return rows.first?.id
    }

    func addDog(_ draft: DogDraft, humanId: String) async throws {
        try await supabase
            .rpc("create_customer_dog", params: CreateParams(
                p_name: draft.name.trimmingCharacters(in: .whitespacesAndNewlines),
                p_breed: Self.blankToNil(draft.breed),
                p_size: draft.reportedSize,
                p_human_id: humanId
            ))
            .execute()
    }

    func updateDog(id: String, _ draft: DogDraft) async throws {
        try await supabase
            .rpc("update_customer_dog", params: UpdateParams(
                p_dog_id: id,
                p_name: draft.name.trimmingCharacters(in: .whitespacesAndNewlines),
                p_breed: Self.blankToNil(draft.breed),
                p_size: draft.reportedSize,
                p_dob: draft.dob
            ))
            .execute()
    }

    private static func blankToNil(_ text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
