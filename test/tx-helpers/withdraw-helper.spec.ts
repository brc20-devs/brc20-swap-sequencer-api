import { expect } from "chai";
import { describe, it } from "mocha";
import { Wallet, bitcoin } from "../../src/lib/bitcoin";
import { generateWithdrawTxs } from "../../src/lib/tx-helpers/withdraw-helper";
import { UTXO } from "../../src/types/api";
import { AddressType } from "../../src/types/domain";

let rootWallet: Wallet;
describe("withdraw-helper", () => {
  before(async () => {
    global.network = bitcoin.networks.testnet;
    rootWallet = Wallet.fromRandomLikeAddressType(AddressType.P2WPKH);
  });

  it("generateWithdrawTxs", async () => {
    const userWallet = Wallet.fromRandomLikeAddressType(AddressType.P2TR);
    const inscribeWallet = Wallet.fromRandomLikeAddressType(AddressType.P2TR);
    const delegateWallet = Wallet.fromRandomLikeAddressType(AddressType.P2TR);
    const senderWallet = Wallet.fromRandomLikeAddressType(AddressType.P2TR);
    const utxos: UTXO[] = [];
    for (let i = 0; i < 1; i++) {
      utxos.push({
        txid: "0000000000000000000000000000000000000000000000000000000000000000",
        vout: i,
        satoshi: 100000,
        codeType: userWallet.addressType,
        scriptPk: userWallet.scriptPk,
      });
    }

    const feeRate = 1;
    const result = generateWithdrawTxs({
      op: {
        p: "brc20-swap",
        op: "conditional-approve",
        tick: "ordi",
        amt: "10",
        module: "",
      },
      userWallet,
      inscribeWallet,
      delegateWallet,
      senderWallet,
      feeRate,
      userUtxos: utxos,
    });
    const psbt1 = bitcoin.Psbt.fromHex(result.tx1.psbtHex, { network });
    result.tx1.toSignInputs.forEach((v) => {
      userWallet.signPsbtInput(psbt1, v.index);
    });
    psbt1.finalizeAllInputs();
    expect(psbt1.getFeeRate()).to.eq(feeRate);
    expect(psbt1.extractTransaction(true).getId()).to.eq(result.tx1.txid);

    const psbt3 = bitcoin.Psbt.fromHex(result.tx3.psbtHex, { network });
    result.tx3.toSignInputs.forEach((v) => {
      if (v.address === userWallet.address) {
        userWallet.signPsbtInput(psbt3, v.index);
      } else if (v.address === senderWallet.address) {
        senderWallet.signPsbtInput(psbt3, v.index);
      }
    });
    psbt3.finalizeAllInputs();
    const tx3 = psbt3.extractTransaction();
    expect(psbt3.getFeeRate()).to.eq(feeRate);
    expect(tx3.getId()).to.eq(result.tx3.txid);
  });
});
