import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TemplatePicker } from "./TemplatePicker.jsx";
import { buildTemplateParams } from "../../../../constants/whatsappTemplates.js";

describe("TemplatePicker customer enquiry response", () => {
  it("requires a topic and reply, previews the approved wording and supplies ordered send parameters", async () => {
    const outgoing = [];
    render(
      <TemplatePicker
        customerFirstName="Alex"
        contextKey="customer-1"
        onSend={async (template, values) => {
          outgoing.push({
            name: template.name,
            language: template.language,
            params: buildTemplateParams(template, values),
          });
        }}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Template" }), {
      target: { value: "customer_enquiry_response_v1" },
    });
    expect(screen.getByLabelText("Customer first name")).toHaveValue("Alex");
    expect(screen.getByRole("button", { name: /Send template/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Enquiry topic"), {
      target: { value: "your grooming enquiry" },
    });
    expect(screen.getByRole("button", { name: /Send template/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reply"), {
      target: { value: "We can offer Tuesday at 11am. Would that suit you?" },
    });

    expect(screen.getByLabelText("Template preview").textContent).toBe(
      "Hi Alex, thank you for your message about your grooming enquiry. We can offer Tuesday at 11am. Would that suit you?\nThanks 🎓🐶❤️ X",
    );
    fireEvent.click(screen.getByRole("button", { name: "Send template" }));
    await waitFor(() => expect(screen.getByText(/Template sent/)).toBeInTheDocument());
    expect(outgoing).toEqual([{
      name: "customer_enquiry_response_v1",
      language: "en_GB",
      params: ["Alex", "your grooming enquiry", "We can offer Tuesday at 11am. Would that suit you?"],
    }]);
  });
});
