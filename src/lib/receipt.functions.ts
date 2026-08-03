import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  // data URL: data:image/jpeg;base64,....
  imageDataUrl: z.string().min(50).max(8_000_000),
});

export type ReceiptLine = { name: string; price_cents: number; quantity: number };
export type ReceiptScan = {
  store: string | null;
  purchased_on: string | null;
  currency: string;
  lines: ReceiptLine[];
};

export const scanReceipt = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<ReceiptScan> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You read European supermarket receipts. Extract the retailer chain, purchase date and every product line with its final paid price. Ignore totals, VAT lines, deposits and discounts rows. Always answer with the tool call.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the receipt items. Prices in cents (integer). Use plain generic product names in English where obvious." },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_receipt",
              description: "Structured receipt content",
              parameters: {
                type: "object",
                properties: {
                  store: { type: "string", description: "Retailer chain name, e.g. Lidl" },
                  purchased_on: { type: "string", description: "ISO date YYYY-MM-DD if visible" },
                  currency: { type: "string" },
                  lines: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        price_cents: { type: "number" },
                        quantity: { type: "number" },
                      },
                      required: ["name", "price_cents", "quantity"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["store", "purchased_on", "currency", "lines"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_receipt" } },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) throw new Error("AI is busy right now, please try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Please top up your workspace.");
      throw new Error(`Receipt scan failed [${res.status}]: ${body}`);
    }

    const json = await res.json();
    const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("Could not read that receipt — try a sharper photo.");
    const parsed = JSON.parse(toolCall.function.arguments) as ReceiptScan;
    return {
      store: parsed.store || null,
      purchased_on: parsed.purchased_on || null,
      currency: parsed.currency || "EUR",
      lines: (parsed.lines ?? [])
        .filter((l) => l && l.name && Number.isFinite(l.price_cents) && l.price_cents > 0)
        .map((l) => ({
          name: String(l.name).slice(0, 80),
          price_cents: Math.round(l.price_cents),
          quantity: Math.max(1, Math.round(l.quantity || 1)),
        }))
        .slice(0, 60),
    };
  });
