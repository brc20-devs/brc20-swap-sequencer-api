import { bn, bnDecimal, decimalCal, uintCal } from "../contract/bn";
import { getPairStr, getPairStruct } from "../contract/contract-utils";
import { CommitOp } from "../types/op";
import {
  DepositListItem,
  DepositListReq,
  GasHistoryReq,
  GasHistoryRes,
  LiqHistoryReq,
  LiqHistoryRes,
  MyPoolListItem,
  MyPoolListReq,
  MyPoolReq,
  OverViewReq,
  OverViewRes,
  PoolListItem,
  PoolListReq,
  RollUpHistoryItem,
  RollUpHistoryReq,
  RollUpHistoryRes,
  SendHistoryReq,
  SendHistoryRes,
  SwapHistoryReq,
  SwapHistoryRes,
  WithdrawHistoryItem,
  WithdrawHistoryReq,
  WithdrawHistoryRes,
  WithdrawProcessReq,
  WithdrawProcessRes,
} from "../types/route";
import { getTodayMidnightSec } from "../utils/utils";
import { LP_DECIMAL, MAX_HEIGHT } from "./constant";
import {
  getConfirmedNum,
  heightConfirmNum,
  isLp,
  isMatch,
  need,
} from "./utils";

export class Query {
  async getDailyDepositLimit(address: string, tick: string) {
    const todayMidnightSec = getTodayMidnightSec();
    const res = await depositDao.find({
      address,
      tick,
      ts: { $gte: Math.floor(todayMidnightSec) },
    });
    let dailyAmount = "0";
    res.forEach((item) => {
      dailyAmount = decimalCal([dailyAmount, "add", item.amount]);
    });
    let dailyLimit =
      config.whitelistTick[tick.toLowerCase()]?.depositLimit || "0";
    if (!config.openWhitelistTick) {
      dailyLimit = "999999";
    }

    return { dailyAmount, dailyLimit };
  }

  private async aggregateVolume(
    tick0: string,
    tick1: string,
    date: "24h" | "7d"
  ): Promise<{ amount0Total: string; amount1Total: string }> {
    let interval = 0;
    if (date == "24h") {
      interval = 3600 * 24;
    } else {
      interval = 3600 * 24 * 7;
    }

    const res = await recordSwapDao.find({
      $or: [
        {
          tickIn: tick0,
          tickOut: tick1,
          ts: { $gt: Date.now() / 1000 - interval },
        },
        {
          tickIn: tick1,
          tickOut: tick0,
          ts: { $gt: Date.now() / 1000 - interval },
        },
      ],
    });

    let amount0Total = "0";
    let amount1Total = "0";
    res.forEach((item) => {
      if (tick0 == item.tickIn) {
        amount0Total = uintCal([amount0Total, "add", item.amountIn]);
        amount1Total = uintCal([amount1Total, "add", item.amountOut]);
      } else {
        amount0Total = uintCal([amount0Total, "add", item.amountOut]);
        amount1Total = uintCal([amount1Total, "add", item.amountIn]);
      }
    });

    return { amount0Total, amount1Total };
  }

  async globalPoolInfo(pair: string): Promise<PoolListItem> {
    const { tick0, tick1 } = getPairStruct(pair);

    let poolLp = "0";
    let poolAmount0 = "0";
    let poolAmount1 = "0";

    if (operator.NewestSpace.Assets.isExist(pair)) {
      const assets = operator.NewestSpace.Assets;

      poolLp = assets.get(pair).supply;
      poolAmount0 = assets.get(tick0).balanceOf(pair);
      poolAmount1 = assets.get(tick1).balanceOf(pair);

      poolLp = bnDecimal(poolLp, LP_DECIMAL);
      poolAmount0 = bnDecimal(poolAmount0, decimal.get(tick0));
      poolAmount1 = bnDecimal(poolAmount1, decimal.get(tick1));
    }
    const price0 = await api.tickPrice(tick0);
    const price1 = await api.tickPrice(tick1);

    let volume24h = "0";
    let volume7d = "0";
    const res24h = await this.aggregateVolume(tick0, tick1, "24h");
    const res7d = await this.aggregateVolume(tick0, tick1, "7d");
    const satsPrice = env.SatsPrice;

    // tvl
    let tvl0 = "0";
    let tvl1 = "0";
    if (price0) {
      tvl0 = decimalCal([
        decimalCal([poolAmount0, "mul", price0]),
        "mul",
        satsPrice,
      ]);
    }
    if (price1) {
      tvl1 = decimalCal([
        decimalCal([poolAmount1, "mul", price1]),
        "mul",
        satsPrice,
      ]);
    }
    const tvl = decimalCal([tvl0, "add", tvl1]);

    // volume
    if (price0) {
      volume24h = decimalCal([
        price0,
        "mul",
        satsPrice,
        "mul",
        res24h.amount0Total,
      ]);
      volume7d = decimalCal([
        price0,
        "mul",
        satsPrice,
        "mul",
        res7d.amount0Total,
      ]);
    } else if (price1) {
      volume24h = decimalCal([
        price1,
        "mul",
        satsPrice,
        "mul",
        res24h.amount1Total,
      ]);
      volume7d = decimalCal([
        price1,
        "mul",
        satsPrice,
        "mul",
        res7d.amount1Total,
      ]);
    }
    return {
      tick0,
      tick1,
      tvl, // TOFIX
      volume24h,
      volume7d,
      lp: poolLp,
    };
  }

