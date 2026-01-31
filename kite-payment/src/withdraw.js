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

if (!privateKey) throw new Error('配置缺少 wallet.private_key');
if (!networkName || !rpcUrl || !bundlerUrl) throw new Error('配置缺少 network 信息');

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

const aaBal = await tokenContract.balanceOf(aaWalletAddress);
const withdrawThresholdStr = config.transfer?.withdraw_threshold?.toString().trim() ?? '0.00001';
const forceWithdrawToThreshold =
  config.transfer?.force_withdraw_to_threshold?.toString().trim().toLowerCase() === 'true';
const feeBufferStr = config.transfer?.fee_buffer?.toString().trim() ?? '0.00005';
const feeBufferMultiplierStr =
  config.transfer?.fee_buffer_multiplier?.toString().trim() ?? '1.2';
const withdrawThreshold = ethers.parseUnits(withdrawThresholdStr || '0.00001', 18);
const minFeeBuffer = ethers.parseUnits(feeBufferStr || '0.00005', 18);
const feeMultiplier = Number(feeBufferMultiplierStr || '1.2');
if (!Number.isFinite(feeMultiplier) || feeMultiplier <= 0) {
  throw new Error('fee_buffer_multiplier 必须是大于 0 的数字');
}

out('钱包信息:');
out(`EOA: ${signerAddress}`);
out(`AA Wallet: ${aaWalletAddress}`);
out(`AA KITE 余额: ${ethers.formatUnits(aaBal, 18)}`);
out(`提现后保留: ${withdrawThresholdStr} KITE`);

if (aaBal <= withdrawThreshold) {
  out('AA 余额低于或等于阈值，无需提现');
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

// 预估提现手续费并预留
const previewCallData = tokenInterface.encodeFunctionData('transfer', [signerAddress, aaBal]);
const previewEstimate = await sdk.estimateUserOperation(signerAddress, {
  target: KITE_TOKEN,
  value: 0n,
  callData: previewCallData
});
const previewFeeBase = BigInt(previewEstimate.totalCostKITE);
const runtime = readRuntime();
const lastActualGasCost = runtime.lastActualGasCost ? BigInt(runtime.lastActualGasCost) : null;
const previewFeeBasis =
  lastActualGasCost && lastActualGasCost > previewFeeBase ? lastActualGasCost : previewFeeBase;
const previewFee =
  (previewFeeBasis * BigInt(Math.round(feeMultiplier * 100))) / 100n;
const previewFeeBuffer = previewFee > minFeeBuffer ? previewFee : minFeeBuffer;
const reserved =
  previewEstimate.sponsorshipAvailable ? withdrawThreshold : withdrawThreshold + previewFeeBuffer;

const withdrawAmount = aaBal - reserved;
if (
  forceWithdrawToThreshold &&
  !previewEstimate.sponsorshipAvailable &&
  previewFeeBuffer > aaBal - withdrawThreshold
) {
  out('AA 余额不足以覆盖提现手续费，强制提现将失败，跳过提现');
  process.exit(0);
}
if (withdrawAmount <= 0n) {
  out('AA 余额不足以覆盖提现手续费与阈值，跳过提现');
  const [eoaBalAfter, aaBalAfter] = await Promise.all([
    tokenContract.balanceOf(signerAddress),
    tokenContract.balanceOf(aaWalletAddress)
  ]);
  out('当前余额:');
  out(`- EOA: ${ethers.formatUnits(eoaBalAfter, 18)}`);
  out(`- AA : ${ethers.formatUnits(aaBalAfter, 18)}`);
  process.exit(0);
}
out(
  `提现到 EOA: ${ethers.formatUnits(withdrawAmount, 18)} KITE (保留 ${ethers.formatUnits(reserved, 18)})`
);
const confirm = (await ask(
  `确认提现 ${ethers.formatUnits(withdrawAmount, 18)} KITE (保留 ${ethers.formatUnits(reserved, 18)})？(y/N): `
))
  .trim()
  .toLowerCase();
rl.close();
if (confirm !== 'y') {
  out('已取消');
  process.exit(0);
}

const callData = tokenInterface.encodeFunctionData('transfer', [signerAddress, withdrawAmount]);
const signFunction = async (userOpHash) => wallet.signMessage(ethers.getBytes(userOpHash));

out('发送提现中...');
const estimate = await sdk.estimateUserOperation(signerAddress, {
  target: KITE_TOKEN,
  value: 0n,
  callData
});
const payToken = estimate.sponsorshipAvailable
  ? '0x0000000000000000000000000000000000000000'
  : KITE_TOKEN;

const result = await sdk.sendUserOperationWithPayment(
  signerAddress,
  { target: KITE_TOKEN, value: 0n, callData },
  estimate.userOp,
  payToken,
  signFunction
);

if (result?.status?.status === 'success') {
  out('✅ 提现成功');
  out(`Transaction hash: ${result.status.transactionHash}`);
  if (result.status.actualGasCost) {
    const actualCost = BigInt(result.status.actualGasCost);
    writeRuntime({ lastActualGasCost: actualCost.toString() });
  }

  const [eoaBalAfter, aaBalAfter] = await Promise.all([
    tokenContract.balanceOf(signerAddress),
    tokenContract.balanceOf(aaWalletAddress)
  ]);
  out('提现后余额:');
  out(`- EOA: ${ethers.formatUnits(eoaBalAfter, 18)}`);
  out(`- AA : ${ethers.formatUnits(aaBalAfter, 18)}`);
} else {
  out('❌ 提现失败');
  out(`Reason: ${result?.status?.reason ?? 'unknown'}`);
  process.exit(1);
}
