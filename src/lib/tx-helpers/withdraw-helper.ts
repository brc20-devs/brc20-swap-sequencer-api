import { CodeEnum } from "../../domain/error";
import { need } from "../../domain/utils";
import { UTXO } from "../../types/api";
import { AddressType } from "../../types/domain";
import {
  Wallet,
  bitcoin,
  generateInscribeTx,
  generateSendBTCTx,
  generateSendInscriptionTx,
} from "../bitcoin";

export function estimateWithdrawFee({
  op,
  userWallet,
  feeRate,
  utxos,
}: {
  op: any;
  userWallet: Wallet;
  feeRate: number;
  utxos: UTXO[];
}) {
  const content = JSON.stringify(op);
  const fee =
    (350 + content.length / 4) * feeRate +
    107 +
    utxos.length * 60 +
    userWallet.dust * 2;
  return fee;
}

export function generateWithdrawTxs({
  op,
  userWallet,
  inscribeWallet,
  delegateWallet,
  senderWallet,
  feeRate,
  userUtxos,
}: {
  op: any;
  userWallet: Wallet;
  inscribeWallet: Wallet;
  delegateWallet: Wallet;
  senderWallet: Wallet;
  feeRate: number;
  userUtxos: UTXO[];
}) {
  const totalInput = userUtxos.reduce((pre, cur) => pre + cur.satoshi, 0);
  const content = JSON.stringify(op);

  const estimateFee = estimateWithdrawFee({
    op,
    userWallet,
    feeRate,
    utxos: userUtxos,
  });
  need(totalInput > estimateFee, null, CodeEnum.user_insufficient_funds);

  const dummyUserWallet = Wallet.fromRandomLikeAddress(userWallet.address);
  const dummyUserUtxos: UTXO[] = userUtxos.map((v) => ({
    txid: v.txid,
    vout: v.vout,
    satoshi: 1000000000,
    scriptPk: dummyUserWallet.scriptPk,
    codeType: dummyUserWallet.addressType,
  }));

  const inscriptionValue = dummyUserWallet.dust;

  const changeValue = 10000000;
  const dummyTx2Result = generateInscribeTx({
    inscribeWallet,
    content: JSON.stringify(op),
    toAddress: dummyUserWallet.address,
    paymentUtxo: {
      txid: "0000000000000000000000000000000000000000000000000000000000000000",
      vout: 0,
      satoshi: 1000000000,
      codeType: AddressType.P2TR,
    },
    inscriptionValue,
    change: {
      address: senderWallet.address,
      value: changeValue,
    },
  });

  const fee = Math.ceil(dummyTx2Result.virtualSize * feeRate);
  const payAmount = fee + inscriptionValue + changeValue;

  // pay order
  const dummyTx1Result = generateSendBTCTx({
    wallet: dummyUserWallet,
    utxos: dummyUserUtxos,
    toAddress: dummyTx2Result.payAddress,
    toAmount: payAmount,
    feeRate,
  });

  // sendInscription
  const dummyTx3Result = generateSendInscriptionTx({
    inscriptionWallet: dummyUserWallet,
    inscriptionUtxo: {
      txid: dummyTx2Result.txid,
      vout: 0,
      satoshi: inscriptionValue,
      codeType: AddressType.P2TR,
      scriptPk: dummyUserWallet.scriptPk,
    },
    btcWallet: senderWallet,
    btcUtxos: [
      {
        txid: dummyTx2Result.txid,
        vout: 1,
        satoshi: changeValue,
        codeType: senderWallet.addressType,
        scriptPk: senderWallet.scriptPk,
      },
    ],
    feeRate,
    to: {
      type: "address",
      address: delegateWallet.address,
    },
    disableChange: true,
  });

  const dummyPsbt3 = bitcoin.Psbt.fromHex(dummyTx3Result.psbtHex, { network });
  dummyTx3Result.toSignInputs.forEach((v) => {
    if (v.address === dummyUserWallet.address) {
      dummyUserWallet.signPsbtInput(dummyPsbt3, v.index);
    } else if (v.address === senderWallet.address) {
      senderWallet.signPsbtInput(dummyPsbt3, v.index);
    }
  });
  dummyPsbt3.finalizeAllInputs();
  const virtualSize3 = dummyPsbt3.extractTransaction(true).virtualSize();

  const orderPayment = Math.ceil(
    (dummyTx2Result.virtualSize + virtualSize3) * feeRate + userWallet.dust
  );

  const txs: { txid: string; psbtHex: string }[] = [];

  // pay order
  const sendBTCTxResult = generateSendBTCTx({
    wallet: userWallet,
    utxos: userUtxos,
    toAddress: dummyTx2Result.payAddress,
    toAmount: orderPayment,
    feeRate,
  });

  // inscribe
  const inscribeTxResult = generateInscribeTx({
    inscribeWallet,
    content,
    paymentUtxo: {
      txid: sendBTCTxResult.txid,
      vout: 0,
      satoshi: orderPayment,
      codeType: AddressType.P2TR,
    },
    inscriptionValue,
    change: {
      address: senderWallet.address,
      value: Math.floor(virtualSize3 * feeRate),
    },
    toAddress: userWallet.address,
  });

  const sendInscriptionTxResult = generateSendInscriptionTx({
    inscriptionWallet: userWallet,
    inscriptionUtxo: {
      txid: inscribeTxResult.txid,
      vout: 0,
      satoshi: inscriptionValue,
      codeType: userWallet.addressType,
      scriptPk: userWallet.scriptPk,
    },
    btcWallet: senderWallet,
    btcUtxos: [
      {
        txid: inscribeTxResult.txid,
        vout: 1,
        satoshi: inscribeTxResult.change.value,
        codeType: senderWallet.addressType,
        scriptPk: senderWallet.scriptPk,
      },
    ],
    feeRate,
    to: {
      type: "address",
      address: delegateWallet.address,
    },
    disableChange: true,
  });

  return {
    inscriptionId: inscribeTxResult.inscriptionId,
    payAmount: orderPayment,
    tx1: {
      txid: sendBTCTxResult.txid,
      psbtHex: sendBTCTxResult.psbtHex,
      toSignInputs: sendBTCTxResult.toSignInputs,
    },
    tx2: {
      txid: inscribeTxResult.txid,
      psbtHex: inscribeTxResult.psbtHex,
      rawtx: inscribeTxResult.rawtx,
    },
    tx3: {
      txid: sendInscriptionTxResult.txid,
      psbtHex: sendInscriptionTxResult.psbtHex,
      toSignInputs: sendInscriptionTxResult.toSignInputs,
    },
  };
}
