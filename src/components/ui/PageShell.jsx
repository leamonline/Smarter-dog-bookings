// The staff app's outer frame: a fixed-height flex column that owns the
// viewport, so the chrome stays put and only the workspace scrolls.
//
// Why fixed height. The frame used to have no height at all and the document
// did the scrolling, which meant the toolbar scrolled away with the content
// and any view that wanted to fill the window had to measure the viewport in
// JavaScript to find out how much room was left. Giving the frame `100dvh`
// and letting flexbox subtract the chrome means the browser answers that
// question — one ruler instead of two.
//
// `dvh` rather than `vh` so iOS Safari's collapsing toolbar is accounted for.
// The on-screen keyboard is the one case this does not cover, because it
// shrinks the visual viewport without resizing the layout viewport; the Inbox
// composer handles that with useFillViewportHeight.
const SHELL = "h-[100dvh] flex flex-col overflow-hidden font-sans";

// Centred, gutter-padded track shared by the chrome and the workspace, so a
// full-bleed bar and the content beneath it line up. Raised from 1536px:
// at 1536 a 1920 monitor kept ~200px of dead gutter down each side.
const TRACK = "w-full max-w-[1800px] mx-auto px-[var(--app-gutter)]";

/**
 * @param {object} props
 * @param {React.ReactNode} [props.chrome] Pinned above the workspace: banners, toolbar, nav.
 * @param {boolean} [props.scroll] Whether the workspace scrolls (flowing views) or
 *   manages its own internal scrolling (workspace views such as the calendar).
 * @param {object} [props.mainProps] Extra attributes for the <main> element.
 * @param {React.Ref} [props.mainRef] Ref to the <main> element — it is the app's
 *   scroll container, so callers that need to read or reset scroll want this one.
 */
export function AppFrame({
  children,
  className = "",
  chrome = null,
  scroll = true,
  mainProps = {},
  mainRef = null,
}) {
  const { className: mainClassName = "", ...restMainProps } = mainProps;

  return (
    <div className={[SHELL, className].filter(Boolean).join(" ")}>
      {chrome && <div className={`${TRACK} shrink-0`}>{chrome}</div>}
      <main
        ref={mainRef}
        {...restMainProps}
        className={[
          "flex-1 min-h-0",
          scroll ? "overflow-y-auto" : "overflow-hidden",
          mainClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className={`${TRACK} ${scroll ? "py-5" : "h-full py-5"}`}>{children}</div>
      </main>
    </div>
  );
}

export function CenteredScreen({
  children,
  className = "",
  fontClassName = "font-sans",
}) {
  const classes = [
    "min-h-screen bg-brand-paper flex items-center justify-center p-5",
    fontClassName,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}

export function PortalCard({ children, className = "" }) {
  const classes = [
    "w-full max-w-[400px] bg-white p-7 border border-slate-200",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}
