/** Provider calls are isolated here; tests inject fetch and never contact a recipient. */
export interface DeliveryMessage {
  id: string;
  channel: string;
  provider: string;
  recipient: string;
  template: string;
  subject: string | null;
  body: string;
  variables: unknown;
}
export class DeliveryError extends Error {
  constructor(
    message: string,
    readonly uncertain = false,
  ) {
    super(message);
  }
}
export async function deliverMessage(
  row: DeliveryMessage,
  env: NodeJS.ProcessEnv = process.env,
  transport: typeof fetch = fetch,
): Promise<string> {
  let url: string;
  let payload: unknown;
  let headers: Record<string, string>;
  if (row.channel === "email" && row.provider === "resend") {
    if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL_FROM)
      throw new DeliveryError(
        "Set RESEND_API_KEY and NOTIFY_EMAIL_FROM to enable email delivery.",
      );
    url = "https://api.resend.com/emails";
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Idempotency-Key": `outbox/${row.id}`,
    };
    payload = {
      from: env.NOTIFY_EMAIL_FROM,
      to: [row.recipient],
      subject: row.subject ?? "Manufacturing sourcing update",
      text: row.body,
    };
  } else if (row.channel === "whatsapp" && row.provider === "whatsapp_cloud") {
    if (
      !env.WHATSAPP_ACCESS_TOKEN ||
      !/^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID ?? "") ||
      !/^v\d+\.\d+$/.test(env.WHATSAPP_GRAPH_VERSION ?? "")
    ) {
      throw new DeliveryError(
        "Configure WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_GRAPH_VERSION.",
      );
    }
    let templates: Record<
      string,
      { name: string; language: string; bodyVariables?: string[] }
    >;
    try {
      templates = JSON.parse(env.WHATSAPP_TEMPLATES_JSON ?? "{}");
    } catch {
      throw new DeliveryError("WHATSAPP_TEMPLATES_JSON is invalid JSON.");
    }
    const template = templates[row.template];
    if (!template?.name || !template.language)
      throw new DeliveryError(
        `Configure an approved WhatsApp template for ${row.template}.`,
      );
    const variables = row.variables as Record<string, unknown>;
    const parameters = (template.bodyVariables ?? []).map((key) => {
      if (variables[key] === undefined || variables[key] === null)
        throw new DeliveryError(`Missing WhatsApp template variable: ${key}`);
      return { type: "text", text: String(variables[key]) };
    });
    url = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
    };
    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: row.recipient.replace(/^\+/, ""),
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        ...(parameters.length
          ? { components: [{ type: "body", parameters }] }
          : {}),
      },
    };
  } else
    throw new DeliveryError(
      `Unsupported delivery provider ${row.provider} for ${row.channel}.`,
    );
  let response: Response;
  try {
    response = await transport(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new DeliveryError(
      "Provider response was not received. Verify delivery before retrying.",
      true,
    );
  }
  if (!response.ok)
    throw new DeliveryError(
      `Provider returned HTTP ${response.status}.`,
      response.status >= 500,
    );
  let result: { id?: string; messages?: { id?: string }[] };
  try {
    result = (await response.json()) as typeof result;
  } catch {
    throw new DeliveryError(
      "Provider returned an unreadable receipt. Verify delivery before retrying.",
      true,
    );
  }
  const messageId = result.id ?? result.messages?.[0]?.id;
  if (!messageId)
    throw new DeliveryError(
      "Provider accepted the request without a message receipt. Verify delivery before retrying.",
      true,
    );
  return messageId;
}
