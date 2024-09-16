import { decimalCal } from "../contract/bn";
import { ContractConfig } from "../types/domain";
import { UNCONFIRM_HEIGHT } from "./constant";
import { need } from "./utils";

const TAG = "env";

export class Env {
  private newestHeight = 0;
  private btcPrice = 0;
  private feeRate = 0;
  private lastUpdateFeeRateTime: number = Date.now();
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
    return operator.NewestCommitData.op.gas_price;
  }

  get ModuleInitParams() {
    return builder.ModuleOp.init;
  }

  get Source() {
    return builder.ModuleOp ? builder.ModuleOp.source : config.source;
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
    const height = await api.blockHeight();
    need(height > 0 && height !== UNCONFIRM_HEIGHT);
    this.newestHeight = height;
    this.btcPrice = await api.btcPrice();
    await this.updateFeeRate();
    if (builder.ModuleOp) {
      this.gasTickPrice = await api.tickPrice(this.ModuleInitParams.gas_tick);
    }
  }

  async tick() {
    const height = await api.blockHeight();
    if (height > 0 && height !== UNCONFIRM_HEIGHT) {
      this.newestHeight = height;
    } else {
      logger.error({ tag: TAG, msg: "newest height fail", height });
    }
    this.btcPrice = await api.btcPrice();
    await this.updateFeeRate();
    if (builder.ModuleOp) {
      this.gasTickPrice = await api.tickPrice(this.ModuleInitParams.gas_tick);
    }
  }

  async updateFeeRate() {
    const curFeeRate = await api.feeRate();

    const res = await feeRateDao.find({}, { sort: { _id: -1 }, limit: 10 });
    const avgFeeRate = res.length
      ? res.reduce((a, b) => {
          return a + b.feeRate;
        }, 0) / res.length || 0
      : 0;

    this.feeRate = Math.max(config.minFeeRate, curFeeRate, avgFeeRate);

    if (Date.now() - this.lastUpdateFeeRateTime > 30_000) {
      await feeRateDao.insert({
        feeRate: curFeeRate,
        height: this.newestHeight,
        timestamp: Date.now(),
      });
    }
  }
}
