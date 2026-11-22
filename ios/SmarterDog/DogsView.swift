import SwiftUI

/// My dogs: the customer's dogs, with add and edit. Writes go through the two
/// customer RPCs. The confirmed size is the salon's call; the form only asks
/// what the customer thinks, and says so.
@MainActor
@Observable
final class DogsModel {
    enum State: Equatable {
        case loading
        case loaded([DogListItem])
        case failed
    }

    private(set) var state: State = .loading
    private let client: SalonDogsClient?

    init(client: SalonDogsClient?) {
        self.client = client
    }

    func load() async {
        guard let client else {
            state = .failed
            return
        }
        do {
            state = .loaded(DogsSelector.items(from: try await client.loadDogs()))
        } catch {
            state = .failed
        }
    }

    /// Returns a message for the customer when the save did not go through, otherwise nil.
    func save(_ draft: DogDraft, editing id: String?) async -> String? {
        if let problem = DogDraftCheck.problem(draft, today: HomeSelector.londonDate(Date())) {
            return problem
        }
        guard let client else { return "The app isn't connected to the salon." }
        do {
            if let id {
                try await client.updateDog(id: id, draft)
            } else {
                guard let humanId = try await client.ownHumanId() else {
                    return "We can't find your record. Please try signing in again."
                }
                try await client.addDog(draft, humanId: humanId)
            }
            await load()
            return nil
        } catch {
            return "We couldn't save that. Check your connection and try again."
        }
    }
}

struct DogsView: View {
    var onChanged: () -> Void = {}
    @State private var model: DogsModel
    @State private var editor: EditorTarget?

    init(onChanged: @escaping () -> Void = {}, client: SalonDogsClient? = SupabaseDogsClient.make()) {
        self.onChanged = onChanged
        _model = State(initialValue: DogsModel(client: client))
    }

    struct EditorTarget: Identifiable {
        let id = UUID()
        let dogId: String?
        let draft: DogDraft
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AppSpace.s3) {
                HeroTitle(text: "Your dogs")
                content
            }
            .padding(.horizontal, AppSpace.s2)
            .padding(.vertical, AppSpace.s3)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await model.load() }
        .background(AppColor.surface.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .sheet(item: $editor) { target in
            DogEditorSheet(target: target) { draft in
                let message = await model.save(draft, editing: target.dogId)
                if message == nil { onChanged() }
                return message
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch model.state {
        case .loading:
            ProgressView()
                .tint(AppColor.textPrimary)
                .accessibilityLabel("Loading your dogs")
        case .failed:
            VStack(alignment: .leading, spacing: AppSpace.s1_5) {
                ErrorNote(message: "We couldn't load your dogs. Check your connection and try again.")
                PrimaryButton(title: "Try again") { Task { await model.load() } }
            }
        case .loaded(let items):
            if !items.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        Button {
                            editor = EditorTarget(dogId: item.id, draft: item.draft)
                        } label: {
                            DogListRow(item: item)
                        }
                        .buttonStyle(.plain)
                        if index < items.count - 1 {
                            Divider().overlay(AppColor.separator)
                        }
                    }
                }
                .cardSurface()
            }
            PrimaryButton(title: items.isEmpty ? "Add your first dog" : "Add a dog") {
                editor = EditorTarget(dogId: nil, draft: DogDraft())
            }
        }
    }
}

private struct DogListRow: View {
    let item: DogListItem

    var body: some View {
        HStack(spacing: AppSpace.s1_5) {
            SizeChip(letter: item.sizeLetter)
            VStack(alignment: .leading, spacing: 0) {
                Text(item.name)
                    .font(.headline)
                    .foregroundStyle(AppColor.textPrimary)
                if !item.breed.isEmpty {
                    Text(item.breed)
                        .font(.subheadline)
                        .foregroundStyle(AppColor.textSecondary)
                }
                if let note = item.sizeNote {
                    Text(note)
                        .font(.caption)
                        .foregroundStyle(AppColor.textSecondary)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(AppColor.textSecondary)
                .accessibilityHidden(true)
        }
        .padding(.vertical, AppSpace.s1_5)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("Edit")
    }
}

private struct DogEditorSheet: View {
    let target: DogsView.EditorTarget
    /// Returns a message when the save failed, or nil when it worked.
    let save: (DogDraft) async -> String?

    @Environment(\.dismiss) private var dismiss
    @State private var draft: DogDraft
    @State private var hasBirthday: Bool
    @State private var birthday: Date
    @State private var saving = false
    @State private var message: String?
    @FocusState private var focused: Field?

    private enum Field { case name, breed }

    init(target: DogsView.EditorTarget, save: @escaping (DogDraft) async -> String?) {
        self.target = target
        self.save = save
        _draft = State(initialValue: target.draft)
        let existing = target.draft.dob.flatMap { DogDraftCheck.date(fromISO: $0) }
        _hasBirthday = State(initialValue: existing != nil)
        _birthday = State(initialValue: existing ?? Date())
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AppSpace.s2) {
                    field("Name") {
                        TextField("Name", text: $draft.name)
                            .textInputAutocapitalization(.words)
                            .focused($focused, equals: .name)
                    } focused: { focused == .name }

                    field("Breed") {
                        TextField("For example Cockapoo", text: $draft.breed)
                            .textInputAutocapitalization(.words)
                            .focused($focused, equals: .breed)
                    } focused: { focused == .breed }

                    VStack(alignment: .leading, spacing: AppSpace.s1) {
                        SectionLabel(text: "How big is your dog?")
                        Picker("Size", selection: $draft.reportedSize) {
                            Text("Not sure").tag(String?.none)
                            Text("Small").tag(String?.some("small"))
                            Text("Medium").tag(String?.some("medium"))
                            Text("Large").tag(String?.some("large"))
                        }
                        .pickerStyle(.segmented)
                        Text("This helps us plan. The salon confirms your dog's size.")
                            .font(.footnote)
                            .foregroundStyle(AppColor.textSecondary)
                    }

                    VStack(alignment: .leading, spacing: AppSpace.s1) {
                        Toggle("I know their birthday", isOn: $hasBirthday)
                            .font(.body)
                        if hasBirthday {
                            DatePicker("Birthday", selection: $birthday, in: ...Date(), displayedComponents: .date)
                                .datePickerStyle(.compact)
                        }
                    }

                    if let message {
                        ErrorNote(message: message)
                    }

                    PrimaryButton(title: "Save", busy: saving, busyTitle: "Saving") {
                        Task { await submit() }
                    }
                }
                .padding(AppSpace.s2)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(AppColor.surface.ignoresSafeArea())
            .navigationTitle(target.dogId == nil ? "Add a dog" : "Edit dog")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .interactiveDismissDisabled(saving)
    }

    private func field<Content: View>(
        _ label: String,
        @ViewBuilder content: () -> Content,
        focused: () -> Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: AppSpace.s1) {
            SectionLabel(text: label)
            content()
                .appControlChrome(focused: focused())
                .accessibilityLabel(label)
        }
    }

    private func submit() async {
        saving = true
        message = nil
        var toSend = draft
        toSend.dob = hasBirthday ? DogDraftCheck.isoDate(birthday) : nil
        let result = await save(toSend)
        saving = false
        if let result {
            message = result
        } else {
            dismiss()
        }
    }
}
