import { Mutex } from "async-mutex";
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
import { getPairStr } from "../contract/contract-utils";
import { OpCommitData } from "../dao/op-commit-dao";
import { OridinalMsg, SpaceSnapshot } from "../types/domain";
import {
  ContractResult,
  ExactType,
  FuncType,
  InternalFunc,
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
import { isProportional, lastItem, printErr, queue } from "../utils/utils";
import { LP_DECIMAL } from "./constant";
import {
  convertFuncInternal2Inscription,
  convertReq2Arr,
  convertReq2Map,
} from "./convert-struct";
import {
  CodeEnum,
  CodeError,
  duplicate_operation,
  insufficient_liquidity,
  invalid_amount,
  maximum_precision,
  pool_not_found,
  sign_fail,
  system_commit_in_progress_1,
  system_commit_in_progress_2,
  system_fatal_error,
  system_recovery_in_progress,
  validation_error,
} from "./error";
import { getSignMsg, isSignVerify } from "./sign";
import { Space } from "./space";
import {
  checkAccess,
  checkAddressType,
  checkAmount,
  checkFuncReq,
  getTickUsdPrice,
  maxAmount,
  need,
  notInEventCommitIds,
  record,
  sysFatal,
} from "./utils";

function getPrecisionTip(tick: string, decimal: string) {
  return `${maximum_precision} ${tick}: ${decimal}`;
}

export class Operator {
  private newestSpace: Space;
  private commitData: OpCommitData;
  private firstAggregateTimestamp: number;
  private lastAggregateTimestamp: number;
  private mutex = new Mutex();
  private sets = new Set();

  get CommitData() {
    return this.commitData;
  }

  get NewestSpace() {
    return this.newestSpace;
  }

  get LastAggregateTimestamp() {
    return this.lastAggregateTimestamp;
  }

  constructor() {}

  private async getCommitEventsNotInEventList() {
    const notInEventList = await opCommitDao.findNotInEventList();
    if (this.commitData) {
      let hasInList = false;
      for (let i = 0; i < notInEventList.length; i++) {
        if (notInEventList[i].op.parent == this.commitData.op.parent) {
          need(i == notInEventList.length - 1);
          hasInList = true;

          // use memory data (newest)
          notInEventList[i] = this.commitData;
          break;
        }
      }
      if (!hasInList) {
        notInEventList.push(this.commitData);
      }
    }
    return notInEventList;
  }

  private async getVerifyCommits(newestCommit: CommitOp) {
    let arr = await this.getCommitEventsNotInEventList();
    let commits = arr.map((item) => {
      return item.op;
    });
    commits = commits.filter((item) => {
      return item.parent !== newestCommit.parent;
    });
    commits.push(newestCommit);
    let ret = commits.map((item) => {
      return JSON.stringify(item);
    });
    return ret;
  }

  async rebuild(
    nextEvents: OpEvent[], // next_events
    snapshot: SpaceSnapshot, // start_snapshot
    useMutex: boolean
  ) {
    /**
     *  --------------- API ---------------|------- Dao -------
     *  [start_snapshot][...next_events...]|[...uncommit_op...]
     *  -----------------------------------|-------------------
     */
    const action = async () => {
      this.newestSpace = new Space(snapshot, env.ContractConfig);
      for (let i = 0; i < nextEvents.length; i++) {
        const event = nextEvents[i];
        this.newestSpace.handleOpEvent(event);
      }

      const unconfirmCommitList = await this.getCommitEventsNotInEventList();
      let lastCommitOpData: OpCommitData;
      let lastCommitOpResults: ContractResult[];
      for (let i = 0; i < unconfirmCommitList.length; i++) {
        lastCommitOpData = unconfirmCommitList[i];
        lastCommitOpResults = this.newestSpace.handleCommitOp(
          lastCommitOpData.op,
          lastCommitOpData.inscriptionId
        );
      }

      // update commit data and result
      if (lastCommitOpResults) {
        this.commitData = lastCommitOpData;

        // fix: recalculate for delay balance, otherwise, it may result in verification failure
        const results = lastCommitOpResults.map((item) => {
          return item.result;
        });
        this.commitData.result = results;
      } else {
        const priceInfo = await this.calculateCurPriceInfo();
        const res = await opCommitDao.findLastCommitOp();
        this.commitData = {
          op: {
            p: "brc20-swap",
            op: OpType.commit,
            module: config.moduleId,
            parent: res?.inscriptionId || "",
            quit: "", // TOFIX
            gas_price: priceInfo.gasPrice,
            data: [],
          },
          feeRate: priceInfo.feeRate,
          satsPrice: priceInfo.satsPrice,
          result: [],
        };
        await this.trySave();
      }
    };
    if (useMutex) {
      return await queue(this.mutex, action);
    } else {
      return await action();
    }
  }

  async init() {
    if (this.CommitData.op.data.length > 0) {
      this.firstAggregateTimestamp = this.CommitData.op.data[0].ts * 1000;
      this.lastAggregateTimestamp = lastItem(this.CommitData.op.data).ts * 1000;
    } else {
      this.lastAggregateTimestamp = Date.now();
    }
  }

  async tick() {
    const ids = await notInEventCommitIds();
    if (ids.length >= config.verifyCommitFatalNum) {
      sysFatal("verify-commit-fatal", { ids });
    }

    await this.newestSpace.tick();

    await this.trySave();
    await this.tryCommit();
    await this.tryNewCommitOp();
  }

  async quoteSwap(req: QuoteSwapReq): Promise<QuoteSwapRes> {
    const { tickIn, tickOut, amount, exactType } = req;
    const pair = getPairStr(tickIn, tickOut);
    const assets = this.NewestSpace.Assets;
    const contract = this.NewestSpace.Contract;

    await this.mutex.waitForUnlock();

    need(bn(amount).lt(maxAmount), invalid_amount);
    need(bn(amount).gt("0"), invalid_amount);

    need(this.newestSpace.Assets.isExist(pair), pool_not_found);

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

    await this.mutex.waitForUnlock();

    const decimal0 = decimal.get(tick0);
    const decimal1 = decimal.get(tick1);

    const lpInt = bnUint(lp, LP_DECIMAL);
    const pair = getPairStr(tick0, tick1);
    const assets = this.NewestSpace.Assets;
    const poolLp = uintCal([
      assets.get(pair).supply,
      "add",
      this.NewestSpace.Contract.getFeeLp({ tick0, tick1 }),
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
    const pair = getPairStr(tick0, tick1);
    const assets = this.NewestSpace.Assets;

    await this.mutex.waitForUnlock();

    if (!assets.isExist(pair) || assets.get(pair).supply == "0") {
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
        assets.get(pair).supply,
        "add",
        this.NewestSpace.Contract.getFeeLp({ tick0, tick1 }),
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

    const res2 = await opCommitDao.find(
      { invalid: { $ne: true } },
      { sort: { _id: -1 }, limit: 2 }
    );

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
    const op = this.commitData.op;
    checkAddressType(address);
    this.checkSystemStatus();
    const res: OridinalMsg[] = [];
    for (let i = 0; i < this.commitData.op.data.length; i++) {
      const item = this.commitData.op.data[i];
      if (item.addr == address) {
        res.push({
          module: this.commitData.op.module,
          parent: this.commitData.op.parent,
          quit: this.commitData.op.quit,
          gas_price: this.commitData.op.gas_price,
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
    logger.info({
      tag: "sign-msg",
      commitParent: op.parent,
      ...ret,
    });

    return ret;
  }

  private checkSystemStatus() {
    need(
      !this.reachCommitCondition(),
      system_commit_in_progress_1,
      CodeEnum.commiting
    );
    need(!opSender.Committing, system_commit_in_progress_2, CodeEnum.commiting);
    need(!opBuilder.IsRestoring, system_recovery_in_progress);
    need(!fatal, system_fatal_error, CodeEnum.fatal_error);
  }

  async aggregate(req: FuncReq, test = false) {
    await checkAccess(req.req.address);

    return await queue(this.mutex, async () => {
      this.checkSystemStatus();
      checkFuncReq(req);
      checkAddressType(req.req.address);

      // check sign
      const { id, prevs, signMsg } = operator.getSignMsg(req);
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
      const gasPrice = this.commitData.op.gas_price;

      // tmp: check same operator

      // const { address } = req.req;
      let operatorHash: string;
      let tick: string;
      if (req.func == FuncType.decreaseApproval) {
        // await checkDepositLimitTime(address, req.req.tick);

        tick = req.req.tick;
        // operatorHash = hash({
        //   func: req.func,
        //   address: req.req.address,
        //   tick: req.req.tick,
        //   amount: req.req.amount,
        // });
      } else if (req.func == FuncType.swap) {
        // await checkDepositLimitTime(address, req.req.tickIn);
        // await checkDepositLimitTime(address, req.req.tickOut);

        tick = getPairStr(req.req.tickIn, req.req.tickOut);
        operatorHash = hash({
          func: req.func,
          address: req.req.address,
          tickIn: req.req.tickIn,
          tickOut: req.req.tickOut,
          amountIn: req.req.amountIn,
          amountOut: req.req.amountOut,
          slippage: req.req.slippage,
          exactType: req.req.exactType,
        });
      } else if (req.func == FuncType.send) {
        tick = req.req.tick;
        operatorHash = hash({
          func: req.func,
          address: req.req.address,
          tick,
          amount: req.req.amount,
          from: req.req.address,
          to: req.req.to,
          balance: this.newestSpace.getBalance(req.req.address, tick),
        });
      } else {
        // await checkDepositLimitTime(address, req.req.tick0);
        // await checkDepositLimitTime(address, req.req.tick1);

        tick = getPairStr(req.req.tick0, req.req.tick1);

        // if (req.func == FuncType.removeLiq) {
        //   operatorHash = hash({
        //     func: req.func,
        //     address: req.req.address,
        //     tick0: req.req.tick0,
        //     tick1: req.req.tick1,
        //     lp: req.req.lp,
        //     amount0: req.req.amount0,
        //     amount1: req.req.amount1,
        //   });
        // } else if (req.func == FuncType.addLiq) {
        //   operatorHash = hash({
        //     func: req.func,
        //     address: req.req.address,
        //     tick0: req.req.tick0,
        //     tick1: req.req.tick1,
        //     lp: req.req.lp,
        //     amount0: req.req.amount0,
        //     amount1: req.req.amount1,
        //   });
        // }
      }
      need(!this.sets.has(operatorHash), duplicate_operation);

      const tmp = this.newestSpace.partialClone(req.req.address, tick);

      // check exception
      const res = tmp.aggregate(func, gasPrice);

      if (config.verifyCommit) {
        await this.rebuild(
          opBuilder.AllEventsFromStart,
          opBuilder.AllEventsFromStartSnapshot,
          false // the outer layer has been locked
        );

        const tmpCommit = _.cloneDeep(this.commitData.op);
        tmpCommit.data.push(convertFuncInternal2Inscription(func));
        const tmpResult = _.cloneDeep(this.commitData.result);
        tmpResult.push(res.result);

        const commits = await this.getVerifyCommits(tmpCommit);

        try {
          const res2 = await api.commitVerify({
            commits,
            results: tmpResult,
          });

          if (res2.critical) {
            logger.error({
              tag: "commit-verify-critical",
              ret: res2,
              commits,
              results: tmpResult,
            });
            if (
              res2.message.includes("sig") ||
              config.verifyCommitCriticalException
            ) {
              throw new CodeError(validation_error);
            }
          }

          if (!res2.valid) {
            logger.error({
              tag: "commit-verify-invalid",
              ret: res2,
              commits,
              results: tmpResult,
            });
            if (config.verifyCommitInvalidException) {
              throw new CodeError(validation_error);
            }
          }
        } catch (err) {
          printErr("commit-verify-timeout", err);
          if (config.verifyCommitInvalidException) {
            throw new CodeError(err);
          }
        }
      }

      if (test) {
        return;
      }

      // try insert and excute
      const ret = await record("", func, res);

      this.newestSpace.aggregate(func, gasPrice);
      this.commitData.op.data.push(convertFuncInternal2Inscription(func));
      this.commitData.result.push(res.result);

      if (this.commitData.op.data.length == 1) {
        this.firstAggregateTimestamp = Date.now();
      }
      this.lastAggregateTimestamp = Date.now();
      if (operatorHash) {
        this.sets.add(operatorHash);
      }

      return ret;
    });
  }

  async trySave() {
    await opCommitDao.upsertByParent(
      this.commitData.op.parent,
      this.commitData
    );
  }

  reachCommitCondition() {
    const reachMax = this.commitData.op.data.length >= config.commitPerSize;
    const reachTime =
      this.commitData.op.data.length > 0 &&
      config.openCommitPerMinute &&
      Date.now() - this.firstAggregateTimestamp >
        config.commitPerMinute * 60 * 1000;
    return reachMax || reachTime;
  }

  async tryCommit() {
    if (
      this.reachCommitCondition() &&
      opSender.LastCommitOp?.parent !== this.commitData.op.parent &&
      !opSender.Committing
    ) {
      await this.rebuild(
        opBuilder.AllEventsFromStart,
        opBuilder.AllEventsFromStartSnapshot,
        true
      );
      const commits = await this.getVerifyCommits(this.commitData.op);

      try {
        const res = await api.commitVerify({
          commits,
          results: this.commitData.result,
        });
        if (!res.valid) {
          logger.error({
            tag: "commit-verify-invalid",
            ret: res,
            commits,
            results: this.commitData.result,
          });
          if (config.verifyCommitInvalidException) {
            sysFatal("commit-verify-invalid", res);
            return;
          }
        }
      } catch (err) {
        printErr("commit-verify-timeout", err);
        if (config.verifyCommitInvalidException) {
          throw new CodeError(err);
        }
      }
      await opSender.createCommit(this.commitData.op);
    }
  }

  async tryNewCommitOp() {
    if (
      opSender.LastCommitOp?.parent == this.commitData.op.parent &&
      !opSender.Committing
    ) {
      const priceInfo = await this.calculateCurPriceInfo();
      this.commitData = {
        op: {
          p: "brc20-swap",
          op: OpType.commit,
          module: config.moduleId,
          parent: opSender.LastInscriptionId,
          quit: "", // TOFIX
          gas_price: decimalCal([
            priceInfo.gasPrice,
            "mul",
            config.userFeeRateRatio,
          ]),
          data: [],
        },
        feeRate: priceInfo.feeRate,
        satsPrice: priceInfo.satsPrice,
        result: [],
      };
      need(!!this.commitData.op.gas_price);

      await this.trySave();
    }
  }
}
