import _ from "lodash";
import hash from "object-hash";
import {
  bn,
  bnDecimal,
  bnDecimalPlacesValid,
  bnUint,
  decimalCal,
  uintCal,
} from "../contract/bn";
import {
  convertPairStrV2ToPairStrV1,
  getPairStrV2,
} from "../contract/contract-utils";
import { OpCommitData } from "../dao/commit-dao";
import { EventType } from "../types/api";
import { OridinalMsg } from "../types/domain";
import {
  ContractResult,
  ExactType,
  FuncType,
  InternalFunc,
  Result,
} from "../types/func";
import { CommitOp, OpEvent, OpType } from "../types/op";
import {
  FuncReq,
  QuoteAddLiqReq,
  QuoteAddLiqRes,
  QuoteRemoveLiqReq,
  QuoteRemoveLiqRes,
  QuoteSwapReq,
  QuoteSwapRes,
} from "../types/route";
import { isProportional, lastItem, sleep } from "../utils/utils";
import { LP_DECIMAL, PENDING_CURSOR, UNCONFIRM_HEIGHT } from "./constant";
import {
  convertFuncInscription2Internal,
  convertFuncInternal2Inscription,
  convertReq2Arr,
  convertReq2Map,
} from "./convert-struct";
import {
  CodeEnum,
  insufficient_liquidity,
  invalid_amount,
  maximum_precision,
  pool_not_found,
  sign_fail,
  system_commit_in_progress_1,
  system_commit_in_progress_2,
  system_fatal_error,
  system_recovery_in_progress,
  wait_for_rollup,
} from "./error";
import { getSignMsg, isSignVerify } from "./sign";
import { Space, SpaceType } from "./space";
import {
  checkAccess,
  checkAddressType,
  checkAmount,
  checkFuncReq,
  getTickUsdPrice,
  isLp,
  maxAmount,
  need,
  record,
} from "./utils";

function getPrecisionTip(tick: string, decimal: string) {
  return `${maximum_precision} ${tick}: ${decimal}`;
}

const TAG = "operator";

export class Operator {
  private pendingSpace: Space;
  private newestCommitData: OpCommitData;
  private firstAggregateTimestamp: number;
  private lastAggregateTimestamp: number;

  get NewestCommitData() {
    return this.newestCommitData;
  }

  get PendingSpace() {
    return this.pendingSpace;
  }

  get LastAggregateTimestamp() {
    return this.lastAggregateTimestamp;
  }

  constructor() {}

  private async getUnConfirmedCommitDataFrom(inscriptionId: string) {
    let ret = await opCommitDao.findFrom({ inscriptionId }, false);
    // need(ret.length > 0, null, null, true);

    // use memory data
    ret = ret.filter((item) => {
      return item.op.parent !== this.NewestCommitData.op.parent;
    });
    if (!config.readonly) {
      ret.push(this.NewestCommitData);
    }
    return ret;
  }

  private async getUnConfirmedOpCommitData() {
    let ret = await opCommitDao.findNotInIndexer();

    // use memory data
    ret = ret.filter((item) => {
      return item.op.parent !== this.NewestCommitData.op.parent;
    });
    ret.push(this.NewestCommitData);
    return ret;
  }

  async getUnConfirmedOpCommitIds() {
    const res = await opCommitDao.findNotInIndexer();
    let ret = res.map((v) => v.inscriptionId);
    ret = ret.filter((a) => {
      return !!a;
    });
    return ret;
  }

  private async getVerifyCommits(newestCommit: CommitOp) {
    let arr = await this.getUnConfirmedOpCommitData();
    let commits = arr.map((item) => {
      return item.op;
    });

    // use memory data
    commits = commits.filter((item) => {
      return item.parent !== newestCommit.parent;
    });
    commits.push(newestCommit);

    return commits;

    // let ret = commits.map((item) => {
    //   return JSON.stringify(item);
    // });
    // return ret;
  }

  async init() {
    this.lastAggregateTimestamp = Date.now();
    if (this.NewestCommitData.op.data.length > 0) {
      this.firstAggregateTimestamp = this.NewestCommitData.op.data[0].ts * 1000;
      this.lastAggregateTimestamp =
        lastItem(this.NewestCommitData.op.data).ts * 1000;
    } else {
      this.lastAggregateTimestamp = Date.now();
    }
  }

