import { z } from 'zod';

const envSchema = z.object({
  WHATSAPP_TOKEN: z.string(),
  WHATSAPP_PHONE_NUMBER_ID: z.string(),
});

function getConfig() {
  return envSchema.parse({
    WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  });
}

const GRAPH_API_URL = 'https://graph.facebook.com/v18.0';

export async function sendWhatsAppMessage(to: string, body: string) {
  const config = getConfig();

  const response = await fetch(
    `${GRAPH_API_URL}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WhatsApp API error: ${error}`);
  }

  return response.json();
}

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  parameters: string[],
) {
  const config = getConfig();

  const response = await fetch(
    `${GRAPH_API_URL}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'he' },
          components: [
            {
              type: 'body',
              parameters: parameters.map((p) => ({ type: 'text', text: p })),
            },
          ],
        },
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`WhatsApp API error: ${error}`);
  }

  return response.json();
}
