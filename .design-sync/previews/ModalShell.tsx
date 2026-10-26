import { Button, ModalShell } from "smarter-dog-ui";

const noop = () => {};

const Header = ({ id }: { id: string }) => (
  <div style={{ padding: "16px 20px 8px" }}>
    <h2 id={id} style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
      Bella
    </h2>
    <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>Medium · Full Groom · Mon 08:30</div>
  </div>
);

const Footer = () => (
  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px" }}>
    <Button variant="ghost" onClick={noop}>
      Close
    </Button>
    <Button onClick={noop}>Save changes</Button>
  </div>
);

export const Default = () => (
  <ModalShell
    onClose={noop}
    titleId="preview-modal-title"
    accent="#2F8F8B"
    widthClass="w-[min(480px,93vw)]"
    header={<Header id="preview-modal-title" />}
    footer={<Footer />}
    bodyClassName="px-5 py-3"
  >
    <p style={{ margin: 0, fontSize: 14 }}>
      The header and footer stay pinned while this body scrolls. Escape, the backdrop and the close button all
      dismiss it, and focus returns to what opened it.
    </p>
  </ModalShell>
);

export const MobileSheet = () => (
  <ModalShell
    onClose={noop}
    titleId="preview-sheet-title"
    accent="#FECC13"
    mobilePresentation="sheet"
    widthClass="w-[min(420px,93vw)]"
    header={<Header id="preview-sheet-title" />}
    footer={<Footer />}
    bodyClassName="px-5 py-3"
  >
    <p style={{ margin: 0, fontSize: 14 }}>Below the sm breakpoint this slides up as a bottom sheet.</p>
  </ModalShell>
);
