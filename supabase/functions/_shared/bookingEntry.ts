/** Customer-initiated booking invitation; IDs also support older messages. */
export function bookingEntryInteractive(name: string) {
  const greeting = name.trim() ? `Hi ${name.trim()} 🐾` : "Hi there 🐾";
  return {
    type: "button",
    body: {
      text: `${greeting} You can book your dog or dogs here in WhatsApp. Choose an option below to get started.`,
    },
    action: {
      buttons: [
        { type: "reply", reply: { id: "bookentry:start", title: "Book my dogs" } },
        { type: "reply", reply: { id: "bookentry:help", title: "I need help" } },
        { type: "reply", reply: { id: "bookentry:notme", title: "Not me" } },
      ],
    },
  };
}
