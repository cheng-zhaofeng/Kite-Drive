require('dotenv').config();

const API_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const MODEL_NAME = "deepseek-v3";

async function askLLM({ scenario, candidates }) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("Missing DASHSCOPE_API_KEY in .env");

  const system = `
You are a vehicle operations agent. 
Return ONLY valid JSON with fields:
{
  "selectedId": string,
  "summary": string,
  "reasons": string[],
  "comparison": [
    {"id": string, "etaMin": number, "queueMin": number, "totalCostUsd": number, "notes": string}
  ]
}
Keep reasons concise and demo-friendly. Do NOT include chain-of-thought.
`.trim();

  const user = {
    scenario,
    candidates
  };

  const resp = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) }
      ],
      temperature: 0.2
    })
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`LLM HTTP ${resp.status}: ${txt}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned empty content");

  // 解析 JSON（有些模型会包裹 ```json，我们做个简单清理）
  const cleaned = content.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

module.exports = { askLLM };
