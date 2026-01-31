import fs from 'node:fs';
import readline from 'node:readline';
import ini from 'ini';
import { ethers } from 'ethers';
import { GokiteAASDK } from 'gokite-aa-sdk';

const QUIET = true;
const out = (msg) => process.stdout.write(`${msg}\n`);
if (QUIET) {
  console.log = () => {};
}
const printErrorType = (err) => {
  const type = err?.type || err?.code || err?.name || 'UNKNOWN';
  console.error(`ERROR_TYPE: ${type}`);
};
process.on('unhandledRejection', (err) => {
  printErrorType(err);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  printErrorType(err);
  process.exit(1);
});

const runtimePath = 'config/runtime.json';
const readRuntime = () => {
  if (!fs.existsSync(runtimePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(runtimePath, 'utf-8'));
  } catch {
    return {};
  }
};
const writeRuntime = (data) => {
  fs.writeFileSync(runtimePath, JSON.stringify(data, null, 2));
};

const configPath = 'config/user.ini';
if (!fs.existsSync(configPath)) {
  throw new Error(`找不到配置文件: ${configPath}`);
}

const config = ini.parse(fs.readFileSync(configPath, 'utf-8'));

const privateKey = config.wallet?.private_key?.trim();
const networkName = config.network?.network_name?.trim();
const rpcUrl = config.network?.rpc_url?.trim();
const bundlerUrl = config.network?.bundler_url?.trim();
const presetRecipient = config.transfer?.recipient?.trim();
const presetAmountStr = config.transfer?.amount?.toString().trim();
const feeBufferStr = config.transfer?.fee_buffer?.toString().trim() ?? '0';
const feeBufferMultiplierStr =
  config.transfer?.fee_buffer_multiplier?.toString().trim() ?? '1.1';
const withdrawThresholdStr = config.transfer?.withdraw_threshold?.toString().trim() ?? '0.00001';
const forceWithdrawToThreshold =
  config.transfer?.force_withdraw_to_threshold?.toString().trim().toLowerCase() === 'true';

if (!privateKey) throw new Error('配置缺少 wallet.private_key');
if (!networkName || !rpcUrl || !bundlerUrl) throw new Error('配置缺少 network 信息');
if (!presetRecipient) throw new Error('配置缺少 transfer.recipient');
if (!presetAmountStr) throw new Error('配置缺少 transfer.amount');

const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);
const signerAddress = await wallet.getAddress();

const sdk = new GokiteAASDK(networkName, rpcUrl, bundlerUrl);
const aaWalletAddress = sdk.getAccountAddress(signerAddress);

// Kite Testnet Settlement Token (KITE)
const KITE_TOKEN = '0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63';
const tokenInterface = new ethers.Interface([
  'function transfer(address to, uint256 amount)',
  'function balanceOf(address owner) view returns (uint256)'
]);
const tokenContract = new ethers.Contract(KITE_TOKEN, tokenInterface, provider);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

const showBalances = async () => {
  const [eoaBal, aaBal] = await Promise.all([
    tokenContract.balanceOf(signerAddress),
    tokenContract.balanceOf(aaWalletAddress)
  ]);
  out('KITE 余额:');
  out(`- EOA: ${ethers.formatUnits(eoaBal, 18)}`);
  out(`- AA : ${ethers.formatUnits(aaBal, 18)}`);
  return { eoaBal, aaBal };
};

out('钱包信息:');
out(`EOA: ${signerAddress}`);
out(`AA Wallet: ${aaWalletAddress}`);
await showBalances();

const inputRecipient = (await ask(`收款地址（默认 ${presetRecipient}）: `)).trim();
const recipient = inputRecipient || presetRecipient;

if (recipient === '0x0000000000000000000000000000000000000000') {
  rl.close();
  throw new Error('请在 config/user.ini 中设置有效的 recipient 地址');
}

const inputAmount = (await ask(`转账数量 KITE（默认 ${presetAmountStr}）: `)).trim();
const amountStr = inputAmount || presetAmountStr;

const amount = ethers.parseUnits(amountStr, 18);
const minFeeBuffer = ethers.parseUnits(feeBufferStr || '0', 18);
const feeMultiplier = Number(feeBufferMultiplierStr || '1.2');
if (!Number.isFinite(feeMultiplier) || feeMultiplier <= 0) {
  throw new Error('fee_buffer_multiplier 必须是大于 0 的数字');
}
const withdrawThreshold = ethers.parseUnits(withdrawThresholdStr || '0.00001', 18);

const callData = tokenInterface.encodeFunctionData('transfer', [recipient, amount]);

// 1) 动态估算手续费：基于 SDK 的 UserOp 估算 + 支付方式判断
const estimate = await sdk.estimateUserOperation(signerAddress, {
  target: KITE_TOKEN,
  value: 0n,
  callData
});
const estimatedFeeBase = BigInt(estimate.totalCostKITE);
const runtime = readRuntime();
const lastActualGasCost = runtime.lastActualGasCost ? BigInt(runtime.lastActualGasCost) : null;
const feeBase =
  lastActualGasCost && lastActualGasCost > estimatedFeeBase
    ? lastActualGasCost
    : estimatedFeeBase;
const estimatedFee =
  (feeBase * BigInt(Math.round(feeMultiplier * 100))) / 100n;
const feeBuffer = estimatedFee > minFeeBuffer ? estimatedFee : minFeeBuffer;

