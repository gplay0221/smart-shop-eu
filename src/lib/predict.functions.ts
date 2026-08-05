import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  product: z.string().min(1).max(120),
  category: z.string().max(60).optional().default(""),
  unit: z.string().max(40).optional().default(""),
  currentCents: z.number().int().min(1).max(10_000_000),
  currency: z.string().max(5).optional().default("EUR"),
  country: z.string().max(60).optional().default("the European Union"),
  city: z.string().max(80).optional().default(""),
  recentCents: z.array(z.number().int()).max(40).optional().default([]),
});

export type PriceDriver = {
  factor: string;
  impact: "up" | "down" | "neutral";
  weight: number;
  note: string;
};

export type PricePrediction = {
  direction: "up" | "down" | "stable";
  predicted_cents_30d: number;
  predicted_cents_90d: number;
  change_pct_30d: number;
  confidence: number;
  buy_advice: "buy_now" | "wait" | "stock_up";
  summary: string;
  drivers: PriceDriver[];
};

export const predictPrice = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<PricePrediction> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured");

    const spread =
      data.recentCents.length > 1
        ? ` Recent observed prices in cents: ${data.recentCents.join(", ")}.`
        : "";

    const prompt = `Forecast the retail supermarket price of "${data.product}"${
      data.category ? ` (category: ${data.category})` : ""
    }${data.unit ? `, sold as ${data.unit}` : ""} in ${data.city ? `${data.city}, ` : ""}${data.country}.
Today's shelf price is ${(data.currentCents / 100).toFixed(2)} ${data.currency}.${spread}
Reason explicitly about: recent food-inflation trends in the EU, energy and diesel/fuel costs affecting logistics, fertiliser and feed costs, geopolitical events and trade or export restrictions affecting this commodity, currency effects, weather/harvest seasonality, and retailer discount cycles.
Give a realistic 30-day and 90-day price point in cents (small moves are normal — usually within ±15%), a confidence 0-1, and 3-5 concrete drivers. Be specific and avoid generic filler.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a grocery commodity price analyst covering European supermarket retail. Always answer with the tool call, never plain text.",
          },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_forecast",
              description: "Structured supermarket price forecast",
              parameters: {
                type: "object",
                properties: {
                  direction: { type: "string", enum: ["up", "down", "stable"] },
                  predicted_cents_30d: { type: "number" },
                  predicted_cents_90d: { type: "number" },
                  change_pct_30d: { type: "number" },
                  confidence: { type: "number" },
                  buy_advice: { type: "string", enum: ["buy_now", "wait", "stock_up"] },
                  summary: { type: "string" },
                  drivers: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        factor: { type: "string" },
                        impact: { type: "string", enum: ["up", "down", "neutral"] },
                        weight: { type: "number" },
                        note: { type: "string" },
                      },
                      required: ["factor", "impact", "weight", "note"],
                      additionalProperties: false,
                    },
                  },
                },
                required: [
                  "direction",
                  "predicted_cents_30d",
                  "predicted_cents_90d",
                  "change_pct_30d",
                  "confidence",
                  "buy_advice",
                  "summary",
                  "drivers",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_forecast" } },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) throw new Error("AI is busy right now, please try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Please top up your workspace.");
      throw new Error(`Forecast failed [${res.status}]: ${body}`);
    }

    const json = await res.json();
    const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No forecast returned");
    const p = JSON.parse(toolCall.function.arguments) as PricePrediction;

    const clamp = (v: number) =>
      Math.max(1, Math.round(Math.min(data.currentCents * 2.5, Math.max(data.currentCents * 0.4, v))));

    return {
      direction: p.direction ?? "stable",
      predicted_cents_30d: clamp(Number(p.predicted_cents_30d) || data.currentCents),
      predicted_cents_90d: clamp(Number(p.predicted_cents_90d) || data.currentCents),
      change_pct_30d: Number.isFinite(p.change_pct_30d) ? Number(p.change_pct_30d) : 0,
      confidence: Math.min(1, Math.max(0, Number(p.confidence) || 0.5)),
      buy_advice: p.buy_advice ?? "buy_now",
      summary: String(p.summary ?? "").slice(0, 400),
      drivers: (p.drivers ?? []).slice(0, 6).map((d) => ({
        factor: String(d.factor).slice(0, 60),
        impact: d.impact === "up" || d.impact === "down" ? d.impact : "neutral",
        weight: Math.min(1, Math.max(0, Number(d.weight) || 0.3)),
        note: String(d.note).slice(0, 200),
      })),
    };
  });
