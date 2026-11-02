// src/components/views/settings/TeamSettings.jsx
//
// Owners only: invite a new member of staff, and see who is on the team.
//
// An invite emails the new person a link where they choose their own password;
// nobody here ever sees or sets it. The `staff-invite` Edge Function is the
// real gate (it re-checks that the caller is an owner), so hiding this tab
// from staff is a convenience, not the security boundary.
import { useState } from "react";
import { Card, CardHead, CardBody, ReadOnlyNotice, isValidEmail } from "./shared.jsx";
import { Badge, Button, Field, Input, InlineError, Select } from "../../ui";
import { ConfirmDialog } from "../../shared/ConfirmDialog.jsx";
import { isTeamBackendAvailable, useStaffTeam } from "../../../supabase/hooks/useStaffTeam";

const MAX_NAME = 60;

export function TeamSettings({ staffProfile }) {
  const isOwner = staffProfile?.role === "owner";
  const available = isTeamBackendAvailable();
  const team = useStaffTeam(isOwner && available);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("staff");
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmOwner, setConfirmOwner] = useState(false);

  if (!isOwner) {
    return (
      <Card>
        <CardHead title="Team" />
        <CardBody>
          <ReadOnlyNotice>Only an owner can add staff. Please ask an owner.</ReadOnlyNotice>
        </CardBody>
      </Card>
    );
  }

  const validate = () => {
    const next = {};
    if (!name.trim()) next.name = "Enter their name";
    else if (name.trim().length > MAX_NAME) next.name = `Keep the name to ${MAX_NAME} characters or fewer`;
    if (!email.trim()) next.email = "Enter their email address";
    else if (!isValidEmail(email)) next.email = "That email doesn't look right";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const send = async () => {
    setConfirmOwner(false);
    setSending(true);
    setSubmitError("");
    setNotice("");
    const invitedEmail = email.trim();
    const result = await team.invite({
      email: invitedEmail,
      displayName: name.trim(),
      role,
    });
    setSending(false);
    if (!result.ok) {
      setSubmitError(result.message);
      return;
    }
    setNotice(`Invite sent to ${invitedEmail}. They'll get an email to choose a password.`);
    setName("");
    setEmail("");
    setRole("staff");
    setErrors({});
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (sending || !validate()) return;
    // Owners can change salon settings and add or change other staff, so
    // granting it always takes a second, deliberate confirmation.
    if (role === "owner") {
      setConfirmOwner(true);
      return;
    }
    void send();
  };

  return (
    <>
      <Card>
        <CardHead title="Add a team member" desc="They'll get an email to choose their own password." />
        <CardBody>
          {!available ? (
            <ReadOnlyNotice>Adding staff isn't available with sample data.</ReadOnlyNotice>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-3">
                <Field label="Name" error={errors.name}>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="off"
                    maxLength={MAX_NAME + 20}
                  />
                </Field>
                <Field label="Email address" error={errors.email}>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="off"
                    inputMode="email"
                  />
                </Field>
              </div>

              <div className="mb-3 md:max-w-xs">
                <Field
                  label="Role"
                  hint={
                    role === "owner"
                      ? "Owners can change salon settings and add or change other staff."
                      : "Staff can use the dashboard but can't change salon settings."
                  }
                >
                  <Select value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="staff">Staff</option>
                    <option value="owner">Owner</option>
                  </Select>
                </Field>
              </div>

              <InlineError message={submitError} />
              {notice && (
                <div
                  role="status"
                  className="mt-2 mb-3 rounded-lg border border-brand-green-200 bg-brand-green-100 px-3 py-2 text-body font-semibold text-brand-green-800"
                >
                  {notice}
                </div>
              )}

              <div className="mt-3">
                <Button type="submit" loading={sending} disabled={sending}>
                  {sending ? "Sending…" : "Send invite"}
                </Button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHead title="Current team" />
        <CardBody>
          {team.loadError ? (
            <>
              <InlineError message={team.loadError} />
              <div className="mt-3">
                <Button variant="ghost" onClick={team.reload}>Try again</Button>
              </div>
            </>
          ) : team.members === null ? (
            <div className="text-body text-slate-500" role="status">
              {available ? "Loading the team…" : "The team list isn't available with sample data."}
            </div>
          ) : team.members.length === 0 ? (
            <div className="text-body text-slate-500">No one yet.</div>
          ) : (
            <ul className="list-none m-0 p-0 divide-y divide-slate-100">
              {team.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-body font-semibold text-slate-800 min-w-0 truncate">
                    {m.displayName || "Unnamed"}
                    {m.id === staffProfile?.id && (
                      <span className="ml-1.5 text-caption font-medium text-slate-400">You</span>
                    )}
                  </span>
                  <Badge tone={m.role === "owner" ? "brand" : "neutral"}>
                    {m.role === "owner" ? "Owner" : "Staff"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {confirmOwner && (
        <ConfirmDialog
          title={`Make ${name.trim() || "them"} an owner?`}
          message="Owners can change salon settings and add or change other staff. Only choose this for someone you fully trust."
          confirmLabel="Make owner"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={() => void send()}
          onCancel={() => setConfirmOwner(false)}
        />
      )}
    </>
  );
}