console.log(
  `动态手续费估算: ${ethers.formatUnits(estimatedFee, 18)} KITE` +
  ` (倍率 ${feeMultiplier}x, 最低 ${feeBufferStr})`
);
if (lastActualGasCost) {
  console.log(
    `手续费基准: 上次实际 ${ethers.formatUnits(lastActualGasCost, 18)} / 本次估算 ${ethers.formatUnits(estimatedFeeBase, 18)}`
  );
}

const sponsorshipAvailable = estimate.sponsorshipAvailable;
const payToken =
  sponsorshipAvailable ? '0x0000000000000000000000000000000000000000' : KITE_TOKEN;
console.log(`支付方式: ${sponsorshipAvailable ? '赞助' : 'KITE 支付'}`);

const confirm = (await ask(`确认转账 ${amountStr} KITE 到 ${recipient} ? (y/N): `))
  .trim()
  .toLowerCase();
if (confirm !== 'y') {
  rl.close();
  out('已取消');
  process.exit(0);
}
rl.close();

// 2) 自动充值：如果 AA 余额不足（转账金额 + 动态手续费），从 EOA 补足
const { aaBal: aaBalBefore } = await showBalances();
const needed = amount + (sponsorshipAvailable ? 0n : feeBuffer);
if (aaBalBefore < needed) {
  const topUp = needed - aaBalBefore;
  out(`AA 余额不足，自动充值 ${ethers.formatUnits(topUp, 18)} KITE...`);
  const eoaToken = tokenContract.connect(wallet);
  const tx = await eoaToken.transfer(aaWalletAddress, topUp);
  await tx.wait();
  out('充值完成');
} else {
  out('AA 余额充足，无需充值');
}

// 2) 转账（AA 账户执行）
const signFunction = async (userOpHash) => wallet.signMessage(ethers.getBytes(userOpHash));

out('发送 AA 转账中...');
const result = await sdk.sendUserOperationWithPayment(
  signerAddress,
  { target: KITE_TOKEN, value: 0n, callData },
  estimate.userOp,
  payToken,
  signFunction
);

if (result?.status?.status === 'success') {
  out('✅ KITE 转账成功');
  out(`Transaction hash: ${result.status.transactionHash}`);
  if (result.status.actualGasCost) {
    const actualCost = BigInt(result.status.actualGasCost);
    writeRuntime({ lastActualGasCost: actualCost.toString() });
  }
} else {
  out('❌ KITE 转账失败');
  out(`Reason: ${result?.status?.reason ?? 'unknown'}`);
  process.exit(1);
}

// 3) 自动提现：AA 余额 > 阈值则回收至 EOA（预留手续费与阈值）
const { aaBal: aaBalAfter } = await showBalances();
if (aaBalAfter > withdrawThreshold) {
  const withdrawPreviewCallData = tokenInterface.encodeFunctionData('transfer', [
    signerAddress,
    aaBalAfter
  ]);
  const withdrawEstimatePreview = await sdk.estimateUserOperation(signerAddress, {
    target: KITE_TOKEN,
    value: 0n,
    callData: withdrawPreviewCallData
  });
  const withdrawSponsored = withdrawEstimatePreview.sponsorshipAvailable;
  const withdrawFeeBase = BigInt(withdrawEstimatePreview.totalCostKITE);
  const runtimeForWithdraw = readRuntime();
  const lastActualForWithdraw = runtimeForWithdraw.lastActualGasCost
    ? BigInt(runtimeForWithdraw.lastActualGasCost)
    : null;
  const withdrawFeeBasis =
    lastActualForWithdraw && lastActualForWithdraw > withdrawFeeBase
      ? lastActualForWithdraw
      : withdrawFeeBase;
  const withdrawFee =
    (withdrawFeeBasis * BigInt(Math.round(feeMultiplier * 100))) / 100n;
  const withdrawFeeBuffer = withdrawFee > minFeeBuffer ? withdrawFee : minFeeBuffer;

  const reserved =
    withdrawSponsored ? withdrawThreshold : withdrawThreshold + withdrawFeeBuffer;
  const withdrawAmount = aaBalAfter - reserved;
  if (forceWithdrawToThreshold && !withdrawSponsored && withdrawFeeBuffer > aaBalAfter - withdrawThreshold) {
    out('AA 余额不足以覆盖提现手续费，强制提现将失败，跳过提现');
  } else if (withdrawAmount <= 0n) {
    out('AA 余额不足以覆盖提现手续费与阈值，跳过提现');
  } else {
    const withdrawCallData = tokenInterface.encodeFunctionData('transfer', [
      signerAddress,
      withdrawAmount
    ]);
    out(
      `提现到 EOA: ${ethers.formatUnits(withdrawAmount, 18)} KITE (保留 ${ethers.formatUnits(reserved, 18)})`
    );

    const withdrawEstimate = await sdk.estimateUserOperation(signerAddress, {
      target: KITE_TOKEN,
      value: 0n,
      callData: withdrawCallData
    });
    const withdrawPayToken = withdrawEstimate.sponsorshipAvailable
      ? '0x0000000000000000000000000000000000000000'
      : KITE_TOKEN;

    const withdrawResult = await sdk.sendUserOperationWithPayment(
      signerAddress,
      { target: KITE_TOKEN, value: 0n, callData: withdrawCallData },
      withdrawEstimate.userOp,
      withdrawPayToken,
      signFunction
    );
    if (withdrawResult?.status?.status === 'success') {
      out('✅ 提现成功');
      out(`Transaction hash: ${withdrawResult.status.transactionHash}`);
    } else {
      out('❌ 提现失败');
      out(`Reason: ${withdrawResult?.status?.reason ?? 'unknown'}`);
    }
  }
} else {
  out('AA 余额低于阈值，不提现');
}
