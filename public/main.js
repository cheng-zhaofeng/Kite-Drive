
(function(){
    const video = document.getElementById('mainVideo');
    const btn = document.getElementById('reserveBtn');
    const resultPanel = document.getElementById('resultPanel');
    const resultText = document.getElementById('resultText');
    const agentThoughts = document.getElementById('agentThoughts');
    const paymentLog = document.getElementById('paymentLog');
    const speedValue = document.getElementById('speedValue');
    const batteryValue = document.getElementById('batteryValue');
    const batteryFill = document.getElementById('batteryFill');
    const locationValue = document.getElementById('locationValue');
    const statusValue = document.getElementById('statusValue');
    const routeTag = document.getElementById('routeTag');
    const modeTag = document.getElementById('modeTag');
    if(!video || !btn) return;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let agentQueue = Promise.resolve();

    function typeLine(container, text, delay = 18) {
        return new Promise((resolve) => {
            const bubble = document.createElement('div');
            bubble.className = 'agent-bubble';
            if (text.startsWith('✅') || text.includes('建议') || text.includes('已完成')) {
                bubble.classList.add('emphasis');
            }
            container.appendChild(bubble);
            let i = 0;
            const tick = () => {
                bubble.textContent = text.slice(0, i);
                container.scrollTop = container.scrollHeight;
                if (i < text.length) {
                    i += 1;
                    setTimeout(tick, delay);
                } else {
                    resolve();
                }
            };
            tick();
        });
    }

    function runAgentFlow(container, lines, { reset = false, delay = 18, gap = 280 } = {}) {
        if (!container) return;
        if (reset) {
            container.innerHTML = '';
            agentQueue = Promise.resolve();
        }
        lines.forEach((line) => {
            agentQueue = agentQueue
                .then(() => typeLine(container, line, delay))
                .then(() => sleep(gap));
        });
    }

    function renderVehicleInfo(state) {
        if (speedValue) speedValue.textContent = `${state.speed} km/h`;
        if (batteryValue) batteryValue.textContent = `${Number(state.battery).toFixed(2)}%`;
        if (batteryFill) batteryFill.style.width = `${Number(state.battery).toFixed(2)}%`;
        if (locationValue) locationValue.textContent = state.location;
        if (statusValue) statusValue.textContent = state.status;
        if (routeTag) routeTag.textContent = `路线：${state.route}`;
        if (modeTag) modeTag.textContent = `模式：${state.mode}`;
    }

    const vehicleState = {
        speed: 42,
        battery: 62,
        location: 'CBD-01 / 中央商务区',
        status: '规划中',
        route: '规划中',
        mode: '自动驾驶'
    };

    let vehicleTicker = null;
    function startVehicleTicker() {
        if (vehicleTicker) clearInterval(vehicleTicker);
        vehicleTicker = setInterval(() => {
            // Simulate speed & battery change
            const delta = Math.random() > 0.5 ? 1 : -1;
            vehicleState.speed = Math.max(0, Math.min(68, vehicleState.speed + delta * (1 + Math.floor(Math.random() * 3))));
            if (vehicleState.speed === 0) vehicleState.status = '待命';
            if (vehicleState.battery > 8) {
                vehicleState.battery = Math.max(8, vehicleState.battery - 0.1);
            }
            renderVehicleInfo(vehicleState);
        }, 1200);
    }

    function buildPaymentUI(target) {
        if (!target) return;
        target.innerHTML = `
            <div class="payment-shell">
                <div class="payment-progress">
                    <div class="payment-progress-bar" id="payProgress"></div>
                </div>
                <div id="paySteps" style="display:flex; flex-direction:column; gap:8px;"></div>
                <div id="payHash" class="hash-pill" style="display:none;"></div>
            </div>
        `;
    }

    function runPaymentFlow(target, { txHash, amountUsd }) {
        if (!target) return;
        buildPaymentUI(target);
        const progressBar = target.querySelector('#payProgress');
        const stepsEl = target.querySelector('#paySteps');
        const hashEl = target.querySelector('#payHash');
        const amountText = amountUsd != null ? ('$' + amountUsd) : '0.001 KITE';
        const steps = [
            { title: '钱包信息读取', desc: 'EOA / AA 地址已确认' },
            { title: '余额检查', desc: 'EOA 与 AA 余额就绪' },
            { title: '收款地址确认', desc: '停车场收款地址已校验' },
            { title: '金额确认', desc: `转账金额：${amountText}` },
            { title: '自动充值', desc: 'AA 余额不足，触发充值' },
            { title: '发送 AA 转账', desc: 'UserOp 已提交至 Bundler' },
            { title: '交易确认', desc: '链上回执已写入' }
        ];
        steps.forEach((step) => {
            const item = document.createElement('div');
            item.className = 'payment-step';
            item.innerHTML = `
                <div class="dot"></div>
                <div>
                    <div class="title">${step.title}</div>
                    <div class="desc">${step.desc}</div>
                </div>
            `;
            stepsEl.appendChild(item);
        });
        steps.forEach((_, idx) => {
            setTimeout(() => {
                const items = stepsEl.querySelectorAll('.payment-step');
                items[idx].classList.add('done');
                if (progressBar) {
                    const pct = Math.round(((idx + 1) / steps.length) * 100);
                    progressBar.style.width = `${pct}%`;
                }
                // Auto-scroll payment panel as steps fill in
                target.scrollTop = target.scrollHeight;
                if (idx === steps.length - 1 && hashEl) {
                    hashEl.style.display = 'block';
                    hashEl.textContent = `Transaction hash: ${txHash}`;
                    target.scrollTop = target.scrollHeight;
                }
            }, idx * 700);
        });
    }

    btn.addEventListener('click', startSequence);

    async function startSequence(){
        // 隐藏预订按钮
        btn.classList.add('hidden');
        
        if (resultPanel && resultText) {
            resultPanel.style.display = 'block';
            resultText.textContent = '正在请求车位与支付...';
        }
        if (agentThoughts) {
            runAgentFlow(agentThoughts, [
                '已获取到车辆状态与任务目标。',
                '正在拉取附近停车位与认证信息…'
            ], { reset: true });
        }
        Object.assign(vehicleState, {
            speed: 42,
            battery: 62,
            location: 'CBD-01 / 中央商务区',
            status: '规划中',
            route: '规划中',
            mode: '自动驾驶'
        });
        renderVehicleInfo(vehicleState);
        startVehicleTicker();
        if (paymentLog) buildPaymentUI(paymentLog);

        try {
            const resp = await fetch('/api/reserve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scenarioId: 'MEETING_URGENT_OK' })
            });
            const data = await resp.json();
            
            if (resp.ok && data?.ok) {
                const chosen = data?.chosen;
                const payment = data?.payment;
                const summary = data?.llm?.summary || '规则引擎已完成选择';
                const fakeTx = '0x' + Math.random().toString(16).slice(2).padEnd(64, '0').slice(0, 64);
                const txHash = payment?.txHash || fakeTx;
                const payLine = '支付Tx：' + txHash;
                
                if (agentThoughts) {
                    const stats = data?.agent?.stats || {};
                    const total = stats.totalSpots ?? 5;
                    const certified = stats.kiteCertifiedCount ?? total;
                    const chargingNeed = data?.scenario?.needCharging ? '需要' : '不需要';
                    const feasible = stats.feasibleCount ?? 1;
                    const deadline = stats.deadlineMin ?? data?.scenario?.deadlineMin ?? 15;
                    const steps = [
                        `已拉取到 ${total} 个停车位数据，其中 ${certified} 个通过 Kite 认证。`,
                        `车辆当前${chargingNeed}充电，候选集合已完成过滤。`,
                        '正在计算每个车位的 ETA、排队时间与费用…',
                        `时间约束为 ${deadline} 分钟，可行方案剩余 ${feasible} 个。`,
                        '取舍策略：优先准时性，其次控制预算与排队风险。',
                        `综合评分最优：${chosen?.name || chosen?.id}（ETA ${chosen?.etaMin ?? '--'} 分钟）。`,
                        '已触发支付流程并生成订单，等待链上确认。',
                        '支付完成后自动规划行车路径，准备入场泊车。',
                        '✅ 建议方案已完成。'
                    ];
                    runAgentFlow(agentThoughts, steps);
                    
                    // 等待AI分析完成
                    await agentQueue;
                }
                
                if (paymentLog) {
                    runPaymentFlow(paymentLog, {
                        txHash,
                        amountUsd: chosen?.totalCostUsd
                    });
                    
                    // 等待支付完成
                    await sleep(5000); // 等待支付流程完成（根据实际支付步骤数量调整）
                }
                
                // AI分析和支付都完成后，更新结果
                resultText.innerHTML =
                    '已选车位：' + (chosen?.name || chosen?.id) + '<br>' +
                    'ETA：' + chosen?.etaMin + ' 分钟<br>' +
                    '成本：$' + chosen?.totalCostUsd + '<br>' +
                    '解释：' + summary + '<br>' +
                    payLine;
                
                Object.assign(vehicleState, {
                    speed: Math.max(vehicleState.speed - 4, 18),
                    battery: Math.max(vehicleState.battery - 3, 10),
                    location: '前往车位',
                    status: '泊车中',
                    route: '已规划',
                    mode: '自动驾驶'
                });
                renderVehicleInfo(vehicleState);
                
                // 开始播放v4
                video.removeAttribute('loop');
                video.src = 'v4.mp4';
                video.load();
                video.play().catch(()=>{});
                
                // 监听v4播放结束
                video.onended = function() {
                    video.onended = null; // 清除事件监听器
                    
                    // 播放v2
                    video.src = 'v2.mp4';
                    video.load();
                    video.play().catch(()=>{});
                    
                    // 监听v2播放结束
                    video.onended = function() {
                        video.onended = null; // 清除事件监听器
                        
                        // 播放v3
                        video.src = 'v3.mp4';
                        video.load();
                        video.play().catch(()=>{});
                        
                        // 监听v3播放结束
                        video.onended = function() {
                            video.onended = null; // 清除事件监听器
                            
                            // 清空AI思考内容
                            if (agentThoughts) {
                                agentThoughts.innerHTML = '';
                            }
                            
                            // 清空交易流程
                            if (paymentLog) {
                                paymentLog.innerHTML = '';
                            }
                            
                            // 重新播放v1并恢复循环
                            video.src = 'v1.mp4';
                            video.load();
                            video.setAttribute('loop', 'true');
                            video.play().catch(()=>{});
                            
                            // 显示预订按钮
                            btn.classList.remove('hidden');
                        };
                    };
                };
                
            } else {
                const reason = data?.agent?.reason || data?.error || '请求失败';
                resultText.textContent = '失败：' + reason;
                if (agentThoughts) {
                    const steps = [
                        '多车位对比中：到达时间、排队、费用、充电能力。',
                        '当前请求未返回可用结果，我会继续保持路线规划准备。',
                        '✅ 已给出当前最可行方案。'
                    ];
                    runAgentFlow(agentThoughts, steps);
                    
                    // 等待AI分析完成
                    await agentQueue;
                }
                if (paymentLog) {
                    const fakeTx = '0x' + Math.random().toString(16).slice(2).padEnd(64, '0').slice(0, 64);
                    runPaymentFlow(paymentLog, { txHash: fakeTx, amountUsd: null });
                    
                    // 等待支付流程完成
                    await sleep(5000);
                }
                Object.assign(vehicleState, {
                    speed: 0,
                    battery: Math.max(vehicleState.battery - 1, 10),
                    location: '等待调度',
                    status: '待命',
                    route: '未规划',
                    mode: '自动驾驶'
                });
                renderVehicleInfo(vehicleState);
                
                // 播放v4
                video.removeAttribute('loop');
                video.src = 'v4.mp4';
                video.load();
                video.play().catch(()=>{});
                
                // 监听v4播放结束
                video.onended = function() {
                    video.onended = null; // 清除事件监听器
                    
                    // 播放v2
                    video.src = 'v2.mp4';
                    video.load();
                    video.play().catch(()=>{});
                    
                    // 监听v2播放结束
                    video.onended = function() {
                        video.onended = null; // 清除事件监听器
                        
                        // 播放v3
                        video.src = 'v3.mp4';
                        video.load();
                        video.play().catch(()=>{});
                        
                        // 监听v3播放结束
                        video.onended = function() {
                            video.onended = null; // 清除事件监听器
                            
                            // 清空AI思考内容
                            if (agentThoughts) {
                                agentThoughts.innerHTML = '';
                            }
                            
                            // 清空交易流程
                            if (paymentLog) {
                                paymentLog.innerHTML = '';
                            }
                            
                            // 重新播放v1并恢复循环
                            video.src = 'v1.mp4';
                            video.load();
                            video.setAttribute('loop', 'true');
                            video.play().catch(()=>{});
                            
                            // 显示预订按钮
                            btn.classList.remove('hidden');
                        };
                    };
                };
            }
        } catch (e) {
            if (resultText) resultText.textContent = '网络错误：' + (e?.message || e);
            if (agentThoughts) {
                runAgentFlow(agentThoughts, [
                    '网络波动，正在重试数据读取…',
                    '我会保持当前路线规划，等待服务恢复。',
                    '✅ 已进入兜底流程。'
                ]);
                
                // 等待AI分析完成
                await agentQueue;
            }
            if (paymentLog) {
                const fakeTx = '0x' + Math.random().toString(16).slice(2).padEnd(64, '0').slice(0, 64);
                runPaymentFlow(paymentLog, { txHash: fakeTx, amountUsd: null });
                
                // 等待支付流程完成
                await sleep(5000);
            }
            Object.assign(vehicleState, {
                speed: 0,
                battery: Math.max(vehicleState.battery - 1, 10),
                location: '网络异常',
                status: '待命',
                route: '未规划',
                mode: '自动驾驶'
            });
            renderVehicleInfo(vehicleState);
            
            // 播放v4
            video.src = 'v4.mp4';
            video.load();
            video.play().catch(()=>{});
            
            // 监听v4播放结束
            video.onended = function() {
                video.onended = null; // 清除事件监听器
                
                // 播放v2
                video.src = 'v2.mp4';
                video.load();
                video.play().catch(()=>{});
                
                // 监听v2播放结束
                video.onended = function() {
                    video.onended = null; // 清除事件监听器
                    
                    // 播放v3
                    video.src = 'v3.mp4';
                    video.load();
                    video.play().catch(()=>{});
                    
                    // 监听v3播放结束
                    video.onended = function() {
                        video.onended = null; // 清除事件监听器
                        
                        // 清空AI思考内容
                        if (agentThoughts) {
                            agentThoughts.innerHTML = '';
                        }
                        
                        // 重新播放v1并恢复循环
                        video.src = 'v1.mp4';
                        video.load();
                        video.play().catch(()=>{});
                        video.loop = true;
                        
                        // 显示预订按钮
                        btn.classList.remove('hidden');
                    };
                };
            };
        }
    }
})();
