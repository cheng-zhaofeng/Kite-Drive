require('dotenv').config();
const { ethers } = require('ethers');
const { GokiteAASDK } = require('gokite-aa-sdk');

const RPC = 'https://rpc-testnet.gokite.ai/';
const BUNDLER = 'https://bundler-service.staging.gokite.ai/rpc/';

async function main() {
  const pk = process.env.PRIVATE_KEY;
  const to = process.env.TO_ADDRESS;

  if (!pk || !to) {
    throw new Error('Missing PRIVATE_KEY or TO_ADDRESS in .env');
  }

  const eoa = new ethers.Wallet(pk);
  console.log('EOA:', eoa.address);

  const sdk = new GokiteAASDK('kite_testnet', RPC, BUNDLER);

  const aaAddress = sdk.getAccountAddress(eoa.address);
  console.log('AA Wallet:', aaAddress);

  const signFunction = async (userOpHash) => {
    return eoa.signMessage(ethers.getBytes(userOpHash));
  };

  const req = {
    target: to,
    value: ethers.parseEther('0.0001'),
    callData: '0x',
  };

  console.log('Sending user operation...');
  const res = await sdk.sendUserOperationAndWait(eoa.address, req, signFunction);

  console.log('Response:', JSON.stringify(res, null, 2));

  const status = res?.status;
  if (status?.status === 'success') {
    console.log('✅ TxHash:', status.transactionHash);
    console.log('Explorer:', `https://testnet.kitescan.ai/tx/${status.transactionHash}`);
  } else {
    console.log('❌ Not success:', status);
    console.log('If you see insufficient funds / gas errors: send some KITE to AA Wallet above and retry.');
  }
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
