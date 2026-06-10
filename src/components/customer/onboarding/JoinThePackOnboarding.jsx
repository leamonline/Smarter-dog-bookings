import { useState } from "react";
import { customerSupabase as supabase } from "../../../supabase/customerClient.js";
import { submitCustomerSignup } from "../../../supabase/rpc";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { CenteredScreen } from "../../ui/PageShell.jsx";
import { PawPrint, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { AddressPicker } from "./AddressPicker.jsx";
import { formatPhoneForDisplay } from "../../../utils/phone.js";
import { getSizeForBreed, ALERT_OPTIONS } from "../../../constants/index";
import { BREED_LIST } from "../../../constants/breeds";
import {
  SALON_TERMS_URL,
  SALON_MATTED_COAT_POLICY_URL,
  SALON_PRIVACY_URL,
  POLICIES_VERSION,
} from "../../../constants/salonPolicies.ts";

// Flat, de-duped, alphabetically-sorted breed list for the dropdown.
const BREED_OPTIONS = Array.from(
  new Set([
    ...(BREED_LIST.small || []),
    ...(BREED_LIST.medium || []),
    ...(BREED_LIST.large || []),
    ...(BREED_LIST.cross || []),
  ]),
).sort((a, b) => a.localeCompare(b));

const MONTHS = [
  ["01", "January"], ["02", "February"], ["03", "March"], ["04", "April"],
  ["05", "May"], ["06", "June"], ["07", "July"], ["08", "August"],
  ["09", "September"], ["10", "October"], ["11", "November"], ["12", "December"],
];

const CURRENT_YEAR = new Date().getFullYear();
// Dogs live ~20 years; offer a generous range back from this year.
const YEARS = Array.from({ length: 26 }, (_, i) => String(CURRENT_YEAR - i));

function blankDog() {
  return {
    name: "",
    breed: "",
    customBreed: "",
    sex: "",
    dobMonth: "",
    dobYear: "",
    alerts: [],
    groomNotes: "",
    microchip: "",
    neutered: "", // "" | "yes" | "no"
    vet: "",
    colour: "",
    showOptional: false,
  };
}

function dogReady(d) {
  const breed = d.breed === "__other__" ? d.customBreed.trim() : d.breed.trim();
  return Boolean(d.name.trim() && breed && d.sex && d.dobMonth && d.dobYear);
}

/**
 * Multi-step self-signup onboarding ("Join the Pack"), shown to a pending
 * customer (approved_at NULL, not yet submitted) after they've set a password.
 *
 * Step 1 — about you: first name, surname, the read-only verified phone,
 *   address (shared AddressPicker), email, and policy agreement. All required.
 * Step 2 — your dog(s): one required, "Add another dog" for more. Mandatory
 *   per dog: name, breed, sex, month & year of birth. Optional extras behind a
 *   disclosure. Size is derived from the breed (getSizeForBreed) — not asked.
 *
 * Submitting calls submit_customer_signup(), which writes everything + a staff
 * review to-do atomically and flips the customer into the "pending" state.
 */
export function JoinThePackOnboarding({ humanRecord, onComplete, onSignOut }) {
  const toast = useToast();

  const [step, setStep] = useState(1);

  // Owner. The phone is already verified (it's how they got here) and is
  // shown read-only — it's the username they sign in with.
  const verifiedPhone = humanRecord?.phone || "";
  const [name, setName] = useState(humanRecord?.name?.trim() || "");
  const [surname, setSurname] = useState(humanRecord?.surname?.trim() || "");
  const [email, setEmail] = useState("");
  const [addr, setAddr] = useState({ ready: false, address: null, postcode: null, keepingExisting: false });
  const [policiesAccepted, setPoliciesAccepted] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  // Dogs
  const [dogs, setDogs] = useState([blankDog()]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const step1Valid =
    name.trim() !== "" &&
    surname.trim() !== "" &&
    emailValid &&
    addr.ready &&
    policiesAccepted;
  const dogsValid = dogs.length > 0 && dogs.every(dogReady);

  function updateDog(index, patch) {
    setDogs((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }
  function addDog() {
    setDogs((prev) => [...prev, blankDog()]);
  }
  function removeDog(index) {
    setDogs((prev) => prev.filter((_, i) => i !== index));
  }
  function toggleAlert(index, label) {
    setDogs((prev) =>
      prev.map((d, i) => {
        if (i !== index) return d;
        const has = d.alerts.includes(label);
        return { ...d, alerts: has ? d.alerts.filter((a) => a !== label) : [...d.alerts, label] };
      }),
    );
  }

  async function handleSubmit() {
    if (!step1Valid || !dogsValid || !supabase) return;
    setSaving(true);
    setError(null);

    const owner = {
      name: name.trim(),
      surname: surname.trim(),
      address: addr.address || humanRecord?.address?.trim() || "",
      postcode: addr.postcode,
      email: email.trim(),
      // Reminders default on — they just signed up and gave us their number.
      sms: true,
      whatsapp: true,
      policies_version: POLICIES_VERSION,
    };

    const dogPayload = dogs.map((d) => {
      const breed = d.breed === "__other__" ? d.customBreed.trim() : d.breed.trim();
      return {
        name: d.name.trim(),
        breed,
        sex: d.sex || null,
        dob: d.dobYear && d.dobMonth ? `${d.dobYear}-${d.dobMonth}` : null,
        size: getSizeForBreed(breed) || null,
        microchip: d.microchip.trim() || null,
        neutered: d.neutered === "yes" ? true : d.neutered === "no" ? false : null,
        vet: d.vet.trim() || null,
        colour: d.colour.trim() || null,
        groom_notes: d.groomNotes.trim() || null,
        alerts: d.alerts,
      };
    });

    const { error: err } = await submitCustomerSignup(supabase, { owner, dogs: dogPayload });
    setSaving(false);
    if (err) {
      setError(err.message || "We couldn't save your details. Please try again.");
      return;
    }
    toast.show("Thanks — your details are in!", "success");
    await onComplete?.();
  }

  return (
    <CenteredScreen fontClassName="font-['Montserrat',sans-serif]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step === 1) {
            if (step1Valid) setStep(2);
          } else {
            handleSubmit();
          }
        }}
        className="w-full max-w-[520px] bg-white p-7 rounded-2xl border border-slate-200 shadow-sm"
      >
        <div className="text-center mb-5">
          <PawPrint size={32} className="text-brand-purple mx-auto mb-2" aria-hidden="true" />
          <h1 className="text-xl font-bold text-brand-purple font-display">
            {step === 1 ? "About you" : "About your dog"}
          </h1>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            {step === 1
              ? "Tell us who you are and where you are. Step 1 of 2."
              : "Add each of your dogs. Step 2 of 2."}
          </p>
        </div>

        {step === 1 && (
          <>
            <fieldset className="mb-5">
              <legend className="text-[13px] font-semibold text-[var(--sd-navy)] mb-2">Your name</legend>
              <div className="flex gap-2">
                <input
                  aria-label="First name"
                  autoComplete="given-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="First name"
                  className="portal-input"
                />
                <input
                  aria-label="Surname"
                  autoComplete="family-name"
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                  placeholder="Surname"
                  className="portal-input"
                />
              </div>
            </fieldset>

            <fieldset className="mb-5">
              <legend className="text-[13px] font-semibold text-[var(--sd-navy)] mb-2">Mobile number</legend>
              <input
                aria-label="Mobile number (verified)"
                type="tel"
                value={formatPhoneForDisplay(verifiedPhone) || verifiedPhone}
                readOnly
                tabIndex={-1}
                className="portal-input w-full bg-slate-50 text-slate-500"
              />
              <p className="text-[12px] text-slate-400 mt-1">
                Verified by text — this is the number you&apos;ll sign in with.
              </p>
            </fieldset>

            <fieldset className="mb-5">
              <legend className="text-[13px] font-semibold text-[var(--sd-navy)] mb-2">Your address</legend>
              <AddressPicker existingAddress={humanRecord?.address?.trim() || ""} onChange={setAddr} />
            </fieldset>

            <fieldset className="mb-5">
              <legend className="text-[13px] font-semibold text-[var(--sd-navy)] mb-2">Email address</legend>
              <input
                aria-label="Email address"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="portal-input w-full"
              />
            </fieldset>

            <label className="flex items-start gap-2.5 mb-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={policiesAccepted}
                onChange={(e) => setPoliciesAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-brand-purple shrink-0"
              />
              <span className="text-[13px] text-[var(--sd-navy)] leading-relaxed">
                I agree to Smarter Dog&apos;s{" "}
                <a href={SALON_TERMS_URL} target="_blank" rel="noopener noreferrer" className="text-brand-purple font-semibold underline">Terms</a>,{" "}
                <a href={SALON_MATTED_COAT_POLICY_URL} target="_blank" rel="noopener noreferrer" className="text-brand-purple font-semibold underline">Matted Coat Policy</a>{" "}
                and{" "}
                <a href={SALON_PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="text-brand-purple font-semibold underline">Privacy Policy</a>.
              </span>
            </label>

            <button type="submit" className="portal-btn portal-btn--cta w-full" disabled={!step1Valid}>
              Continue
            </button>
          </>
        )}

        {step === 2 && (
          <>
            {dogs.map((dog, i) => (
              <div key={i} className="mb-4 p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-semibold text-[var(--sd-navy)]">
                    Dog {i + 1}
                  </span>
                  {dogs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDog(i)}
                      className="text-slate-400 hover:text-brand-coral bg-transparent border-none cursor-pointer p-1 inline-flex items-center gap-1 text-[12px] font-semibold"
                      aria-label={`Remove dog ${i + 1}`}
                    >
                      <Trash2 size={14} aria-hidden="true" /> Remove
                    </button>
                  )}
                </div>

                <input
                  aria-label="Dog's name"
                  value={dog.name}
                  onChange={(e) => updateDog(i, { name: e.target.value })}
                  placeholder="Dog's name"
                  className="portal-input w-full mb-2"
                />

                <select
                  aria-label="Breed"
                  value={dog.breed}
                  onChange={(e) => updateDog(i, { breed: e.target.value })}
                  className="portal-input w-full mb-2"
                >
                  <option value="">Select breed</option>
                  {BREED_OPTIONS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                  <option value="__other__">Other / not listed</option>
                </select>
                {dog.breed === "__other__" && (
                  <input
                    aria-label="Breed"
                    value={dog.customBreed}
                    onChange={(e) => updateDog(i, { customBreed: e.target.value })}
                    placeholder="Enter breed"
                    className="portal-input w-full mb-2"
                  />
                )}

                <div className="flex gap-2 mb-2">
                  <select
                    aria-label="Sex"
                    value={dog.sex}
                    onChange={(e) => updateDog(i, { sex: e.target.value })}
                    className="portal-input flex-1"
                  >
                    <option value="">Sex</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                  <select
                    aria-label="Birth month"
                    value={dog.dobMonth}
                    onChange={(e) => updateDog(i, { dobMonth: e.target.value })}
                    className="portal-input flex-1"
                  >
                    <option value="">Birth month</option>
                    {MONTHS.map(([v, label]) => (
                      <option key={v} value={v}>{label}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Birth year"
                    value={dog.dobYear}
                    onChange={(e) => updateDog(i, { dobYear: e.target.value })}
                    className="portal-input flex-1"
                  >
                    <option value="">Year</option>
                    {YEARS.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => updateDog(i, { showOptional: !dog.showOptional })}
                  className="inline-flex items-center gap-1 text-[13px] text-brand-purple font-semibold bg-transparent border-none p-0 cursor-pointer mt-1"
                >
                  {dog.showOptional ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                  Add more about {dog.name.trim() || "your dog"} (optional)
                </button>

                {dog.showOptional && (
                  <div className="mt-3 space-y-2">
                    <div className="flex gap-2">
                      <input
                        aria-label="Colour / markings"
                        value={dog.colour}
                        onChange={(e) => updateDog(i, { colour: e.target.value })}
                        placeholder="Colour / markings"
                        className="portal-input flex-1"
                      />
                      <select
                        aria-label="Neutered"
                        value={dog.neutered}
                        onChange={(e) => updateDog(i, { neutered: e.target.value })}
                        className="portal-input flex-1"
                      >
                        <option value="">Neutered?</option>
                        <option value="yes">Neutered</option>
                        <option value="no">Not neutered</option>
                      </select>
                    </div>
                    <input
                      aria-label="Microchip number"
                      value={dog.microchip}
                      onChange={(e) => updateDog(i, { microchip: e.target.value })}
                      placeholder="Microchip number"
                      className="portal-input w-full"
                    />
                    <input
                      aria-label="Vet"
                      value={dog.vet}
                      onChange={(e) => updateDog(i, { vet: e.target.value })}
                      placeholder="Your vet (practice name)"
                      className="portal-input w-full"
                    />
                    <div>
                      <span className="text-[12px] font-semibold text-slate-500 block mb-1">
                        Anything we should know?
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {ALERT_OPTIONS.map((opt) => {
                          const active = dog.alerts.includes(opt.label);
                          return (
                            <button
                              type="button"
                              key={opt.label}
                              onClick={() => toggleAlert(i, opt.label)}
                              className={`text-[12px] font-semibold px-2.5 py-1 rounded-full border cursor-pointer ${
                                active
                                  ? "bg-brand-purple text-white border-brand-purple"
                                  : "bg-white text-slate-600 border-slate-200"
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <textarea
                      aria-label="Grooming notes"
                      value={dog.groomNotes}
                      onChange={(e) => updateDog(i, { groomNotes: e.target.value })}
                      placeholder="Grooming notes (e.g. teddy bear cut, short on ears)"
                      rows={2}
                      className="portal-input w-full resize-y"
                    />
                  </div>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addDog}
              className="inline-flex items-center gap-1.5 text-[13px] text-brand-purple font-semibold bg-transparent border-none p-0 cursor-pointer mb-4"
            >
              <Plus size={16} aria-hidden="true" /> Add another dog
            </button>

            {error && (
              <div role="alert" className="portal-alert portal-alert--error mb-3 text-[13px]">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="portal-btn portal-btn--secondary flex-1"
              >
                Back
              </button>
              <button type="submit" className="portal-btn portal-btn--cta flex-[2]" disabled={!dogsValid || saving}>
                {saving ? "Sending…" : "Finish sign-up"}
              </button>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onSignOut}
          className="block mx-auto mt-3 text-[13px] text-slate-500 bg-transparent border-none cursor-pointer font-semibold"
        >
          Sign out
        </button>
      </form>
    </CenteredScreen>
  );
}
