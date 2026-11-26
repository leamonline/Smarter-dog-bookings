export function createInternalInvoker({
  supabaseUrl,
  serviceRoleKey,
  internalSecret,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  internalSecret: string;
}) {
  return async function invokeInternal(
    fn: string,
    payload: unknown,
  ): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
    const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": internalSecret,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(payload),
    });
    let body: Record<string, unknown> = {};
    try {
      body = await res.json();
    } catch {
      /* non-JSON */
    }
    return { ok: res.ok, status: res.status, body };
  };
}
