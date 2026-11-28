import Foundation
import Supabase

/// Reads, field-scoped status writes, collection-notice sends and Realtime updates
/// for the staff Today screen. Uses the exact same tables, RLS (`is_staff()`) and
/// Edge Functions (`whatsapp-send`, `sms-send`) as the staff website.
final class SupabaseStaffDayClient: StaffDayClient, Sendable {
    private let supabase: SupabaseClient

    let supportsWrites = true
    let supportsMessaging = true

    init(supabase: SupabaseClient) {
        self.supabase = supabase
    }

    static func make() -> SupabaseStaffDayClient? {
        SalonClient.make().map(SupabaseStaffDayClient.init)
    }

    func loadDay(_ date: String) async throws -> StaffDayRead {
        async let bookingRows: [StaffBookingRow] = supabase
            .from("bookings")
            .select(StaffBookingRow.select)
            .eq("booking_date", value: date)
            .order("slot")
            .execute()
            .value
        async let settingRows: [StaffDaySettingRow] = supabase
            .from("day_settings")
            .select(StaffDaySettingRow.select)
            .eq("setting_date", value: date)
            .limit(1)
            .execute()
            .value

        let bookings = try await bookingRows
        let dogIDs = Array(Set(bookings.compactMap(\.dog_id))).sorted()
        let dogs: [StaffDogRow] = dogIDs.isEmpty ? [] : try await supabase
            .from("dogs")
            .select(StaffDogRow.select)
            .in("id", values: dogIDs)
            .execute()
            .value
        let humanIDs = Array(Set(dogs.compactMap(\.human_id))).sorted()
        let humans: [StaffHumanRow] = humanIDs.isEmpty ? [] : try await supabase
            .from("humans")
            .select(StaffHumanRow.select)
            .in("id", values: humanIDs)
            .execute()
            .value
        return StaffDayRead(bookings: bookings, dogs: dogs, humans: humans, setting: try await settingRows.first)
    }

    /// Mirrors `useBookings.updateBooking`: sends ONLY the columns present in
    /// `request.patch` and enforces server-side guards (`reminder_confirmed_source = 'staff'`,
    /// `status = 'Reconfirmed'` with fallback to confirmation-only clear).
    func updateBooking(_ request: StaffBookingWriteRequest) async throws -> StaffBookingWriteOutcome {
        let guardCond = request.guardCondition
        if let requiredStatus = guardCond.requireStatus {
            let first = try await executePatch(
                request.patch,
                bookingId: request.bookingId,
                requireStaffSource: guardCond.requireStaffConfirmationSource,
                requireStatus: requiredStatus
            )
            if let row = first {
                return .updated(row)
            }
            if let fallbackPatch = guardCond.fallbackPatchOnZeroRows {
                let second = try await executePatch(
                    fallbackPatch,
                    bookingId: request.bookingId,
                    requireStaffSource: guardCond.requireStaffConfirmationSource,
                    requireStatus: nil
                )
                return second.map(StaffBookingWriteOutcome.updated) ?? .notMatched
            }
            return .notMatched
        }

        let updated = try await executePatch(
            request.patch,
            bookingId: request.bookingId,
            requireStaffSource: guardCond.requireStaffConfirmationSource,
            requireStatus: nil
        )
        return updated.map(StaffBookingWriteOutcome.updated) ?? .notMatched
    }

    private func executePatch(
        _ patch: StaffBookingPatch,
        bookingId: String,
        requireStaffSource: Bool,
        requireStatus: String?
    ) async throws -> StaffBookingRow? {
        var query = try supabase
            .from("bookings")
            .update(patch)
            .eq("id", value: bookingId)
        if requireStaffSource {
            query = query.eq("reminder_confirmed_source", value: "staff")
        }
        if let requireStatus {
            query = query.eq("status", value: requireStatus)
        }
        return try await query
            .select(StaffBookingRow.select)
            .maybeSingle()
            .execute()
            .value
    }

