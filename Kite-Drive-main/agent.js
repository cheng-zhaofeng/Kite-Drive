function travelTimeMin(from, to) {
  // demo 用“手写时间矩阵”最稳定（不用外部地图 API）
  const T = {
    "A": { "A": 0,  "B": 18, "C": 45, "D": 12, "E": 22 },
    "B": { "A": 18, "B": 0,  "C": 35, "D": 20, "E": 30 },
    "C": { "A": 45, "B": 35, "C": 0,  "D": 40, "E": 55 },
    "D": { "A": 12, "B": 20, "C": 40, "D": 0,  "E": 25 },
    "E": { "A": 22, "B": 30, "C": 55, "D": 25, "E": 0  }
  };
  return (T[from] && T[from][to] != null) ? T[from][to] : 999;
}

function decideParkingWithScenarios({ scenario, spots }) {
  const thoughts = [];
  const addThought = (msg) => thoughts.push(msg);

  // 1) 白名单
  let candidates = spots.filter(s => s.kiteCertified);
  const stats = {
    totalSpots: spots.length,
    kiteCertifiedCount: candidates.length,
    deadlineMin: scenario.deadlineMin
  };
  addThought("我先筛掉不可信的停车场，只保留通过 Kite 认证的候选。");
  addThought("接下来我会对这些候选做更细致的可达性与体验评估。");

  if (scenario.needCharging) {
    const before = candidates.length;
    candidates = candidates.filter(s => s.hasCharging);
    stats.chargingFilteredCount = candidates.length;
    addThought("你的车需要充电，所以我只保留带充电桩的车位。");
    if (candidates.length === 0) {
      return { ok: false, thoughts, reason: "No charger-capable spot available", stats };
    }
  }

  // 2) 计算每个候选的 ETA & 总成本
  const enriched = candidates.map(s => {
    const driveMin = travelTimeMin(scenario.current, s.near) + travelTimeMin(s.near, scenario.destination);
    const etaMin = driveMin + s.queueMin;

    const parkingCost = s.pricePerHourUsd * (scenario.parkingHours ?? 1);

    const chargeCost = scenario.needCharging
      ? (scenario.needKwh ?? 10) * (s.chargingPricePerKwhUsd ?? 0.6)
      : 0;

    const totalCostUsd = +(parkingCost + chargeCost).toFixed(2);

    return {
      ...s,
      driveMin,
      etaMin,
      totalCostUsd
    };
  });

  stats.enrichedCount = enriched.length;
  addThought("我评估了每个候选车位的到达时间和总费用。");
  addThought("同时考虑排队时间，避免你到达后仍需要等待。");

  // 3) 截止时间约束（如果 deadline 很紧）
  const feasible = enriched.filter(x => x.etaMin <= scenario.deadlineMin);
  stats.feasibleCount = feasible.length;
  addThought("考虑到你的时间限制，我筛出了能按时到达的选项。");
  addThought("如果可行选项很少，我会优先保证准时性。");

  if (feasible.length === 0) {
    // 紧急场景：返回“都来不及”的结果，前端可展示“无法满足”
    return { ok: false, thoughts, reason: "No feasible option meets the deadline", candidates: enriched, stats };
  }

  // 4) 评分（可展示）
  const urgency = scenario.urgency;
  const wTime = urgency === "high" ? 0.7 : urgency === "low" ? 0.3 : 0.5;
  const wCost = 1 - wTime;

  const scored = feasible.map(x => {
    // normalize 简化：用 max 做归一（demo 足够）
    const maxEta = Math.max(...feasible.map(a => a.etaMin));
    const maxCost = Math.max(...feasible.map(a => a.totalCostUsd));

    const timeNorm = x.etaMin / (maxEta || 1);
    const costNorm = x.totalCostUsd / (maxCost || 1);

    const score = +(wTime * timeNorm + wCost * costNorm).toFixed(4);
    return { ...x, score };
  }).sort((a, b) => a.score - b.score);

  const best = scored[0];

  addThought("最后我在速度和成本之间做了权衡，选出综合体验最好的车位。");
  addThought("我会优先让你按时到达，同时控制预算不要过高。");
  addThought(`我建议选择 ${best.name}，预计 ${best.etaMin} 分钟可到，费用约 $${best.totalCostUsd}。`);

  return {
    ok: true,
    thoughts,
    stats,
    decision: {
      id: best.id,
      name: best.name,
      providerAddress: best.providerAddress,
      etaMin: best.etaMin,
      totalCostUsd: best.totalCostUsd,
      hasCharging: best.hasCharging
    },
    candidatesForLLM: scored.map(x => ({
      id: x.id,
      name: x.name,
      etaMin: x.etaMin,
      queueMin: x.queueMin,
      pricePerHourUsd: x.pricePerHourUsd,
      totalCostUsd: x.totalCostUsd,
      hasCharging: x.hasCharging,
      chargingPricePerKwhUsd: x.chargingPricePerKwhUsd
    }))
  };
}

module.exports = { decideParkingWithScenarios };
