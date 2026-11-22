import SwiftUI
import UIKit
@preconcurrency import WebKit

enum TurnstileEvent {
    case token(String)
    case expired
    case failed
}

/// The same Cloudflare check the website shows before a password or a text code.
/// The site key is public. The secret key never comes near the app.
struct SecurityCheckView: View {
    let siteKey: String?
    let onEvent: (TurnstileEvent) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Security check")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Brand.ink)
                .accessibilityAddTraits(.isHeader)

            if let siteKey {
                TurnstileWebView(siteKey: siteKey, onEvent: onEvent)
                    .frame(minHeight: 72)
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel("Security check")
            } else {
                Text("The security check isn't available in this build, so signing in is turned off. The website's public Turnstile site key has to be added with the salon connection.")
                    .font(.subheadline)
                    .foregroundStyle(Brand.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Brand.paperLine, lineWidth: 1)
        )
    }
}

private struct TurnstileWebView: UIViewRepresentable {
    let siteKey: String
    let onEvent: (TurnstileEvent) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onEvent: onEvent)
    }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "turnstile")
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.allowsLinkPreview = false
        webView.loadHTMLString(
            TurnstilePage.html(siteKey: siteKey),
            baseURL: URL(string: "https://smarterdog.co.uk")
        )
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.onEvent = onEvent
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "turnstile")
    }

    @MainActor
    final class Coordinator: NSObject, WKScriptMessageHandler {
        var onEvent: (TurnstileEvent) -> Void

        init(onEvent: @escaping (TurnstileEvent) -> Void) {
            self.onEvent = onEvent
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            let body = message.body as? [String: Any]
            let event = body?["event"] as? String ?? ""
            let token = body?["token"] as? String ?? ""
            deliver(event: event, token: token)
        }

        private func deliver(event: String, token: String) {
            switch event {
            case "token" where !token.isEmpty:
                onEvent(.token(token))
            case "expired":
                onEvent(.expired)
            default:
                onEvent(.failed)
            }
        }
    }
}

private enum TurnstilePage {
    static func html(siteKey: String) -> String {
        """
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          html, body { margin: 0; padding: 0; background: transparent; }
          body { display: flex; justify-content: center; }
        </style>
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
        </head>
        <body>
        <div class="cf-turnstile" data-sitekey="\(siteKey)" data-theme="light" data-callback="onToken" data-expired-callback="onExpired" data-error-callback="onFailed"></div>
        <script>
          function post(event, token) {
            window.webkit.messageHandlers.turnstile.postMessage({ event: event, token: token || "" });
          }
          function onToken(token) { post("token", token); }
          function onExpired() { post("expired", ""); }
          function onFailed() { post("failed", ""); }
        </script>
        </body>
        </html>
        """
    }
}
