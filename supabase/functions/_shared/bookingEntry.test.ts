import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { bookingEntryInteractive } from "./bookingEntry.ts";

Deno.test("booking invitation exposes booking, help and identity buttons within Meta limits", () => {
  const message = bookingEntryInteractive(" Taylor ");
  assertEquals(message.type, "button");
  assertStringIncludes(message.body.text, "Hi Taylor 🐾");
  assertStringIncludes(message.body.text, "your dog or dogs here in WhatsApp");
  assertEquals(message.action.buttons.map((button) => button.reply), [
    { id: "bookentry:start", title: "Book my dogs" },
    { id: "bookentry:help", title: "I need help" },
    { id: "bookentry:notme", title: "Not me" },
  ]);
  assertEquals(message.action.buttons.every((button) => button.reply.title.length <= 20), true);
  assertStringIncludes(bookingEntryInteractive(" ").body.text, "Hi there 🐾");
});
