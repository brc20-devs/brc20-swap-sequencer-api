import * as bitcoin from "bitcoinjs-lib";
import { Psbt } from "bitcoinjs-lib";
import { ECPair } from ".";
import {
  PsbtInputExtended,
  PsbtOutputExtendedAddress,
  PsbtOutputExtendedScript,
} from "../types/psbt";

/**
 * Virtual PSBT
 * For building a PSBT
 */
export class VPsbt {
  readonly inputs: PsbtInputExtended[] = [];
  readonly outputs: (PsbtOutputExtendedAddress | PsbtOutputExtendedScript)[] =
    [];

  constructor() {}

  addInput(inputData: PsbtInputExtended): this {
    this.inputs.push(inputData);
    return this;
  }

  updateInput(inputIndex: number, updateData: PsbtInputExtended): this {
    this.inputs[inputIndex] = updateData;
    return this;
  }

  /**
   * Add an OP_RETURN Output
   */
  addOpReturn(inputData: { buffers: Buffer[]; value: number }) {
    const embed = bitcoin.payments.embed({ data: inputData.buffers });
    this.outputs.push({
      script: embed.output,
      value: inputData.value,
    });
  }

  /**
   * Add an output
   */
  addOutput(
    outputData: PsbtOutputExtendedAddress | PsbtOutputExtendedScript
  ): this {
    this.outputs.push(outputData);
    return this;
  }

  getLeftAmount() {
    const totalInput = this.inputs.reduce(
      (pre, cur) => pre + cur.witnessUtxo.value,
      0
    );
    const totalOutput = this.outputs.reduce((pre, cur) => pre + cur.value, 0);
    return totalInput - totalOutput;
  }

  /**
   * Update an output
   */
  updateOutput(
    outputIndex: number,
    updateData: PsbtOutputExtendedAddress | PsbtOutputExtendedScript
  ): this {
    this.outputs[outputIndex] = updateData;
    return this;
  }

  /**
   * Remove an output
   */
  emptyOutput(outputIndex: number): this {
    this.outputs[outputIndex] = null;
    return this;
  }

  /**
   * Estimate the network fee of commit transaction
   * For each input ,the simulated signature has a discrepancy of 3 bytes compared to the actual signature.
   * Estimating the size needs to account for this error.
   */
  estimateNetworkFee(feeRate: number) {
    const psbt = this.getSimSigPsbt();
    const vSize = psbt.extractTransaction(true).virtualSize();
    const diff = 3; // 3 bytes discrepancy for each input
    return Math.ceil((vSize + psbt.inputCount * diff) * feeRate);
  }

  /**
   * Convert to a standard PSBT
   */
  toPsbt(): bitcoin.Psbt {
    const psbt = new bitcoin.Psbt({ network });
    const inLength = this.inputs.length;
    const outLength = this.outputs.length;

    for (let i = 0; i < outLength; i++) {
      if (this.outputs[i]) {
        psbt.addOutput(this.outputs[i]);
      }
    }
    for (let i = 0; i < inLength; i++) {
      if (this.inputs[i]) {
        psbt.addInput(this.inputs[i]);
      }
    }
    return psbt;
  }

  /**
   * Generate a simulated signed PSBT to estimate fee
   */
  private getSimSigPsbt() {
    const psbt = this.toPsbt();
    const psbtSim = psbt.clone();

    Psbt.ignoreVerifySig = true;
    const keyPairSim = ECPair.makeRandom({
      network,
    });
    psbtSim.signAllInputs(keyPairSim);
    psbtSim.finalizeAllInputs();
    Psbt.ignoreVerifySig = false;

    return psbtSim;
  }
}
