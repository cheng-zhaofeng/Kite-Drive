const path = require('path');

const { decideParkingWithScenarios } = require(path.join(__dirname, '..', 'Kite-Drive-main', 'agent'));
const { pay } = require(path.join(__dirname, '..', 'Kite-Drive-main', 'pay'));
const { askLLM } = require(path.join(__dirname, '..', 'Kite-Drive-main', 'llm'));
const fs = require('fs');

function readJson(relPath) {
  const fullPath = path.join(__dirname, '..', 'Kite-Drive-main', relPath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }));
    return;
  }

  let scenario = null;
  let agentResult = null;
  let llm = null;
  let chosen = null;

  try {
    const body = typeof req.body === 'string'
      ? JSON.parse(req.body || '{}')
      : (req.body || {});

    const { scenarioId = 'MEETING_URGENT' } = body;

    const scenarios = readJson('data/scenarios.json');
    scenario = scenarios.find(s => s.id === scenarioId) || scenarios[0];

    const spots = readJson('data/parking_spots.json');
    agentResult = decideParkingWithScenarios({ scenario, spots });

    if (!agentResult.ok) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, scenario, agent: agentResult }));
      return;
    }

    let selectedId = agentResult.decision.id;

    try {
      llm = await askLLM({
        scenario,
        candidates: agentResult.candidatesForLLM
      });
      if (llm?.selectedId) selectedId = llm.selectedId;
    } catch (e) {
      llm = { error: String(e?.message ?? e), note: 'LLM failed, fallback to rule-based selection' };
    }

    chosen =
      agentResult.candidatesForLLM.find(x => x.id === selectedId) || agentResult.candidatesForLLM[0];

    let payment = null;
    try {
      payment = await pay({
        to: spots.find(s => s.id === chosen.id)?.providerAddress ?? agentResult.decision.providerAddress,
        amountKite: 0.0001
      });
    } catch (e) {
      payment = {
        error: String(e?.message ?? e),
        status: 'failed'
      };
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      ok: true,
      scenario,
      agent: {
        thoughts: agentResult.thoughts,
        ruleDecision: agentResult.decision
      },
      llm,
      chosen,
      payment,
      explorer: payment?.txHash ? `https://testnet.kitescan.ai/tx/${payment.txHash}` : null
    }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      ok: false,
      error: String(e?.message ?? e),
      scenario,
      agent: agentResult,
      llm,
      chosen
    }));
  }
};