    /// Mirrors `CollectionNoticeModal.jsx` contact loading: owner card + linked
    /// trusted contact cards, each routed through `StaffCollectionNotice.route`.
    func loadCollectionRecipients(ownerId: String) async throws -> [StaffCollectionRecipient] {
        async let ownerQuery: StaffCollectionContact? = supabase
            .from("humans")
            .select(StaffCollectionContact.select)
            .eq("id", value: ownerId)
            .maybeSingle()
            .execute()
            .value
        async let linksQuery: [StaffTrustedContactLink] = supabase
            .from("human_trusted_contacts")
            .select(StaffTrustedContactLink.select)
            .eq("human_id", value: ownerId)
            .execute()
            .value

        let owner = try await ownerQuery
        let links = try await linksQuery
        let trustedIDs = Array(Set(links.compactMap(\.trusted_id))).sorted()
        let relationshipByID = Dictionary(
            links.compactMap { link -> (String, String)? in
                guard let id = link.trusted_id, !id.isEmpty else { return nil }
                let rel = (link.relationship ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                return (id, rel.isEmpty ? "Trusted contact" : rel)
            },
            uniquingKeysWith: { first, _ in first }
        )

        let trustedContacts: [StaffCollectionContact] = trustedIDs.isEmpty ? [] : try await supabase
            .from("humans")
            .select(StaffCollectionContact.select)
            .in("id", values: trustedIDs)
            .execute()
            .value

        let humanIDs = trustedIDs + (owner.map { [$0.id] } ?? [])
        // Match the website's 120-day lookback. The database mirrors Meta's
        // final status onto notification_log, including existing history.
        let since = ISO8601DateFormatter().string(from: Date().addingTimeInterval(-120 * 86_400))
        let history: [StaffCollectionDeliveryRow] = humanIDs.isEmpty ? [] : try await supabase
            .from("notification_log")
            .select(StaffCollectionDeliveryRow.select)
            .in("human_id", values: humanIDs)
            .gte("created_at", value: since)
            .order("created_at", ascending: false)
            .execute()
            .value
        let unreachable = StaffCollectionNotice.unreachableRecipients(in: history)

        var recipients: [StaffCollectionRecipient] = []
        if let owner {
            recipients.append(StaffCollectionRecipient(
                id: owner.id,
                displayName: owner.displayName,
                relationship: "Owner",
                isOwner: true,
                contact: owner,
                route: StaffCollectionNotice.route(for: owner, whatsappUnreachable: unreachable.contains(owner.id))
            ))
        }
        for contact in trustedContacts {
            recipients.append(StaffCollectionRecipient(
                id: contact.id,
                displayName: contact.displayName,
                relationship: relationshipByID[contact.id] ?? "Trusted contact",
                isOwner: false,
                contact: contact,
                route: StaffCollectionNotice.route(for: contact, whatsappUnreachable: unreachable.contains(contact.id))
            ))
        }
        return recipients
    }

    /// Calls `whatsapp-send` or `sms-send` in template mode using the signed-in staff JWT.
    func sendCollectionNotice(_ request: StaffCollectionSendRequest) async -> StaffCollectionSendOutcome {
        do {
            let reply: StaffCollectionFunctionReply
            switch request {
            case .whatsapp(let to, let templateName, let language, let params, let humanId, let bookingId):
                let body = WhatsAppTemplateBody(
                    mode: "collection",
                    booking_id: bookingId,
                    to: to,
                    template_name: templateName,
                    language: language,
                    params: params,
                    human_id: humanId
                )
                reply = try await supabase.functions.invoke(
                    "whatsapp-send",
                    options: FunctionInvokeOptions(body: body)
                )
            case .sms(let to, let text, let templateName, let humanId, let bookingId):
                let body = SmsTemplateBody(
                    mode: "collection",
                    booking_id: bookingId,
                    to: to,
                    text: text,
                    template_name: templateName,
                    human_id: humanId
                )
                reply = try await supabase.functions.invoke(
                    "sms-send",
                    options: FunctionInvokeOptions(body: body)
                )
            }
            return reply.result(status: 200)
        } catch FunctionsError.httpError(let status, let data) {
            guard let reply = try? JSONDecoder().decode(StaffCollectionFunctionReply.self, from: data) else {
                return .unknown
            }
            return reply.result(status: status)
        } catch {
            return .unknown
        }
    }

    /// Subscribes to `public.bookings` changes via Supabase Realtime so a colleague's
    /// move on another till refreshes Today automatically (ST-10).
    func observeBookings() -> AsyncStream<Void> {
        let supabase = supabase
        return AsyncStream { continuation in
            let channel = supabase.realtimeV2.channel("ios-staff-today-bookings-\(UUID().uuidString)")
            let changes = channel.postgresChange(AnyAction.self, schema: "public", table: "bookings")
            let task = Task {
                do {
                    try await channel.subscribeWithError()
                } catch {
                    continuation.finish()
                    return
                }
                for await _ in changes {
                    if Task.isCancelled { break }
                    continuation.yield(())
                }
                await supabase.realtimeV2.removeChannel(channel)
                continuation.finish()
            }
            continuation.onTermination = { _ in
                task.cancel()
                Task { await supabase.realtimeV2.removeChannel(channel) }
            }
        }
    }
}

private struct WhatsAppTemplateBody: Encodable {
    let mode: String
    let booking_id: String
    let to: String
    let template_name: String
    let language: String
    let params: [String]
    let human_id: String
}

private struct SmsTemplateBody: Encodable {
    let mode: String
    let booking_id: String
    let to: String
    let text: String
    let template_name: String
    let human_id: String
}
