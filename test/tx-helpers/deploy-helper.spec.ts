import { expect } from "chai";
import { describe, it } from "mocha";
import { Wallet, bitcoin } from "../../src/lib/bitcoin";
import {
  generateDeployContractTxs,
  generateDeployModuleTxs,
} from "../../src/lib/tx-helpers";
import { UTXO } from "../../src/types/api";
import { AddressType } from "../../src/types/domain";
import { DeployOp, OpType } from "../../src/types/op";

const dummy_op: DeployOp = {
  p: "brc20-swap",
  op: "deploy" as OpType.deploy,
};
const dummy_txid =
  "0000000000000000000000000000000000000000000000000000000000000000";
let moduleWallet: Wallet;
let inscribeWallet: Wallet;
let btcWallet: Wallet;
describe("deploy-helper", () => {
  before(async () => {
    global.network = bitcoin.networks.testnet;
    moduleWallet = Wallet.fromRandomLikeAddressType(AddressType.P2TR);
    inscribeWallet = Wallet.fromRandomLikeAddressType(AddressType.P2TR);
    btcWallet = Wallet.fromRandomLikeAddressType(AddressType.P2WPKH);
  });

  it("generateDeployModuleTxs", async () => {
    const btcUtxos: UTXO[] = [
      {
        txid: dummy_txid,
        vout: 0,
        satoshi: 100000,
        codeType: btcWallet.addressType,
        scriptPk: btcWallet.scriptPk,
      },
    ];

    const feeRate = 1;
    const { inscriptionId, tx1, tx2 } = generateDeployModuleTxs({
      op: dummy_op,
      moduleWallet,
      inscribeWallet,
      btcWallet,
      btcUtxos,
      feeRate,
    });

    const psbt1 = bitcoin.Psbt.fromHex(tx1.psbtHex, { network });
    tx1.toSignInputs.forEach((v) => {
      btcWallet.signPsbtInput(psbt1, v.index);
    });
    psbt1.finalizeAllInputs();

    expect(psbt1.extractTransaction(true).getId()).to.eq(tx1.txid);
    expect(psbt1.getFeeRate()).to.eq(feeRate);
  });

  it("generateDeployContractTxs", async () => {
    const btcUtxos: UTXO[] = [
      {
        txid: dummy_txid,
        vout: 0,
        satoshi: 100000,
        codeType: btcWallet.addressType,
        scriptPk: btcWallet.scriptPk,
      },
    ];

    const feeRate = 1;
    const { inscriptionId, tx1, tx2 } = generateDeployContractTxs({
      content: "",
      moduleWallet,
      inscribeWallet,
      btcWallet,
      btcUtxos,
      feeRate,
    });

    const psbt1 = bitcoin.Psbt.fromHex(tx1.psbtHex, { network });
    tx1.toSignInputs.forEach((v) => {
      btcWallet.signPsbtInput(psbt1, v.index);
    });
    psbt1.finalizeAllInputs();

    expect(psbt1.extractTransaction(true).getId()).to.eq(tx1.txid);
    expect(psbt1.getFeeRate()).to.eq(feeRate);
  });
});
