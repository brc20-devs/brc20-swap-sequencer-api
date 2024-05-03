import fs from "fs";
import { API } from "../src/domain/api";
import { DUST330, DUST546 } from "../src/domain/constant";
import { VPsbt } from "../src/domain/vpsbt";
import { Wallet, bitcoin, printPsbt } from "../src/lib/bitcoin";
import {
  generateDeployContractTxs,
  generateDeployModuleTxs,
} from "../src/lib/tx-helpers";
import { CommitUTXO } from "../src/types/api";

/**
 * Deploy contract
 * @param moduleWallet module wallet, the module will be deployed to this wallet
 * @param inscribeWallet the inscribe wallet, can be the same as moduleWallet
 * @param btcWallet the btc wallet, the fee will be paid by this wallet
 * @param feeRate the fee rate for the transaction
 */
async function deployContract({
  moduleWallet,
  inscribeWallet,
  btcWallet,
  feeRate,
}: {
  moduleWallet: Wallet;
  inscribeWallet: Wallet;
  btcWallet: Wallet;
  feeRate: number;
}) {
  const api = new API();

  const data = fs.readFileSync("./build/contract.js");
  if (!data) {
    throw new Error("contract.js not build");
  }

  const content = data.toString();

  const btcUtxos = await api.addressUTXOs(btcWallet.address as string, 0, 100);

  const result = generateDeployContractTxs({
    content,
    moduleWallet,
    inscribeWallet,
    btcUtxos,
    btcWallet: btcWallet,
    feeRate,
  });

  const psbt1 = bitcoin.Psbt.fromHex(result.tx1.psbtHex, {
    network,
  });
  moduleWallet.signPsbtInputs(psbt1, result.tx1.toSignInputs);
  btcWallet.signPsbtInputs(psbt1, result.tx1.toSignInputs);
  psbt1.finalizeAllInputs();

  const txid = await api.broadcast(psbt1.extractTransaction().toHex());
  console.log("Deploy Contract Success: ", txid);
}

/**
 * Deploy module
 * @param op the module operation
 * @param moduleWallet module wallet, the module will be deployed to this wallet
 * @param inscribeWallet the inscribe wallet, can be the same as moduleWallet
 * @param btcWallet the btc wallet, the fee will be paid by this wallet
 * @param feeRate the fee rate for the transaction
 */
async function deployModule({
  op,
  moduleWallet,
  inscribeWallet,
  btcWallet,
  feeRate,
}: {
  op;
  moduleWallet: Wallet;
  inscribeWallet: Wallet;
  btcWallet: Wallet;
  feeRate;
}) {
  const api = new API();
  const btcUtxos = await api.addressUTXOs(btcWallet.address as string, 0, 100);
  const result = generateDeployModuleTxs({
    op,
    moduleWallet,
    inscribeWallet,
    btcWallet,
    btcUtxos,
    feeRate,
  });

  const psbt1 = bitcoin.Psbt.fromHex(result.tx1.psbtHex, {
    network,
  });
  btcWallet.signPsbtInputs(psbt1, result.tx1.toSignInputs);
  psbt1.finalizeAllInputs();
  printPsbt(psbt1);

  // 1. broadcast the commit rawtx
  console.log("rawtx1:", psbt1.extractTransaction().toHex());

  // 2. broadcast the reveal rawtx
  console.log("rawtx2:", result.tx2.rawtx);
}

/**
 * Split UTXOs for sequencer to inscribe and activate
 * @param btcWallet the btc wallet
 * @param feeRate the fee rate for the transaction
 */
async function splitUTXO({
  btcWallet,
  feeRate,
}: {
  btcWallet: Wallet;
  feeRate: number;
}) {
  const api = new API();
  let utxos = await api.addressUTXOs(btcWallet.address as string);

  const inscribeCount = 6;
  const eachInscribeAmount = 40000;

  const activateCount = 5;
  const eachAcitvateAmount = 10000;

  const vpsbt = new VPsbt();
  let inputAmount = 0;
  for (let i = 0; i < utxos.length; i++) {
    const utxo = utxos[i];
    vpsbt.addInput(btcWallet.toPsbtInput(utxo));
    inputAmount += utxo.satoshi;
  }
  console.log(utxos, inputAmount);

  let outputIndex = 0;
  let utxoTmpArr: {
    index: number;
    value: number;
    purpose: "inscribe" | "activate" | "sequence";
  }[] = [];
  for (let i = 0; i < inscribeCount; i++) {
    vpsbt.addOutput({
      address: btcWallet.address as string,
      value: eachInscribeAmount,
    }); // o0
    utxoTmpArr.push({
      index: outputIndex,
      value: eachInscribeAmount,
      purpose: "inscribe",
    });
    outputIndex++;
  }
  for (let i = 0; i < activateCount; i++) {
    vpsbt.addOutput({
      address: btcWallet.address as string,
      value: eachAcitvateAmount,
    }); // o0
    utxoTmpArr.push({
      index: outputIndex,
      value: eachAcitvateAmount,
      purpose: "activate",
    });
    outputIndex++;
  }
  vpsbt.addOutput({ address: btcWallet.address as string, value: DUST330 }); // o1
  utxoTmpArr.push({
    index: outputIndex,
    value: DUST330,
    purpose: "sequence",
  });
  outputIndex++;

  vpsbt.addOutput({ address: btcWallet.address as string, value: DUST546 }); // o1

  const left = vpsbt.getLeftAmount();

  const networkFee = vpsbt.estimateNetworkFee(feeRate);
  const change = left + DUST546 - networkFee;

  vpsbt.updateOutput(vpsbt.outputs.length - 1, {
    address: btcWallet.address as string,
    value: change,
  });
  const psbt = vpsbt.toPsbt();
  psbt.signAllInputs(btcWallet.signer);
  psbt.finalizeAllInputs();

  const tx = psbt.extractTransaction();
  const txid = tx.getId();
  const rawtx = tx.toHex();

  // 1. confirm the transaction detail
  printPsbt(psbt);

  // 2.broadcast the rawtx
  console.log(rawtx);

  let str = "";
  let commitUTXOs: CommitUTXO[] = [];
  utxoTmpArr.forEach((tmpUtxo) => {
    const commitUTXO: CommitUTXO = {
      txid,
      vout: tmpUtxo.index,
      satoshi: tmpUtxo.value,
      scriptPk: btcWallet.scriptPk,
      codeType: btcWallet.addressType,
      used: "unused",
      status: "unconfirmed",
      purpose: tmpUtxo.purpose,
    };
    commitUTXOs.push(commitUTXO);
    console.log(`db.sequencer_utxo.insert(${JSON.stringify(commitUTXO)})`);
  });

  // 3. save the commitUTXOs to db
  console.log(str);
}

export const deployTools = {
  deployContract,
  deployModule,
  splitUTXO,
};
