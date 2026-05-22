import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import {
  getHumanByIdOrName,
} from "../../engine/bookingRules.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { normalisePhoneDigits } from "./dog-card/helpers.js";
import {
  HumanBookingHistory,
  HumanHeader,
  ContactPanel,
  ChannelsPanel,
  NotesPanel,
  AtAGlanceStrip,
  DogsPanel,
  TrustedHumansPanel,
  RemindersPanel,
} from "./human-card/index.js";

export function HumanCardModal({
  humanId,
  onClose,
  onOpenHuman,
  onOpenDog,
  humans,
  dogs,
  onUpdateHuman,
  onAddHuman,
  onDeleteHuman,
  bookingsByDate,
  fetchHumanById,
  findHumanByFullName,
  searchHumansByTerm,
}) {
  const toast = useToast();
  const [pendingDelete, setPendingDelete] = useState(false);

  // If the requested human isn't in the local map (e.g. their row sits
  // past the initial PAGE_SIZE pagination boundary), fetch them on demand
  // so the card doesn't fall back to showing the raw UUID.
  useEffect(() => {
    if (!humanId || !fetchHumanById) return;
    if (humans?.[humanId]) return;
    fetchHumanById(humanId);
  }, [humanId, humans, fetchHumanById]);

  const human = getHumanByIdOrName(humans, humanId) || {
    id: humanId,
    fullName: "",
    name: "",
    surname: "",
    phone: "",
    sms: false,
    whatsapp: false,
    email: "",
    fb: "",
    insta: "",
    tiktok: "",
    address: "",
    notes: "",
    trustedIds: [],
    trustedContacts: [],
    historyFlag: "",
  };

  const humanFullName =
    human.fullName || `${human.name || ""} ${human.surname || ""}`.trim();

  // --- Edit state ---
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(human.name || "");
  const [editSurname, setEditSurname] = useState(human.surname || "");
  const [editPhone, setEditPhone] = useState(human.phone || "");
  const [editEmail, setEditEmail] = useState(human.email || "");
  const [editAddress, setEditAddress] = useState(human.address || "");
  const [editFb, setEditFb] = useState(human.fb || "");
  const [editInsta, setEditInsta] = useState(human.insta || "");
  const [editTiktok, setEditTiktok] = useState(human.tiktok || "");
  const [editNotes, setEditNotes] = useState(human.notes || "");
  const [editSms, setEditSms] = useState(!!human.sms);
  const [editWhatsapp, setEditWhatsapp] = useState(!!human.whatsapp);
  const [editHistoryFlag, setEditHistoryFlag] = useState(human.historyFlag || "");

  useEffect(() => {
    if (!isEditing) {
      setEditName(human.name || "");
      setEditSurname(human.surname || "");
      setEditPhone(human.phone || "");
      setEditEmail(human.email || "");
      setEditAddress(human.address || "");
      setEditFb(human.fb || "");
      setEditInsta(human.insta || "");
      setEditTiktok(human.tiktok || "");
      setEditNotes(human.notes || "");
      setEditSms(!!human.sms);
      setEditWhatsapp(!!human.whatsapp);
      setEditHistoryFlag(human.historyFlag || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form fields seed from props only when a different human is selected; live edits and isEditing transitions must not overwrite the user's typing
  }, [human.id]);

  const handleSaveHuman = async () => {
    const trimmedPhone = editPhone.trim();
    if (trimmedPhone && normalisePhoneDigits(trimmedPhone).length < 10) {
      toast.show(
        "Please enter a valid phone number (at least 10 digits).",
        "error",
      );
      return;
    }
    const updates = {
      name: editName.trim(),
      surname: editSurname.trim(),
      fullName: `${editName.trim()} ${editSurname.trim()}`.trim(),
      phone: trimmedPhone,
      email: editEmail.trim(),
      address: editAddress.trim(),
      fb: editFb.trim(),
      insta: editInsta.trim(),
      tiktok: editTiktok.trim(),
      notes: editNotes.trim(),
      sms: editSms,
      whatsapp: editWhatsapp,
      historyFlag: editHistoryFlag.trim(),
    };
    await onUpdateHuman(human.id || humanId, updates);
    setIsEditing(false);
    toast.show("Profile saved", "success");
  };

  const handleCancelEdit = () => {
    setEditName(human.name || "");
    setEditSurname(human.surname || "");
    setEditPhone(human.phone || "");
    setEditEmail(human.email || "");
    setEditAddress(human.address || "");
    setEditFb(human.fb || "");
    setEditInsta(human.insta || "");
    setEditTiktok(human.tiktok || "");
    setEditNotes(human.notes || "");
    setEditSms(!!human.sms);
    setEditWhatsapp(!!human.whatsapp);
    setEditHistoryFlag(human.historyFlag || "");
    setIsEditing(false);
  };

  const handleCopyPhone = () => {
    if (!human.phone) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(human.phone);
      toast.show(`Copied ${human.phone}`, "success");
    } else {
      toast.show("Clipboard not available", "error");
    }
  };

  return (
    <>
      <AccessibleModal
        onClose={onClose}
        titleId="human-card-title"
        backdropClass="bg-[rgba(45,0,75,0.45)] animate-overlay-fade"
        className="bg-[var(--color-brand-paper)] rounded-[20px] w-[min(820px,95vw)] max-h-[90vh] overflow-auto shadow-[0_18px_50px_-12px_rgba(45,0,75,0.28)] animate-human-modal-in"
      >
        <HumanHeader
          human={human}
          humanFullName={humanFullName}
          isEditing={isEditing}
          editName={editName}
          setEditName={setEditName}
          editSurname={editSurname}
          setEditSurname={setEditSurname}
          editPhone={editPhone}
          setEditPhone={setEditPhone}
          onStartEdit={() => setIsEditing(true)}
          onClose={onClose}
          canEdit={!!onUpdateHuman}
          onCopyPhone={handleCopyPhone}
        />

        <div className="px-5 pb-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {/* Left column — Contact, Channels, Notes */}
            <div className="flex flex-col gap-3 md:gap-4">
              <ContactPanel
                isEditing={isEditing}
                human={human}
                editAddress={editAddress}
                setEditAddress={setEditAddress}
                editEmail={editEmail}
                setEditEmail={setEditEmail}
              />
              <ChannelsPanel
                isEditing={isEditing}
                human={human}
                editSms={editSms}
                setEditSms={setEditSms}
                editWhatsapp={editWhatsapp}
                setEditWhatsapp={setEditWhatsapp}
                editFb={editFb}
                setEditFb={setEditFb}
                editInsta={editInsta}
                setEditInsta={setEditInsta}
                editTiktok={editTiktok}
                setEditTiktok={setEditTiktok}
              />
              <NotesPanel
                isEditing={isEditing}
                human={human}
                editNotes={editNotes}
                setEditNotes={setEditNotes}
                editHistoryFlag={editHistoryFlag}
                setEditHistoryFlag={setEditHistoryFlag}
              />
            </div>

            {/* Right column — At a glance, Dogs, Trusted, Reminders */}
            <div className="flex flex-col gap-3 md:gap-4">
              <AtAGlanceStrip
                human={human}
                humanFullName={humanFullName}
                dogs={dogs}
                bookingsByDate={bookingsByDate}
              />
              <DogsPanel
                human={human}
                humanFullName={humanFullName}
                dogs={dogs}
                onClose={onClose}
                onOpenDog={onOpenDog}
              />
              <TrustedHumansPanel
                human={human}
                humanFullName={humanFullName}
                humans={humans}
                onClose={onClose}
                onOpenHuman={onOpenHuman}
                onUpdateHuman={onUpdateHuman}
                onAddHuman={onAddHuman}
                findHumanByFullName={findHumanByFullName}
                searchHumansByTerm={searchHumansByTerm}
              />
              <RemindersPanel human={human} onUpdateHuman={onUpdateHuman} />
            </div>
          </div>

          {/* Booking history spans both columns underneath the grid. */}
          <div className="mt-3 md:mt-4 bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] px-4 pt-3 pb-2">
            <HumanBookingHistory
              human={human}
              dogs={dogs}
              bookingsByDate={bookingsByDate}
            />
          </div>
        </div>

        {isEditing && (
          <div className="px-5 py-4 flex gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={handleSaveHuman}
              className="flex-1 py-2.5 rounded-control border-none text-sm font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-colors text-white bg-brand-teal hover:bg-brand-teal-dark"
            >
              <Check size={16} strokeWidth={2.4} aria-hidden="true" /> Save changes
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="flex-1 py-2.5 rounded-control border-[1.5px] border-slate-200 bg-white text-slate-600 text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Destructive action sits below the footer, calmer than a
            danger button — staff has to deliberately reach for it. */}
        {isEditing && onDeleteHuman && (
          <div className="px-5 pb-5 -mt-2">
            <button
              type="button"
              onClick={() => setPendingDelete(true)}
              className="text-xs font-bold text-brand-coral underline cursor-pointer bg-transparent border-none p-0 font-[inherit] hover:text-brand-coral-text transition-colors"
            >
              Delete this person…
            </button>
          </div>
        )}
      </AccessibleModal>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this person?"
          message="They will be removed from the directory. Any dogs registered to them, their booking history, and groom photos will be deleted. WhatsApp threads stay but lose their link to this person. Cannot be undone."
          confirmLabel="Delete person"
          variant="danger"
          onConfirm={async () => {
            const result = await onDeleteHuman?.(humanId);
            setPendingDelete(false);
            if (result?.ok) {
              toast.show("Deleted", "success");
              onClose?.();
            } else if (result?.error) {
              toast.show(result.error, "error");
            }
          }}
          onCancel={() => setPendingDelete(false)}
        />
      )}
    </>
  );
}
