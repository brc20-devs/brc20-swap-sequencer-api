import { DUST546 } from "../../domain/constant";
import { CodeEnum, insufficient_btc } from "../../domain/error";
import { need } from "../../domain/utils";
import { VPsbt } from "../../domain/vpsbt";
import { ToSignInput, UTXO } from "../../types/api";
import { ignoreVerifySig } from "./utils";
import { Wallet } from "./wallet";

export function generateSendBTCTx({
  wallet,
  utxos,
  toAddress,
  toAmount,
  feeRate,
}: {
  wallet: Wallet;
  utxos: UTXO[];
  toAddress: string;
  toAmount: number;
  feeRate: number;
}) {
  const vpsbt = new VPsbt();
  let inputAmount = 0;
  for (let i = 0; i < utxos.length; i++) {
    const utxo = utxos[i];
    vpsbt.addInput(wallet.toPsbtInput(utxo));
    inputAmount += utxo.satoshi;
  }
  vpsbt.addOutput({ address: toAddress, value: toAmount }); // o0
  vpsbt.addOutput({ address: wallet.address, value: DUST546 }); // o1

  const left = vpsbt.getLeftAmount();
  need(left >= 0, insufficient_btc, CodeEnum.sequencer_insufficient_funds);

  const networkFee = vpsbt.estimateNetworkFee(feeRate);
  const change = inputAmount - networkFee - toAmount;
  need(
    change >= DUST546,
    insufficient_btc,
    CodeEnum.sequencer_insufficient_funds
  );

  vpsbt.updateOutput(1, { address: wallet.address, value: change });
  const psbt = vpsbt.toPsbt();

  const toSignInputs: ToSignInput[] = [];
  for (let i = 0; i < utxos.length; i++) {
    toSignInputs.push({ index: i, address: wallet.address });
  }

  const psbtHex = psbt.toHex();
  ignoreVerifySig(true);
  const tx = psbt.extractTransaction();
  ignoreVerifySig(false);

  const txid = tx.getId();

  return {
    txid,
    psbtHex,
    change,
    toSignInputs,
  };
}
