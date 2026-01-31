require('dotenv').config();
const { ethers } = require('ethers');
const { GokiteAASDK } = require('gokite-aa-sdk');

const RPC = 'https://rpc-testnet.gokite.ai/';
const BUNDLER = 'https://bundler-service.staging.gokite.ai/rpc/';

async function pay({ to, amountKite }) {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('Missing PRIVATE_KEY in .env');

  const eoa = new ethers.Wallet(pk);

  const sdk = new GokiteAASDK('kite_testnet', RPC, BUNDLER);
  const aaWallet = sdk.getAccountAddress(eoa.address);

  const signFunction = async (userOpHash) => eoa.signMessage(ethers.getBytes(userOpHash));

  const req = {
    target: to,
    value: ethers.parseEther(String(amountKite)),
    callData: '0x'
  };

  const res = await sdk.sendUserOperationAndWait(eoa.address, req, signFunction);

  if (res?.status?.status !== 'success') {
    throw new Error(res?.status?.reason ?? 'Payment failed');
  }

  return {
    eoa: eoa.address,
    aaWallet,
    userOpHash: res.userOpHash,
    txHash: res.status.transactionHash
  };
}

module.exports = { pay };
