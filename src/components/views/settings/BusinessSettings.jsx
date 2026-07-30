import { Card, CardHead, CardBody, ReadOnlyNotice, LABEL_CLS, INPUT_CLS } from "./shared.jsx";
import { DEFAULT_BUSINESS_NAME } from "../../../constants/index";

export function BusinessSettings({ config }) {
  const business = {
    name: config?.businessName || DEFAULT_BUSINESS_NAME,
    phone: config?.businessPhone || "",
    email: config?.businessEmail || "",
    address: config?.businessAddress || "",
  };

  return (
    <Card id="settings-business">
      <CardHead variant="teal" title="Your Business" desc="Details shown to customers on the booking portal" />
      <CardBody>
        <ReadOnlyNotice>
          These details are read-only for now because this screen does not update every customer-facing place. Ask the owner for a coordinated app update.
        </ReadOnlyNotice>
        <div className="mb-3">
          <label className={LABEL_CLS}>Salon Name</label>
          <input
            type="text"
            disabled
            value={business.name}
            readOnly
            className={`${INPUT_CLS} ${
              business.name === DEFAULT_BUSINESS_NAME ? "italic text-slate-500/60" : ""
            }`}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-3">
          <div>
            <label className={LABEL_CLS}>Phone</label>
            <input
              type="tel"
              disabled
              value={business.phone}
              readOnly
              className={INPUT_CLS}
              placeholder="07700 900123"
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Email</label>
            <input
              type="email"
              disabled
              value={business.email}
              readOnly
              className={INPUT_CLS}
              placeholder="hello@smarterdog.co.uk"
            />
          </div>
        </div>
        <div className="mb-3.5">
          <label className={LABEL_CLS}>Address</label>
          <input
            type="text"
            disabled
            value={business.address}
            readOnly
            className={INPUT_CLS}
            placeholder="123 High Street, Exampletown"
          />
        </div>
      </CardBody>
    </Card>
  );
}
