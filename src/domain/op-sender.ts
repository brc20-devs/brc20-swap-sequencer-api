import { CommitOp, OpEvent } from "../types/op";
import { need } from "./utils";

import { Wallet, bitcoin, printPsbt } from "../lib/bitcoin";
import { generateCommitTxs } from "../lib/tx-helpers/commit-helper";
import { UTXO } from "../types/api";
import { printErr } from "../utils/utils";
import { MAX_HEIGHT } from "./constant";
import { CodeEnum } from "./error";

export class OpSender {
  private wallet: Wallet;
  private commiting = false;
  private lastCommitOp: CommitOp;
  private lastInscriptionId: string;
  private currentHeight = 0;
  private tryCommitCount = 0;

  get TryCommitCount() {
    return this.tryCommitCount;
  }

  get Committing() {
    const ret = this.commiting;
    if (ret)
      logger.info({
        tag: "commiting-info",
        commiting: this.commiting,
        parent: operator.CommitData.op.parent,
      });

    return ret;
  }

  get LastCommitOp() {
    return this.lastCommitOp;
  }

  get LastInscriptionId() {
    return this.lastInscriptionId;
  }

  constructor() {}

  async init() {
    const res = await opCommitDao.findLastCommitOp();
    this.lastCommitOp = res?.op;
    this.lastInscriptionId = res?.inscriptionId || "";
    if (!this.lastCommitOp) {
      this.lastCommitOp = (opBuilder.LastCommitOpEvent?.op as any) || null;
      this.lastInscriptionId = opBuilder.LastCommitOpEvent?.inscriptionId || "";
    }
  }

  async rebuild(from: OpEvent) {
    // TODO
  }