  async globalPoolList(params: PoolListReq) {
    const { limit, start, search } = params;
    let list: PoolListItem[] = [];
    const assets = operator.NewestSpace.Assets.dataRefer()["swap"];
    for (const tick in assets) {
      if (isLp(tick) && isMatch(tick, search)) {
        list.push(await this.globalPoolInfo(tick));
      }
    }

    list = list.sort((a, b) => {
      return bn(a.tvl).lt(b.tvl) ? 1 : -1;
    });
    return {
      total: list.length,
      list: list.slice(start, start + limit),
    };
  }

  myPool(params: MyPoolReq) {
    const { address, tick0, tick1 } = params;
    const res = this.myPoolList({ address, start: 0, limit: 10000 });
    for (let i = 0; i < res.list.length; i++) {
      const item = res.list[i];
      if (getPairStr(item.tick0, item.tick1) == getPairStr(tick0, tick1)) {
        return item;
      }
    }
    return null;
  }

  myPoolList(params: MyPoolListReq) {
    const { address, tick: search, limit, start } = params;
    const assets = operator.NewestSpace.Assets.dataRefer()["swap"];
    const list: MyPoolListItem[] = [];
    for (const pair in assets) {
      if (isLp(pair) && bn(assets[pair].balanceOf(address)).gt("0")) {
        const { tick0, tick1 } = getPairStruct(pair);
        const decimal0 = decimal.get(tick0);
        const decimal1 = decimal.get(tick1);

        const myLp = assets[pair].balanceOf(address);
        const poolLp = assets[pair].supply;
        const poolAmount0 = assets[tick0].balanceOf(pair);
        const poolAmount1 = assets[tick1].balanceOf(pair);

        const shareOfPool = decimalCal([myLp, "div", poolLp]);
        if (isMatch(pair, search)) {
          list.push({
            lp: bnDecimal(myLp, "18"),
            shareOfPool,
            tick0,
            tick1,
            amount0: bnDecimal(
              decimalCal([poolAmount0, "mul", shareOfPool], decimal0),
              decimal0
            ),
            amount1: bnDecimal(
              decimalCal([poolAmount1, "mul", shareOfPool], decimal1),
              decimal1
            ),
          });
        }
      }
    }
    return {
      total: list.length,
      list: list.slice(start, start + limit),
    };
  }

  async overview(params: OverViewReq): Promise<OverViewRes> {
    const res = await this.globalPoolList({ start: 0, limit: 100 }); // TOFIX
    let liquidity = "0";
    let volume7d = "0";
    let volume24h = "0";
    res.list.forEach((item) => {
      liquidity = decimalCal([liquidity, "add", item.tvl]);
      volume7d = decimalCal([volume7d, "add", item.volume7d]);
      volume24h = decimalCal([volume24h, "add", item.volume24h]);
    });
    const transactions = await recordGasDao.count({
      ts: { $gt: Date.now() / 1000 - 24 * 3600 },
    });

    return {
      liquidity,
      volume7d,
      volume24h,
      transactions,
      pairs: res.total,
    };
  }

  async gasHistory(params: GasHistoryReq): Promise<GasHistoryRes> {
    const { address, limit, start } = params;
    const query = {
      invalid: { $ne: true },
    };
    if (address) {
      query["address"] = address;
    }
    const total = await recordGasDao.count(query);
    const list = await recordGasDao.find(query, {
      limit,
      skip: start,
      sort: { _id: -1 },
      projection: { _id: 0, preResult: 0, result: 0 },
    });

    return { total, list };
  }

