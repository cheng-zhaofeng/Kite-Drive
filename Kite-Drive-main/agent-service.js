require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const { decideParkingWithScenarios } = require('./agent');
const { pay } = require('./pay');
const { askLLM } = require('./llm');

const app = express();
app.use(cors());
app.use(express.json());

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf-8'));
}

app.post('/reserve', async (req, res) => {
  try {
    const { scenarioId = "MEETING_URGENT" } = req.body ?? {};

    const scenarios = readJson('data/scenarios.json');
    const scenario = scenarios.find(s => s.id === scenarioId) || scenarios[0];

    const spots = readJson('data/parking_spots.json');

    const agentResult = decideParkingWithScenarios({ scenario, spots });

    // 即使失败也返回候选，方便前端展示“为什么不行”
    if (!agentResult.ok) {
      return res.status(400).json({
        ok: false,
        scenario,
        agent: agentResult
      });
    }

    // 让 LLM 输出更“可展示”的解释（失败就降级）
    let llm = null;
    let selectedId = agentResult.decision.id;

    try {
      llm = await askLLM({
        scenario,
        candidates: agentResult.candidatesForLLM
      });
      if (llm?.selectedId) selectedId = llm.selectedId;
    } catch (e) {
      llm = { error: String(e?.message ?? e), note: "LLM failed, fallback to rule-based selection" };
    }

    const chosen = agentResult.candidatesForLLM.find(x => x.id === selectedId) || agentResult.candidatesForLLM[0];

    // demo 支付金额先固定小额，保证稳定（后面再映射成 USDC / 按成本换算）
    const payment = await pay({
      to: spots.find(s => s.id === chosen.id)?.providerAddress ?? agentResult.decision.providerAddress,
      amountKite: 0.0001
    });

    return res.json({
      ok: true,
      scenario,
      agent: {
        thoughts: agentResult.thoughts,
        ruleDecision: agentResult.decision
      },
      llm,
      chosen,
      payment,
      explorer: `https://testnet.kitescan.ai/tx/${payment.txHash}`
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
  }
});

app.listen(3001, () => {
  console.log('Agent service listening on http://localhost:3001');
});