  async handleEvent(event: OpEvent, handleCommit: boolean) {
    if (event.op.op == OpType.commit) {
      logger.debug({
        tag: TAG,
        msg: "handle op commit",
        parent: (event.op as CommitOp).parent,
      });
    }
    let result: ContractResult[] = [];

    // The commit may have already been pre-processed in the aggregation operation
    if (event.op.op == OpType.commit && !handleCommit) {
      this.pendingSpace.checkAndUpdateEventCoherence(event);
    } else {
      result = this.pendingSpace.handleEvent(event);

      // update asset dao
      try {
        await mongoUtils.startTransaction(async () => {
          const assetList = this.pendingSpace.NotifyDataCollector.AssetList;
          for (let i = 0; i < assetList.length; i++) {
            const item = assetList[i];
            let tickDecimal: string;
            if (isLp(item.raw.tick)) {
              tickDecimal = LP_DECIMAL;
            } else {
              tickDecimal = decimal.get(item.raw.tick);
            }
            await assetDao.upsertData({
              assetType: item.raw.assetType,
              tick: item.raw.tick,
              address: item.raw.address,
              balance: item.raw.balance,
              cursor: PENDING_CURSOR,
              height: UNCONFIRM_HEIGHT,
              commitParent: this.newestCommitData.op.parent,
              displayBalance: bnDecimal(item.raw.balance, tickDecimal),
            });
            await assetSupplyDao.upsertData({
              cursor: PENDING_CURSOR,
              height: UNCONFIRM_HEIGHT,
              commitParent: this.newestCommitData.op.parent,
              tick: item.raw.tick,
              assetType: item.raw.assetType,
              supply:
                this.pendingSpace.Assets.dataRefer()[item.raw.assetType][
                  item.raw.tick
                ].Supply,
            });
          }
        });
        this.pendingSpace.NotifyDataCollector.reset(
          this.pendingSpace.LastHandledApiEvent.cursor
        );
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "asset-update-fail-3",
          error: err.message,
          stack: err.stack,
        });
      }
    }
    return result;
  }

  async resetPendingSpace(space: Space) {
    /**
     * Under what circumstances would the pendingSpace be reset:
     * - Initialization at startup
     * - Reorganization
     * - Loss of the memory pool
     */
    this.pendingSpace = new Space(
      space.snapshot(),
      env.ContractConfig,
      space.LastCommitId,
      space.LastHandledApiEvent,
      true, // note
      SpaceType.pending
    );

    // init
    if (!this.newestCommitData) {
      const lastCommit = (await opCommitDao.find({}, { sort: { _id: -1 } }))[0];
      if (!lastCommit) {
        const priceInfo = await this.calculateCurPriceInfo();
        const parent = space.LastCommitId;
        const gas_price = this.getAdjustedGasPrice(priceInfo.gasPrice);
        this.newestCommitData = {
          op: {
            p: "brc20-swap",
            op: OpType.commit,
            module: config.moduleId,
            parent,
            quit: "",
            gas_price,
            data: [],
          },
          feeRate: priceInfo.feeRate,
          satsPrice: priceInfo.satsPrice,
          result: [],
        };
        await this.trySave();
      } else {
        this.newestCommitData = lastCommit;
        await this.tryNewCommitOp();
      }
    }

    // update unconfirmed commit op
    const res = await this.getUnConfirmedCommitDataFrom(space.LastCommitId);

    for (let i = 0; i < res.length; i++) {
      const event: OpEvent = {
        op: res[i].op,
        inscriptionId: res[i].inscriptionId,
        height: UNCONFIRM_HEIGHT, // TOCHECK: NewestHeight
        cursor: PENDING_CURSOR,
        valid: true,
        event: EventType.commit,
        from: null,
        to: null,
        inscriptionNumber: null,
        blocktime: null,
        txid: null,
        data: null,
      };
      let result = await this.handleEvent(event, true);

      // recalculate newest result
      if (i == res.length - 1) {
        if (!config.readonly) {
          need(this.newestCommitData.op.parent == (event.op as any).parent);
          this.newestCommitData.result = result.map((item) => {
            return item.result;
          });
        }
      }
    }
  }

  async tick() {
    this.pendingSpace.tick();

    if (config.readonly) {
      return;
    }

    await this.trySave();
    await this.tryCommit();
    await this.tryNewCommitOp();
  }

  async quoteSwap(req: QuoteSwapReq): Promise<QuoteSwapRes> {
    const { tickIn, tickOut, amount, exactType } = req;
    const pair = getPairStrV2(tickIn, tickOut);
    const assets = this.PendingSpace.Assets;
    const contract = this.PendingSpace.Contract;

    // await this.mutex.waitForUnlock();

    need(bn(amount).lt(maxAmount), invalid_amount);
    need(bn(amount).gt("0"), invalid_amount);

    need(this.pendingSpace.Assets.isExist(pair), pool_not_found);

    // prevent insufficient balance error
    const decimalIn = decimal.get(tickIn);
    const decimalOut = decimal.get(tickOut);
    const poolAmountIn = assets.get(tickIn).balanceOf(pair);
    const poolAmountOut = assets.get(tickOut).balanceOf(pair);

    let expect: string;
    let amountUSD: string;
    let expectUSD: string;
    if (exactType == ExactType.exactIn) {
      need(
        bnDecimalPlacesValid(amount, decimalIn),
        getPrecisionTip(tickIn, decimalIn)
      );
      expect = contract.getAmountOut({
        amountIn: bnUint(amount, decimalIn),
        reserveIn: poolAmountIn,
        reserveOut: poolAmountOut,
      });
      expect = bnDecimal(expect, decimalOut);
      amountUSD = await getTickUsdPrice(tickIn, amount);
      expectUSD = await getTickUsdPrice(tickOut, expect);
    } else {
      const amountOut = bnUint(amount, decimalOut);
      need(bn(amountOut).lt(poolAmountOut), insufficient_liquidity);
      expect = contract.getAmountIn({
        amountOut,
        reserveIn: poolAmountIn,
        reserveOut: poolAmountOut,
      });
      expect = bnDecimal(expect, decimalIn);
      amountUSD = await getTickUsdPrice(tickOut, amount);
      expectUSD = await getTickUsdPrice(tickIn, expect);
    }

    return { expect, amountUSD, expectUSD };
  }

  async quoteRemoveLiq(req: QuoteRemoveLiqReq): Promise<QuoteRemoveLiqRes> {
    const { tick0, tick1, lp } = req;
    need(bn(lp).lt(maxAmount), invalid_amount);
    need(bn(lp).gt("0"), invalid_amount);
    need(bnDecimalPlacesValid(lp, LP_DECIMAL), getPrecisionTip(lp, LP_DECIMAL));

    // await this.mutex.waitForUnlock();

    const decimal0 = decimal.get(tick0);
    const decimal1 = decimal.get(tick1);

    const lpInt = bnUint(lp, LP_DECIMAL);
    const pair = getPairStrV2(tick0, tick1);
    const assets = this.PendingSpace.Assets;
    const poolLp = uintCal([
      assets.get(pair).Supply,
      "add",
      this.PendingSpace.Contract.getFeeLp({ tick0, tick1 }),
    ]);
    const poolAmount0 = assets.get(tick0).balanceOf(pair);
    const poolAmount1 = assets.get(tick1).balanceOf(pair);
    let amount0 = uintCal([lpInt, "mul", poolAmount0, "div", poolLp]);
    let amount1 = uintCal([lpInt, "mul", poolAmount1, "div", poolLp]);
    amount0 = bnDecimal(amount0, decimal0);
    amount1 = bnDecimal(amount1, decimal1);

    return {
      tick0,
      tick1,
      amount0,
      amount1,
      amount0USD: await getTickUsdPrice(tick0, amount0),
      amount1USD: await getTickUsdPrice(tick1, amount1),
    };
  }

  async quoteAddLiq(req: QuoteAddLiqReq): Promise<QuoteAddLiqRes> {
    const { tick0, tick1, amount0: reqAmount0, amount1: reqAmount1 } = req;
    const decimal0 = decimal.get(tick0);
    const decimal1 = decimal.get(tick1);
    const pair = getPairStrV2(tick0, tick1);
    const assets = this.PendingSpace.Assets;

    // await this.mutex.waitForUnlock();

    if (!assets.isExist(pair) || assets.get(pair).Supply == "0") {
      checkAmount(reqAmount0, decimal0);
      checkAmount(reqAmount1, decimal1);

      const lp = uintCal([
        bnUint(reqAmount0, decimal0),
        "mul",
        bnUint(reqAmount1, decimal1),
        "sqrt",
        "sub",
        "1000",
      ]);

      return {
        amount0: reqAmount0,
        amount1: reqAmount1,
        amount0USD: await getTickUsdPrice(tick0, reqAmount0),
        amount1USD: await getTickUsdPrice(tick1, reqAmount1),
        lp: bnDecimal(lp, LP_DECIMAL),
        tick0PerTick1: decimalCal([reqAmount0, "div", reqAmount1]),
        tick1PerTick0: decimalCal([reqAmount1, "div", reqAmount0]),
        shareOfPool: "1",
      };
    } else {
      need(!reqAmount0 || !reqAmount1);
      const poolLp = uintCal([
        assets.get(pair).Supply,
        "add",
        this.PendingSpace.Contract.getFeeLp({ tick0, tick1 }),
      ]);
      const poolAmount0 = assets.get(tick0).balanceOf(pair);
      const poolAmount1 = assets.get(tick1).balanceOf(pair);

      let lp: string;
      let amount0Int: string;
      let amount1Int: string;
      let amount0: string;
      let amount1: string;

      if (reqAmount0) {
        need(bn(reqAmount0).lt(maxAmount), invalid_amount);
        need(bn(reqAmount0).gt("0"), invalid_amount);
        need(
          bnDecimalPlacesValid(reqAmount0, decimal0),
          getPrecisionTip(tick0, decimal0)
        );

        amount0Int = bnUint(reqAmount0, decimal0);
        amount1Int = uintCal([
          amount0Int,
          "mul",
          poolAmount1,
          "div",
          poolAmount0,
        ]);
        const lp0 = uintCal([amount0Int, "mul", poolLp, "div", poolAmount0]);
        const lp1 = uintCal([amount1Int, "mul", poolLp, "div", poolAmount1]);
        lp = bn(lp0).lt(lp1) ? lp0 : lp1;

        amount0 = reqAmount0;

        if (isProportional(amount0Int, amount1Int)) {
          // if it is exactly proportional, then do not add the minimum value of 1
          amount1 = bnDecimal(amount1Int, decimal1);
        } else {
          // preventing the final actual execution from taking the calculated value on one side, resulting in the original input integer value becoming something like 0.9999999 [1]
          amount1 = bnDecimal(uintCal([amount1Int, "add", 1]), decimal1);
        }
      } else {
        need(bn(reqAmount1).lt(maxAmount), invalid_amount);
        need(bn(reqAmount1).gt("0"), invalid_amount);
        need(
          bnDecimalPlacesValid(reqAmount1, decimal1),
          getPrecisionTip(tick1, decimal1)
        );

        amount1Int = bnUint(reqAmount1, decimal1);
        amount0Int = uintCal([
          amount1Int,
          "mul",
          poolAmount0,
          "div",
          poolAmount1,
        ]);
        const lp0 = uintCal([amount0Int, "mul", poolLp, "div", poolAmount0]);
        const lp1 = uintCal([amount1Int, "mul", poolLp, "div", poolAmount1]);
        lp = bn(lp0).lt(lp1) ? lp0 : lp1;

        // same as above [1]
        if (isProportional(amount0Int, amount1Int)) {
          // if it is exactly proportional, then do not add the minimum value of 1
          amount0 = bnDecimal(amount0Int, decimal0);
        } else {
          amount0 = bnDecimal(uintCal([amount0Int, "add", 1]), decimal0);
        }
        amount1 = reqAmount1;
      }

      lp = bnDecimal(lp, LP_DECIMAL);

      checkAmount(amount0, decimal0);
      checkAmount(amount1, decimal1);
      checkAmount(lp, LP_DECIMAL);

      return {
        amount0,
        amount1,
        amount0USD: await getTickUsdPrice(tick0, amount0),
        amount1USD: await getTickUsdPrice(tick1, amount1),
        lp,
        tick0PerTick1: decimalCal([amount0, "div", amount1], decimal0),
        tick1PerTick0: decimalCal([amount1, "div", amount0], decimal1),
        shareOfPool: decimalCal([
          lp,
          "div",
          decimalCal([bnDecimal(poolLp, LP_DECIMAL), "add", lp]),
        ]),
      };
    }
  }

  async calculateCurPriceInfo(): Promise<{
    gasPrice: string;
    feeRate: string;
    satsPrice: string;
  }> {
    if (config.fixedGasPrice) {
      return {
        gasPrice: config.fixedGasPrice,
        feeRate: "",
        satsPrice: "",
      };
    }
    let satsPrice = (
      await api.tickPrice(env.ModuleInitParams.gas_tick)
    ).toString();

    const res2 = await opCommitDao.find({}, { sort: { _id: -1 }, limit: 2 });

    // limit price
    if (res2.length > 1 && res2[1].satsPrice) {
      let item = res2[1];
      let max = decimalCal([item.satsPrice, "mul", "1.5"]);
      let min = decimalCal([item.satsPrice, "mul", "0.5"]);
      if (bn(satsPrice).gt(max)) {
        satsPrice = max;
      }
      if (bn(satsPrice).lt(min)) {
        satsPrice = min;
      }
    }

    const feeRate = env.FeeRate.toString();
    const gasPrice = decimalCal(
      [feeRate, "div", satsPrice, "div", 4, "mul", config.commitFeeRateRatio], // 120% feeRate
      decimal.get(env.ModuleInitParams.gas_tick)
    );

    return { gasPrice, feeRate, satsPrice };
  }

  getSignMsg(req: FuncReq) {
    const address = req.req.address;
    const op = this.newestCommitData.op;
    checkAddressType(address);
    this.checkSystemStatus();
    const res: OridinalMsg[] = [];
    for (let i = 0; i < this.newestCommitData.op.data.length; i++) {
      const item = this.newestCommitData.op.data[i];
      if (item.addr == address) {
        res.push({
          module: this.newestCommitData.op.module,
          parent: this.newestCommitData.op.parent,
          quit: this.newestCommitData.op.quit,
          gas_price: this.newestCommitData.op.gas_price,
          addr: item.addr,
          func: item.func,
          params: item.params,
          ts: item.ts,
        });
      }
    }

    const ret = getSignMsg(
      res.concat({
        module: op.module,
        parent: op.parent,
        quit: op.quit,
        gas_price: op.gas_price,
        addr: address,
        ...convertReq2Arr(req),
        ts: req.req.ts,
      })
    );
    // logger.debug({
    //   tag: TAG,
    //   msg: "sign msg",
    //   commitParent: op.parent,
    //   ...ret,
    // });

    return ret;
  }

  private checkSystemStatus() {
    need(
      !this.reachCommitCondition(),
      system_commit_in_progress_1,
      CodeEnum.commiting
    );
    need(!sender.Committing, system_commit_in_progress_2, CodeEnum.commiting);
    need(
      !this.newestCommitData.inscriptionId,
      system_commit_in_progress_2,
      CodeEnum.commiting
    );
    need(!builder.IsResetPendingSpace, system_recovery_in_progress);
    need(!fatal, system_fatal_error, CodeEnum.fatal_error);
  }

  private /** @note must sync */ __aggregate(req: FuncReq, test = false) {
    // check sign
    const { id, prevs, signMsg } = operator.getSignMsg(req);
    logger.debug({
      tag: TAG,
      msg: "verify sig",
      id,
      address: req.req.address,
      signMsg,
      prevs,
      sig: req.req.sig,
      parent: this.newestCommitData.op.parent,
    });
    need(
      isSignVerify(req.req.address, signMsg, req.req.sig),
      sign_fail,
      CodeEnum.signature_fail
    );

    // TODO: check more verify
    const func: InternalFunc = {
      id,
      ...convertReq2Map(req),
      prevs,
      ts: req.req.ts,
      sig: req.req.sig,
    };
    const gasPrice = this.newestCommitData.op.gas_price;

    // const { address } = req.req;
    let tick: string;
    if (req.func == FuncType.decreaseApproval) {
      tick = req.req.tick;
    } else if (req.func == FuncType.swap) {
      tick = getPairStrV2(req.req.tickIn, req.req.tickOut);
    } else if (req.func == FuncType.send || req.func == FuncType.sendLp) {
      tick = req.req.tick;
    } else {
      tick = getPairStrV2(req.req.tick0, req.req.tick1);
    }
    const tmp = this.pendingSpace.partialClone(req.req.address, tick);

    // check exception
    const lcoalRes = tmp.aggregate(func, gasPrice, env.NewestHeight);

    if (test) {
      return {};
    }
    this.pendingSpace.aggregate(func, gasPrice, env.NewestHeight);

    this.newestCommitData.op.data.push(
      convertFuncInternal2Inscription(func, env.NewestHeight)
    );
    this.newestCommitData.result.push(lcoalRes.result);

    if (this.newestCommitData.op.data.length == 1) {
      this.firstAggregateTimestamp = Date.now();
    }
    this.lastAggregateTimestamp = Date.now();
    return { func, lcoalRes };
  }

  async aggregate(req: FuncReq, test = false) {
    await checkAccess(req.req.address);

    const ids = await this.getUnConfirmedOpCommitIds();
    if (ids.length >= config.verifyCommitFatalNum) {
      throw new Error(wait_for_rollup);
    }

    this.checkSystemStatus();
    checkFuncReq(req);
    checkAddressType(req.req.address);

    const { func, lcoalRes } = this.__aggregate(req, test);
    if (test) {
      return;
    }

    try {
      const assetList = this.pendingSpace.NotifyDataCollector.AssetList;
      for (let i = 0; i < assetList.length; i++) {
        const item = assetList[i];
        let tickDecimal: string;
        if (isLp(item.raw.tick)) {
          tickDecimal = LP_DECIMAL;
        } else {
          tickDecimal = decimal.get(item.raw.tick);
        }
        await mongoUtils.startTransaction(async () => {
          await assetDao.upsertData({
            assetType: item.raw.assetType,
            tick: item.raw.tick,
            address: item.raw.address,
            balance: item.raw.balance,
            cursor: PENDING_CURSOR,
            height: UNCONFIRM_HEIGHT,
            commitParent: this.newestCommitData.op.parent,
            displayBalance: bnDecimal(item.raw.balance, tickDecimal),
          });
          await assetSupplyDao.upsertData({
            cursor: PENDING_CURSOR,
            height: UNCONFIRM_HEIGHT,
            commitParent: this.newestCommitData.op.parent,
            tick: item.raw.tick,
            assetType: item.raw.assetType,
            supply:
              this.pendingSpace.Assets.dataRefer()[item.raw.assetType][
                item.raw.tick
              ].Supply,
          });
        });
        this.pendingSpace.NotifyDataCollector.reset(
          this.pendingSpace.LastHandledApiEvent.cursor
        );
      }
    } catch (err) {
      logger.error({
        tag: TAG,
        msg: "asset-update-fail-2",
        error: err.message,
        stack: err.stack,
      });
    }

    // try insert and excute
    const ret = await record("", func, lcoalRes);
    return ret;
  }

  async trySave() {
    await opCommitDao.upsertByParent(
      this.newestCommitData.op.parent,
      this.newestCommitData
    );
  }

  reachCommitCondition() {
    const reachMax =
      this.newestCommitData.op.data.length >= config.commitPerSize;
    const reachTime =
      this.newestCommitData.op.data.length > 0 &&
      config.openCommitPerMinute &&
      Date.now() - this.firstAggregateTimestamp >
        config.commitPerMinute * 60 * 1000;
    return reachMax || reachTime;
  }

  private convertResultFormat(results: Result[]) {
    const ret = results.map((item) => {
      const ret = {};
      if (item.users) {
        ret["users"] = item.users.map((item2) => {
          return {
            address: item2.address,
            balance: item2.balance,
            tick: isLp(item2.tick)
              ? convertPairStrV2ToPairStrV1(item2.tick)
              : item2.tick,
          };
        });
      }
      if (item.pools) {
        ret["pools"] = item.pools.map((item2) => {
          return {
            pair: convertPairStrV2ToPairStrV1(item2.pair),
            reserve0: item2.reserve0,
            reserve1: item2.reserve1,
            lp: item2.lp,
          };
        });
      }
      return ret;
    });
    return ret;
  }

  private tryCommitCount = 0;
  async tryCommit() {
    if (this.reachCommitCondition() && !this.newestCommitData.inscriptionId) {
      this.tryCommitCount++;
      logger.debug({
        tag: TAG,
        msg: "try commit",
        tryCommitCount: this.tryCommitCount,
        parent: this.newestCommitData.op.parent,
      });
      const commitObjs = await this.getVerifyCommits(this.newestCommitData.op);
      const commits = commitObjs.map((item) => {
        return JSON.stringify(item);
      });
      let results = this.convertResultFormat(
        this.newestCommitData.result
      ) as Result[];

      // Need to extract asset information involved in the pre-commit tick for indexing to verify.
      if (commits.length > 1) {
        results = _.cloneDeep(results);

        let extraResult: Result = {
          users: [],
          pools: [],
        };
        for (let i = 0; i < commitObjs.length - 1; i++) {
          const commit = commitObjs[i];
          for (let j = 0; j < commit.data.length; j++) {
            const func = convertFuncInscription2Internal(
              j,
              commit,
              env.NewestHeight
            );
            const res = this.pendingSpace.getCurResult(func);
            extraResult.pools.push(...(res.pools || []));
            extraResult.users.push(...(res.users || []));
          }
        }
        extraResult = this.convertResultFormat([extraResult])[0];

        const lastResult = results[results.length - 1];
        // logger.debug({ tag: TAG, msg: "add extra result before", lastResult });
        if (!lastResult.pools) {
          lastResult.pools = [];
        }
        lastResult.pools.push(...extraResult.pools);
        if (!lastResult.users) {
          lastResult.users = [];
        }
        lastResult.users.push(...extraResult.users);
        // logger.debug({ tag: TAG, msg: "add extra result after", lastResult });
      }

      const parent = this.newestCommitData.op.parent;
      need(this.newestCommitData.op.data.length == results.length);
      const verifyParams = {
        commits,
        results,
      };
      const res = await api.commitVerify(verifyParams);
      if (!res.valid) {
        logger.debug({
          tag: TAG,
          msg: "verify fail, parent: " + parent,
          commits,
          results,
          hash: hash(verifyParams),
          tryCommitCount: this.tryCommitCount,
          res,
        });
        if (config.verifyCommitInvalidException) {
          await sleep(10_000);
          throw new Error("verify fail, try again");
        }
      }
      if (this.tryCommitCount > 1) {
        logger.debug({
          tag: TAG,
          msg: "multi verify success, parent: " + parent,
          commits,
          results,
          hash: hash(verifyParams),
          tryCommitCount: this.tryCommitCount,
          res,
        });
      }
      await sender.pushCommitOp(this.newestCommitData.op);
      this.tryCommitCount = 0;
      logger.debug({
        tag: TAG,
        msg: "verify commit",
        tryCommitCount: this.tryCommitCount,
        inscriptionId: this.newestCommitData.inscriptionId,
      });
      this.pendingSpace.setLastCommitId(this.newestCommitData.inscriptionId);
    }
  }

  private getAdjustedGasPrice(gasPrice: string) {
    if (env.NewestHeight < config.updateHeight1) {
      return decimalCal([gasPrice, "mul", config.userFeeRateRatio]);
    } else {
      return decimalCal([
        gasPrice,
        "mul",
        config.userFeeRateRatio,
        "mul",
        400, // Assume fixed length
      ]);
    }
  }

  async tryNewCommitOp() {
    if (this.newestCommitData.inscriptionId && !sender.Committing) {
      const priceInfo = await this.calculateCurPriceInfo();
      const gas_price = this.getAdjustedGasPrice(priceInfo.gasPrice);
      logger.debug({
        tag: TAG,
        msg: "tryNewCommitOp",
        parent: this.newestCommitData.op.parent,
      });
      this.newestCommitData = {
        op: {
          p: "brc20-swap",
          op: OpType.commit,
          module: config.moduleId,
          parent: this.newestCommitData.inscriptionId,
          quit: "",
          gas_price,
          data: [],
        },
        feeRate: priceInfo.feeRate,
        satsPrice: priceInfo.satsPrice,
        result: [],
      };
      need(!!this.newestCommitData.op.gas_price);
      await this.trySave();
    }
  }
}