  async sendHistory(params: SendHistoryReq): Promise<SendHistoryRes> {
    const { address, tick, limit, start } = params;
    const query = {
      invalid: { $ne: true },
    };
    if (address) {
      query["$or"] = [{ address }, { to: address }];
      // query["address"] = address;
    }
    if (tick) {
      query["tick"] = tick;
    }
    const total = await recordSendDao.count(query);
    const list = await recordSendDao.find(query, {
      limit,
      skip: start,
      sort: { _id: -1 },
      projection: { _id: 0, preResult: 0, result: 0 },
    });

    return { total, list };
  }

  async liqHistory(params: LiqHistoryReq): Promise<LiqHistoryRes> {
    const { address, tick, type, limit, start } = params;
    const query = {
      invalid: { $ne: true },
    };
    if (address) {
      query["address"] = address;
    }
    if (tick) {
      if (isLp(tick)) {
        const { tick0, tick1 } = getPairStruct(tick);
        query["tick0"] = tick0;
        query["tick1"] = tick1;
      } else {
        query["$or"] = [{ tick0: tick }, { tick1: tick }];
      }
    }
    if (type) {
      query["type"] = type;
    }
    const total = await recordLiqDao.count(query);
    const list = await recordLiqDao.find(query, {
      limit,
      skip: start,
      sort: { _id: -1 },
      projection: { _id: 0, preResult: 0, result: 0 },
    });

    return { total, list };
  }

  async swapHistory(params: SwapHistoryReq): Promise<SwapHistoryRes> {
    const { address, tick, limit, start } = params;
    const query = {
      invalid: { $ne: true },
    };
    if (address) {
      query["address"] = address;
    }
    if (tick) {
      query["$or"] = [{ tickIn: tick }, { tickOut: tick }];
    }
    const total = await recordSwapDao.count(query);
    const list = await recordSwapDao.find(query, {
      limit,
      skip: start,
      sort: { _id: -1 },
      projection: { _id: 0, preResult: 0, result: 0 },
    });

    return { total, list };
  }

  async rollUpHistory(params: RollUpHistoryReq): Promise<RollUpHistoryRes> {
    const { limit, start } = params;

    if (start == 0) {
      const res1 = await opCommitDao.findNotInEventList();
      let list1: RollUpHistoryItem[] = [];
      res1.forEach((item) => {
        list1.push({
          txid: item.txid ?? null,
          height: item.txid ? MAX_HEIGHT : null,
          inscriptionId: item.inscriptionId ?? null,
          transactionNum: item.op.data.length,
          inscriptionNumber: null,
          ts: null,
        });
      });
      list1 = list1.reverse();

      const query = {
        "opEvent.op.op": "commit",
        invalid: { $ne: true },
      };
      const total = (await opListDao.count(query)) + 1;
      const res2 = await opListDao.find(query, {
        limit: limit - 1,
        skip: start,
        sort: { _id: -1 },
      });
      const list2: RollUpHistoryItem[] = res2.map((item) => {
        return {
          txid: item.opEvent.txid,
          height: item.opEvent.height,
          transactionNum: (item.opEvent.op as CommitOp).data.length,
          inscriptionId: item.opEvent.inscriptionId,
          inscriptionNumber: item.opEvent.inscriptionNumber,
          ts: item.opEvent.blocktime,
        };
      });
      return { total, list: list1.concat(list2) };
    } else {
      const query = {
        "opEvent.op.op": "commit",
      };
      const total = await opListDao.count(query);
      const res = await opListDao.find(query, {
        limit,
        skip: start,
        sort: { _id: -1 },
      });
      const list: RollUpHistoryItem[] = res.map((item) => {
        return {
          txid: item.opEvent.txid,
          height: item.opEvent.height,
          transactionNum: (item.opEvent.op as CommitOp).data.length,
          inscriptionId: item.opEvent.inscriptionId,
          inscriptionNumber: item.opEvent.inscriptionNumber,
          ts: item.opEvent.blocktime,
        };
      });
      return { total, list };
    }
  }

