import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  mealType: z.string().min(1).max(40),
  craving: z.string().max(200).optional().default(""),
  servings: z.number().int().min(1).max(12).default(2),
});

export type MealSuggestion = {
  dish: string;
  description: string;
  ingredients: Array<{ name: string; quantity: string }>;
};

export const suggestMeal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<MealSuggestion> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const prompt = `Suggest a specific ${data.mealType.toLowerCase()} for ${data.servings} people.${
      data.craving ? ` The user is craving: "${data.craving}".` : ""
    } Return concise everyday supermarket ingredients (5-10 items). Use common product names a grocery store would carry (e.g. "milk", "eggs", "pasta", "olive oil", "tomatoes", "chicken breast", "oat milk", "bread", "coffee", "diapers"). Avoid brands.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a helpful grocery meal planner. Always respond with a single tool call." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_meal",
              description: "Return the suggested meal and grocery ingredients",
              parameters: {
                type: "object",
                properties: {
                  dish: { type: "string" },
                  description: { type: "string" },
                  ingredients: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        quantity: { type: "string" },
                      },
                      required: ["name", "quantity"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["dish", "description", "ingredients"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_meal" } },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) throw new Error("AI is busy right now, please try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Please top up your workspace.");
      throw new Error(`AI request failed [${res.status}]: ${body}`);
    }

    const json = await res.json();
    const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI returned no suggestion");
    const parsed = JSON.parse(toolCall.function.arguments);
    return parsed as MealSuggestion;
  });
