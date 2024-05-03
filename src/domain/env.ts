import { decimalCal } from "../contract/bn";
import { ContractConfig } from "../types/domain";
import { MAX_HEIGHT } from "./constant";
import { need } from "./utils";

export class Env {
  private newestHeight = 0;
  private btcPrice = 0;
  private feeRate = 0;
  private gasTickPrice = 0;
  private config: ContractConfig;

  get NewestHeight() {
    need(this.newestHeight > 0);
    return this.newestHeight;
  }

  get BtcPrice() {
    return this.btcPrice;
  }

  get SatsPrice() {
    return decimalCal([env.BtcPrice, "div", "100000000"]);
  }

  get FeeRate() {
    return this.feeRate;
  }

  get CurGasPrice() {
    return operator.CommitData.op.gas_price;
  }

  get ModuleInitParams() {
    return opBuilder.ModuleOp.init;
  }

  get Source() {
    return opBuilder.ModuleOp ? opBuilder.ModuleOp.source : config.source;
  }

  get GasTickPrice() {
    return this.gasTickPrice;
  }

  get ContractConfig(): ContractConfig {
    return this.config;
  }

  set ContractConfig(config: ContractConfig) {
    this.config = config;
  }

  get Sequencer() {
    return keyring.sequencerWallet.address;
  }

  async init() {
    await this.tick();
  }

  async tick() {
    const height = await api.blockHeight();
    if (height > 0 && height !== MAX_HEIGHT) {
      this.newestHeight = height;
    } else {
      logger.error({ tag: "bug-newest-height", height });
    }
    this.btcPrice = await api.btcPrice();
    this.feeRate = await api.feeRate();
    if (opBuilder.ModuleOp) {
      this.gasTickPrice = await api.tickPrice(this.ModuleInitParams.gas_tick);
    }
  }
}
