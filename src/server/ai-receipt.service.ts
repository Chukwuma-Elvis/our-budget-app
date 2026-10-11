import { listCategories, type CategoryDto } from "./categories.service";
import { parseAmount } from "@/lib/money";
import { isDateString } from "@/lib/dates";
import { AppError, badRequest } from "@/lib/errors";

export type ParsedReceiptItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  included: boolean;
};

export type ParsedReceiptResult = {
  merchant: string | null;
  date: string | null;
  currency: string;
  total: string | null;
  items: ParsedReceiptItem[];
};

export function cleanBase64(input: string): string {
  return input.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, "").trim();
}

export function extractJsonFromAiResponse(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1].trim();
  return trimmed;
}

export function sanitizeReceiptItems(
  rawItems: unknown[],
  categories: CategoryDto[],
): ParsedReceiptItem[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase().trim(), c]));

  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .map((item, idx): ParsedReceiptItem | null => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Record<string, unknown>;

      const name = typeof rec.name === "string" && rec.name.trim() ? rec.name.trim() : `Item ${idx + 1}`;
      const rawQty = Number(rec.quantity);
      const quantity = !isNaN(rawQty) && rawQty > 0 ? (Number.isInteger(rawQty) ? rawQty : Number(rawQty.toFixed(2))) : 1;

      // Extract raw price strings
      const rawTotalStr = rec.totalPrice != null ? String(rec.totalPrice) : "";
      const rawUnitStr = rec.unitPrice != null ? String(rec.unitPrice) : "";

      let parsedTotal = parseAmount(rawTotalStr);
      let parsedUnit = parseAmount(rawUnitStr);

      if (parsedTotal === null && parsedUnit !== null) {
        parsedTotal = (Number(parsedUnit) * quantity).toFixed(2);
      } else if (parsedTotal !== null && parsedUnit === null) {
        parsedUnit = (Number(parsedTotal) / quantity).toFixed(2);
      } else if (parsedTotal === null && parsedUnit === null) {
        parsedTotal = "0.00";
        parsedUnit = "0.00";
      }

      // Match category
      let suggestedCategoryId: string | null = null;
      let suggestedCategoryName: string | null = null;

      const rawCat = rec.suggestedCategoryId ?? rec.category ?? rec.suggestedCategory;
      if (typeof rawCat === "string" && rawCat.trim()) {
        const catTrimmed = rawCat.trim();
        if (categoryById.has(catTrimmed)) {
          const matched = categoryById.get(catTrimmed)!;
          suggestedCategoryId = matched.id;
          suggestedCategoryName = matched.name;
        } else if (categoryByName.has(catTrimmed.toLowerCase())) {
          const matched = categoryByName.get(catTrimmed.toLowerCase())!;
          suggestedCategoryId = matched.id;
          suggestedCategoryName = matched.name;
        }
      }

      // If no category matched yet, check if item name contains category name keywords
      if (!suggestedCategoryId) {
        const lowerName = name.toLowerCase();
        for (const cat of categories) {
          const catLower = cat.name.toLowerCase();
          // Avoid matching very generic words like "and"
          if (catLower.length >= 4 && lowerName.includes(catLower)) {
            suggestedCategoryId = cat.id;
            suggestedCategoryName = cat.name;
            break;
          }
        }
      }

      // Default to first active category if available
      if (!suggestedCategoryId && categories.length > 0) {
        suggestedCategoryId = categories[0].id;
        suggestedCategoryName = categories[0].name;
      }

      return {
        id: `rcpt_item_${idx + 1}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        quantity,
        unitPrice: parsedUnit ?? "0.00",
        totalPrice: parsedTotal ?? "0.00",
        suggestedCategoryId,
        suggestedCategoryName,
        included: true,
      };
    })
    .filter((i): i is ParsedReceiptItem => i !== null);
}

export function parseReceiptResponse(rawText: string, categories: CategoryDto[]): ParsedReceiptResult {
  const jsonStr = extractJsonFromAiResponse(rawText);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    throw badRequest("Could not parse receipt contents. Please try with a clearer photo.");
  }

  const merchant =
    typeof parsed.merchant === "string" && parsed.merchant.trim() ? parsed.merchant.trim() : null;

  let date: string | null = null;
  if (typeof parsed.date === "string" && isDateString(parsed.date.trim())) {
    date = parsed.date.trim();
  }

  let total: string | null = null;
  if (parsed.total != null) {
    total = parseAmount(String(parsed.total));
  }

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const items = sanitizeReceiptItems(rawItems, categories);

  return {
    merchant,
    date,
    currency: "NGN",
    total,
    items,
  };
}

function buildPrompt(categories: CategoryDto[]): string {
  const categoryListing =
    categories.length > 0
      ? categories.map((c) => `- Category ID: "${c.id}" | Name: "${c.name}"`).join("\n")
      : "No categories currently defined.";

  return `You are an expert Nigerian shopping receipt parser for a household budget app.
Analyze this receipt image and accurately extract all purchased items.

Available household budget categories:
${categoryListing}

Rules:
1. Merchant/Store: Extract the business/supermarket/store name (e.g. "Shoprite", "Justrite", "Spar", "Prince Ebeano", "Local Store"). If not visible, return null.
2. Transaction Date: Extract the receipt date in YYYY-MM-DD format (e.g. "2026-10-11"). If missing, unclear, or invalid, return null.
3. Currency: Nigerian receipts are in Naira (₦ / NGN). Clean all prices to numeric values (strip '₦', 'NGN', commas, letters).
4. Items: Extract each line item bought:
   - "name": Concise, clean item description.
   - "quantity": Number of units bought as a positive number (default to 1 if not stated).
   - "unitPrice": Price per single unit in Naira (e.g. 1500 or "1500"). If not explicitly printed, compute: totalPrice / quantity.
   - "totalPrice": Total line price in Naira (e.g. 3000 or "3000.00").
   - "suggestedCategoryId": Select the single BEST matching Category ID from the available household categories listed above. If none match well, set to null.
5. Overall Total: Extract the printed receipt grand total if present, else null.
6. Ignore subtotal, tax/VAT, card payment slip details, change due, or cashier details as separate items.

Return STRICTLY a JSON object matching this schema without any markdown commentary:
{
  "merchant": "string or null",
  "date": "YYYY-MM-DD or null",
  "currency": "NGN",
  "total": "number or string or null",
  "items": [
    {
      "name": "string",
      "quantity": 1,
      "unitPrice": 1500,
      "totalPrice": 1500,
      "suggestedCategoryId": "string or null"
    }
  ]
}`;
}

async function callGemini(
  apiKey: string,
  model: string,
  base64Data: string,
  mimeType: string,
  prompt: string,
): Promise<string> {
  const cleanKey = apiKey.trim().replace(/^["']|["']$/g, "");
  const normalizedMime = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": cleanKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: normalizedMime,
                data: base64Data,
              },
            },
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let parsedMessage = errorBody;
    try {
      const errJson = JSON.parse(errorBody) as { error?: { message?: string } };
      if (errJson?.error?.message) {
        parsedMessage = errJson.error.message;
      }
    } catch {
      // retain errorBody
    }
    throw new Error(`Gemini (${model}) ${response.status}: ${parsedMessage}`);
  }

  const json = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const candidateText = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!candidateText) {
    throw new Error(`Gemini (${model}) returned an empty response`);
  }

  return candidateText;
}

async function callOpenAi(
  apiKey: string,
  base64Data: string,
  mimeType: string,
  prompt: string,
): Promise<string> {
  const cleanKey = apiKey.trim().replace(/^["']|["']$/g, "");
  const normalizedMime = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cleanKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${normalizedMime};base64,${base64Data}`,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let parsedMessage = errorBody;
    try {
      const errJson = JSON.parse(errorBody) as { error?: { message?: string } };
      if (errJson?.error?.message) {
        parsedMessage = errJson.error.message;
      }
    } catch {
      // retain errorBody
    }
    throw new Error(`OpenAI ${response.status}: ${parsedMessage}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const text = json.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI returned an empty response");
  }

  return text;
}

async function callGroq(
  apiKey: string,
  model: string,
  base64Data: string,
  mimeType: string,
  prompt: string,
  useJsonFormat = true,
): Promise<string> {
  const cleanKey = apiKey.trim().replace(/^["']|["']$/g, "");
  const normalizedMime = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  const payload: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:${normalizedMime};base64,${base64Data}`,
            },
          },
        ],
      },
    ],
    max_tokens: 800,
    temperature: 0.1,
  };
  if (useJsonFormat) {
    payload.response_format = { type: "json_object" };
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cleanKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let parsedMessage = errorBody;
    try {
      const errJson = JSON.parse(errorBody) as { error?: { message?: string } };
      if (errJson?.error?.message) {
        parsedMessage = errJson.error.message;
      }
    } catch {
      // retain errorBody
    }

    if (useJsonFormat && /response_format|json/i.test(parsedMessage)) {
      return callGroq(apiKey, model, base64Data, mimeType, prompt, false);
    }

    throw new Error(`Groq (${model}) ${response.status}: ${parsedMessage}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const text = json.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(`Groq (${model}) returned an empty response`);
  }

  return text;
}

async function getGroqVisionModels(apiKey: string): Promise<string[]> {
  const cleanKey = apiKey.trim().replace(/^["']|["']$/g, "");
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${cleanKey}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: Array<{ id: string; active?: boolean }> };
      if (Array.isArray(json.data)) {
        const found = json.data
          .filter((m) => m.active !== false)
          .map((m) => m.id)
          .filter(
            (id) =>
              /qwen.*vision|qwen3\.8|vision/i.test(id) &&
              !/decommissioned|deprecated|llama-3\.2.*vision/i.test(id),
          );
        if (found.length > 0) return found;
      }
    }
  } catch (err) {
    console.warn("Could not query Groq models API:", err);
  }
  return ["qwen/qwen3.8-27b"];
}

export async function scanReceipt(
  accountId: string,
  imageBase64: string,
  mimeType: string,
): Promise<ParsedReceiptResult> {
  const categories = await listCategories(accountId, false);
  const base64Data = cleanBase64(imageBase64);

  if (!base64Data) {
    throw badRequest("No image data provided");
  }

  const rawGroqKey = process.env.GROQ_API_KEY;
  const rawGeminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const rawOpenaiKey = process.env.OPENAI_API_KEY;

  const groqKey = rawGroqKey ? rawGroqKey.trim().replace(/^["']|["']$/g, "") : null;
  const geminiKey = rawGeminiKey ? rawGeminiKey.trim().replace(/^["']|["']$/g, "") : null;
  const openaiKey = rawOpenaiKey ? rawOpenaiKey.trim().replace(/^["']|["']$/g, "") : null;

  if (!groqKey && !geminiKey && !openaiKey) {
    throw new AppError(
      503,
      "ai_not_configured",
      "Receipt scanning requires an AI key. Please add GROQ_API_KEY or GEMINI_API_KEY to your environment variables.",
    );
  }

  const prompt = buildPrompt(categories);
  let rawAiText: string | null = null;
  let lastError: Error | null = null;

  if (groqKey) {
    const groqModels = await getGroqVisionModels(groqKey);
    for (const model of groqModels) {
      try {
        rawAiText = await callGroq(groqKey, model, base64Data, mimeType, prompt);
        if (rawAiText) break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`Groq model ${model} failed:`, lastError.message);
      }
    }
  }

  if (!rawAiText && geminiKey) {
    const models = ["gemini-2.0-flash", "gemini-1.5-flash"];
    for (const model of models) {
      try {
        rawAiText = await callGemini(geminiKey, model, base64Data, mimeType, prompt);
        if (rawAiText) break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`Gemini model ${model} failed:`, lastError.message);
      }
    }
  }

  if (!rawAiText && openaiKey) {
    try {
      rawAiText = await callOpenAi(openaiKey, base64Data, mimeType, prompt);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn("OpenAI fallback failed:", lastError.message);
    }
  }

  if (!rawAiText) {
    const detailMsg = lastError?.message ? ` (${lastError.message})` : "";
    console.error("AI receipt scan error:", lastError);
    throw badRequest(
      `Could not analyze the receipt with AI${detailMsg}. Please check your API key configuration.`,
    );
  }

  return parseReceiptResponse(rawAiText, categories);
}