  async depositHistory(params: DepositListReq) {
    const query = {
      address: params.address,
      invalid: { $ne: true },
    };
    if (params.tick) {
      query["tick"] = params.tick;
    }

    const res = await depositDao.find(query, {
      limit: params.limit,
      skip: params.start,
      sort: { _id: -1 },
    });
    const total = await depositDao.count(query);
    const list: DepositListItem[] = [];
    for (let i = 0; i < res.length; i++) {
      const item = res[i];

      if (item.height == MAX_HEIGHT || !item.ts) {
        try {
          const info = await api.txInfo(item.txid);
          item.height = info.height;
          item.ts = info.timestamp;
          if (item.height !== MAX_HEIGHT && item.ts) {
            await depositDao.upsertData(item);
          }
        } catch (err) {
          //
        }
      }

      const totalPending =
        item.type == "direct"
          ? config.pendingDepositDirectNum
          : config.pendingDepositMatchingNum;

      let confirmNum = Math.min(heightConfirmNum(item.height), totalPending);
      confirmNum = Math.max(0, confirmNum);
      list.push({
        tick: item.tick,
        amount: item.amount,
        cur: confirmNum,
        sum: totalPending,
        ts: item.ts,
        txid: item.txid,
        type: item.type,
      });
    }
    return { list, total };
  }

  async withdrawHistory(
    params: WithdrawHistoryReq
  ): Promise<WithdrawHistoryRes> {
    const { address, start, limit, tick } = params;
    const query = {
      address,
      invalid: { $ne: true },
    };
    if (tick) {
      query["tick"] = tick;
    }
    const total = await withdrawDao.count(query);
    const res = await withdrawDao.find(query, {
      limit,
      skip: start,
      sort: { _id: -1 },
    });
    const list = res.map((item) => {
      let completedAmount = "0";
      let approve = matching.getApproveMatching(item.inscriptionId);
      if (approve) {
        completedAmount = decimalCal([
          item.amount,
          "sub",
          approve.remainAmount,
        ]);
      }

      const rollUpTotalNum = config.pendingRollupNum;
      const approveTotalNum = config.pendingWithdrawNum;

      const rollUpConfirmNum = Math.min(
        rollUpTotalNum,
        getConfirmedNum(item.rollUpHeight)
      );
      const approveConfirmNum = Math.min(
        approveTotalNum,
        getConfirmedNum(item.approveHeight)
      );
      const totalConfirmedNum = rollUpConfirmNum + approveConfirmNum;
      const totalNum = config.pendingRollupNum + config.pendingWithdrawNum;

      return {
        id: item.id,
        tick: item.tick,
        totalAmount: item.amount,
        completedAmount,
        ts: item.ts,
        totalConfirmedNum,
        totalNum,
        status: item.status,
      } as WithdrawHistoryItem;
    });

    return { total, list };
  }

  async withdrawProcess(
    params: WithdrawProcessReq
  ): Promise<WithdrawProcessRes> {
    const { id } = params;
    const item = withdraw.getByOrderId(id);

    need(item.rollUpHeight >= 0);
    need(item.approveHeight >= 0);

    const rollUpTotalNum = config.pendingRollupNum;
    const withdrawTotalNum = config.pendingWithdrawNum;

    const rollUpConfirmNum = Math.min(
      rollUpTotalNum,
      getConfirmedNum(item.rollUpHeight)
    );
    const withdrawConfirmNum = Math.min(
      withdrawTotalNum,
      getConfirmedNum(item.approveHeight)
    );
    const totalConfirmedNum = rollUpConfirmNum + withdrawConfirmNum;
    const totalNum = config.pendingRollupNum + config.pendingWithdrawNum;

    const cancelTotalNum = config.pendingWithdrawNum;
    const cancelConfirmedNum = Math.min(
      cancelTotalNum,
      getConfirmedNum(item.cancelHeight)
    );

    const matchHistory = await matchingDao.find({
      approveInscriptionId: item.inscriptionId,
      invalid: { $ne: true },
    });

    let completedAmount = "0";
    let approve = matching.getApproveMatching(item.inscriptionId);
    if (approve) {
      completedAmount = decimalCal([item.amount, "sub", approve.remainAmount]);
    }

    const ret: WithdrawProcessRes = {
      id: item.id,
      tick: item.tick,
      amount: item.amount,
      ts: item.ts,
      totalConfirmedNum,
      totalNum,
      rollUpConfirmNum,
      rollUpTotalNum,
      cancelConfirmedNum,
      cancelTotalNum,
      approveConfirmNum: withdrawConfirmNum,
      approveTotalNum: withdrawTotalNum,
      rollUpTxid: item.rollUpTxid,
      paymentTxid: item.paymentTxid,
      inscribeTxid: item.inscribeTxid,
      approveTxid: item.approveTxid,
      completedAmount,
      matchHistory,
      status: item.status,
      rank: matching.getWithdrawRanking(item.address, item.tick),
    };
    return ret;
  }
}