  async createCommit(op: CommitOp) {
    console.log("commit begin");
    this.commiting = true;

    let canWaitNextTurn = true;
    // const opSize = JSON.stringify(op).length;
    // if (opSize > MAX_OP_SIZE) {
    //   canWaitNextTurn = false;
    // }

    let successCommit = false;
    this.tryCommitCount++;

    try {
      let feeRate = 1;
      try {
        feeRate = await api.feeRate();
      } catch (e) {
        need(false, null, CodeEnum.internal_api_error);
      }
      feeRate = feeRate * config.commitFeeRateRatio;

      const utxoA = (
        await sequencerUtxoDao.find(
          {
            status: "confirmed",
            used: "unused",
            purpose: "inscribe",
          },
          { sort: { satoshi: -1 } }
        )
      )[0];
      logger.info({ tag: "utxoA", utxoA });

      need(!!utxoA, "utxoA not enough", CodeEnum.sequencer_insufficient_funds);

      const utxoB = (
        await sequencerUtxoDao.find(
          {
            status: "confirmed",
            used: "unused",
            purpose: "activate",
          },
          { sort: { satoshi: -1 } }
        )
      )[0];
      logger.info({ tag: "utxoB", utxoB });

      need(!!utxoB, "utxoB not enough", CodeEnum.sequencer_insufficient_funds);

      const utxoC = await sequencerUtxoDao.findOne({
        used: "unused",
        purpose: "sequence",
      });
      logger.info({ tag: "utxoC", utxoC });

      need(!!utxoC, "utxoC not enough", CodeEnum.sequencer_insufficient_funds);

      let btcUtxosA: UTXO[] = [utxoA];
      let btcUtxosB: UTXO[] = [utxoB];
      let sequencerWallet: Wallet = keyring.sequencerWallet;
      let inscribeWallet: Wallet = keyring.deriveFromRootWallet(
        sequencerWallet.address,
        "inscribe"
      );
      let btcWallet: Wallet = keyring.btcWallet;
      let seqWallet: Wallet = keyring.btcWallet;
      let seqUtxo: UTXO = utxoC;

      logger.info({ tag: "commit-txs", feeRate, utxoA, utxoB, utxoC });

      const commitResult = generateCommitTxs({
        op,
        sequencerWallet,
        inscribeWallet,
        btcWallet,
        btcUtxosA,
        btcUtxosB,
        seqWallet,
        seqUtxo,
        feeRate,
      });
      await sequencerUtxoDao.updateOne(
        {
          txid: utxoA.txid,
          vout: utxoA.vout,
        },
        {
          $set: {
            used: "locked",
          },
        }
      );
      await sequencerUtxoDao.updateOne(
        {
          txid: utxoB.txid,
          vout: utxoB.vout,
        },
        {
          $set: {
            used: "locked",
          },
        }
      );

      await sequencerUtxoDao.updateOne(
        {
          txid: utxoC.txid,
          vout: utxoC.vout,
        },
        {
          $set: {
            used: "locked",
          },
        }
      );

      await sequencerUtxoDao.insert(
        Object.assign(commitResult.nextBtcUtxoA, {
          used: "unused",
          status: "unconfirmed",
          purpose: "inscribe",
        }) as any
      );

      await sequencerUtxoDao.insert(
        Object.assign(commitResult.nextBtcUtxoB, {
          used: "unused",
          status: "unconfirmed",
          purpose: "activate",
        }) as any
      );

      await sequencerUtxoDao.insert(
        Object.assign(commitResult.nextSeqUtxo, {
          used: "unused",
          status: "unconfirmed",
          purpose: "sequence",
        }) as any
      );

      // sequencerWallet sign with API

      const psbt1 = bitcoin.Psbt.fromHex(commitResult.tx1.psbtHex, { network });
      commitResult.tx1.toSignInputs.forEach((v) => {
        btcWallet.signPsbtInput(psbt1, v.index);
      });
      psbt1.finalizeAllInputs();
      printPsbt(psbt1);

      let psbt2 = bitcoin.Psbt.fromHex(commitResult.tx2.psbtHex, { network });
      let psbt3 = bitcoin.Psbt.fromHex(commitResult.tx3.psbtHex, { network });

      if (sequencerWallet.isWatchOnly()) {
        commitResult.tx3.toSignInputs.forEach((v) => {
          if (v.address === seqWallet.address) {
            seqWallet.signPsbtInput(psbt3, v.index);
          } else if (v.address === btcWallet.address) {
            btcWallet.signPsbtInput(psbt3, v.index);
          }
        });
        const newPsbtHex = await keyring.signPsbtBySequencerWallet(
          psbt3.toHex(),
          commitResult.tx3.toSignInputs.filter(
            (v) => v.address === sequencerWallet.address
          )
        );
        psbt3 = bitcoin.Psbt.fromHex(newPsbtHex, { network });
      } else {
        commitResult.tx3.toSignInputs.forEach((v) => {
          if (v.address === sequencerWallet.address) {
            sequencerWallet.signPsbtInput(psbt3, v.index);
          } else if (v.address === seqWallet.address) {
            seqWallet.signPsbtInput(psbt3, v.index);
          } else if (v.address === btcWallet.address) {
            btcWallet.signPsbtInput(psbt3, v.index);
          }
        });
      }

      psbt3.finalizeAllInputs();
      printPsbt(psbt3);

      const txs = [
        {
          txid: commitResult.tx1.txid,
          rawtx: psbt1.extractTransaction(true).toHex(),
          fee: psbt1.getFee(),
        },
        {
          txid: commitResult.tx2.txid,
          rawtx: commitResult.tx2.rawtx,
          fee: psbt2.getFee(),
        },
        {
          txid: commitResult.tx3.txid,
          rawtx: psbt3.extractTransaction(true).toHex(),
          fee: psbt3.getFee(),
        },
      ];

      let fatal_error = false;
      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        let success = true;
        try {
          await api.broadcast(tx.rawtx);
        } catch (err) {
          printErr("createCommit-pushtx", err);
          success = false;
          if (
            err.message.includes("conflict") ||
            err.message.includes("missing")
          ) {
            fatal_error = true;
          }
        }
        await sequencerTxDao.insert({
          inscriptionId: commitResult.inscriptionId,
          txid: tx.txid,
          rawtx: tx.rawtx,
          status: success ? "unconfirmed" : "pending",
          height: 0,
          feeRate,
          fee: tx.fee,
        });
      }

      if (fatal_error) {
        canWaitNextTurn = false;
        global.fatal = true;
        throw new Error("Stop Commiting");
      }

      await opCommitDao.upsertByParent(op.parent, {
        inscriptionId: commitResult.inscriptionId,
        txid: commitResult.tx3.txid,
      });
      this.lastInscriptionId = commitResult.inscriptionId;
      this.lastCommitOp = op;

      successCommit = true;
      this.tryCommitCount = 0;
    } finally {
      console.log("commit finish");
      if (successCommit) {
        this.commiting = false;
      } else {
        if (canWaitNextTurn) {
          // let's commit in next turn
          this.commiting = false;
        } else {
          // no fatal error
          this.commiting = true;
        }
      }
    }
  }

  // check if new block is mined
  async checkNewBlock() {
    const blockHeight = await api.blockHeight();
    if (blockHeight !== this.currentHeight) {
      this.currentHeight = blockHeight;
      await this.tickNewBlock();
    }
  }

  // trigger when new block is mined
  async tickNewBlock() {
    console.log("tickNewBlock");
    // update sequencer utxo status
    // unconfrimed -> confirmed
    try {
      const utxos = await sequencerUtxoDao.find({
        status: "unconfirmed",
      });
      for (let i = 0; i < utxos.length; i++) {
        const utxo = utxos[i];
        try {
          console.log("checking utxo", utxo.txid, utxo.vout, utxo.satoshi);
          const txInfo = await api.txInfo(utxo.txid);
          if (txInfo.height !== MAX_HEIGHT) {
            const matchedCount = await sequencerUtxoDao.updateOne(
              { txid: utxo.txid, vout: utxo.vout },
              { $set: { status: "confirmed" } }
            );
            console.log("utxo confirmed", utxo.txid, utxo.vout, matchedCount);
          } else {
            console.log("utxo unconfirmed", utxo.txid, utxo.vout);
          }
        } catch (e) {
          console.log("utxo update failed", utxo.txid, utxo.vout, e);
        }
      }
    } catch (err) {
      printErr("op-sender update sequencer utxo failed", err);
    }

    // update commit txs status
    // pending -> unconfirmed
    try {
      const txs = await sequencerTxDao.find({ status: "pending" });
      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        try {
          await api.broadcast(tx.rawtx);
          await sequencerTxDao.updateOne(
            { txid: tx.txid },
            { $set: { status: "unconfirmed" } }
          );
        } catch (e) {
          if (e.message == "Transaction already in block chain") {
            await sequencerTxDao.updateOne(
              { txid: tx.txid },
              { $set: { status: "unconfirmed", height: MAX_HEIGHT } }
            );
          }
        }
      }
    } catch (err) {
      printErr("op-sender", err);
    }

    // update commit txs status
    // unconfirmed -> confirmed
    try {
      const txs = await sequencerTxDao.find({ status: "unconfirmed" });
      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i];
        const info = await api.txInfo(tx.txid);
        if (info && info.height !== MAX_HEIGHT) {
          await sequencerTxDao.updateOne(
            { txid: tx.txid },
            { $set: { status: "confirmed", height: info.height } }
          );
        }
      }
    } catch (err) {
      printErr("op-sender", err);
    }
  }

  // trigger every 3 seconds
  async tick() {
    try {
      await this.checkNewBlock();

      const A = await sequencerUtxoDao.find(
        {
          status: "confirmed",
          used: "unused",
          purpose: "inscribe",
        },
        { sort: { satoshi: -1 } }
      );
      const B = await sequencerUtxoDao.find(
        {
          status: "confirmed",
          used: "unused",
          purpose: "activate",
        },
        { sort: { satoshi: -1 } }
      );
      metric.nextUtxoA.set(A[0] ? A[0].satoshi : 0);
      metric.nextUtxoB.set(B[0] ? B[0].satoshi : 0);
      metric.estimatedCostUtxoB.set(env.FeeRate * 320);
      const opSize = JSON.stringify(operator.CommitData.op).length;
      metric.estimatedCostUtxoA.set((153 + 109 + opSize / 4) * env.FeeRate);

      let res = await sequencerUtxoDao.find({
        status: "confirmed",
        used: "unused",
      });
      let total = 0;
      for (let i = 0; i < res.length; i++) {
        const item = res[i];
        total += item.satoshi;
      }
      metric.totalUtxoBalance.set(total);

      const res2 = await sequencerTxDao.find({});
      total = 0;
      for (let i = 0; i < res2.length; i++) {
        const item = res2[i];
        if (item.fee) {
          total += item.fee;
        }
      }
      metric.costUtxoBalance.set(total);
    } catch (err) {
      printErr("op-sender checkNewBlock failed", err);
    }
  }
}
