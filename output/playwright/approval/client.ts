const channel = { on: () => channel, subscribe: () => channel };
export const supabase = { channel: () => channel, removeChannel: () => {} };
