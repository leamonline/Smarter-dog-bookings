import SwiftUI

/// Branded sign-in placeholder. Continue and Staff sign in do nothing yet.
struct SignInView: View {
    @State private var phoneNumber = ""

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 48)

            VStack(spacing: 12) {
                Text("Smarter Dog")
                    .font(.largeTitle.weight(.bold))
                    .foregroundStyle(Brand.ink)
                    .accessibilityAddTraits(.isHeader)

                RoundedRectangle(cornerRadius: 2)
                    .fill(Brand.yellow)
                    .frame(width: 56, height: 4)
                    .accessibilityHidden(true)

                Text("Smarter grooming for a Smarter Dog.")
                    .font(.subheadline)
                    .foregroundStyle(Brand.ink.opacity(0.72))
                    .multilineTextAlignment(.center)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Phone number")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Brand.ink)

                TextField("07123 456789", text: $phoneNumber)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.body)
                    .padding(16)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Brand.paperLine, lineWidth: 1)
                    )
                    .accessibilityLabel("Phone number")
            }
            .padding(.top, 36)

            // No network yet. The action is intentionally empty.
            Button(action: {}) {
                Text("Continue")
                    .font(.headline)
                    .foregroundStyle(Brand.ink)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Brand.yellow)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, 16)
            .accessibilityHint("Does not sign in yet")

            Spacer(minLength: 24)

            // No network yet. The action is intentionally empty.
            Button(action: {}) {
                Text("Staff sign in")
                    .font(.subheadline.weight(.semibold))
                    .underline()
                    .foregroundStyle(Brand.cyanDark)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.plain)
            .padding(.bottom, 12)
            .accessibilityHint("Does not sign in yet")
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.paper.ignoresSafeArea())
        .tint(Brand.cyanDark)
        .preferredColorScheme(.light)
    }
}

#Preview {
    SignInView()
}
