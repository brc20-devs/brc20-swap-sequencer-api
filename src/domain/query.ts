import { bn, bnDecimal, decimalCal, uintCal } from "../contract/bn";
import { getPairStrV2, getPairStructV2 } from "../contract/contract-utils";
import { CommitOp } from "../types/op";
import {
  AllAddressBalanceRes,
  ConditionalWithdrawHistoryItem,
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
  SelectReq,
  SelectRes,
  SendHistoryReq,
  SendHistoryRes,
  SwapHistoryReq,
  SwapHistoryRes,
  WithdrawHistoryReq,
  WithdrawHistoryRes,
  WithdrawProcessReq,
  WithdrawProcessRes,
} from "../types/route";
import { getTodayMidnightSec } from "../utils/utils";
import { PoolInfoReq } from "./../types/route";
import { LP_DECIMAL, UNCONFIRM_HEIGHT } from "./constant";
import {
  checkTick,
  getConfirmedNum,
  heightConfirmNum,
  isLp,
  isMatch,
  need,
} from "./utils";

const TAG = "query";

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

    let res = await recordSwapDao.aggregate([
      {
        $match: {
          tickIn: tick0,
          tickOut: tick1,
          ts: {
            $gte: Date.now() / 1000 - interval,
          },
        },
      },
      {
        $project: {
          amountIn: { $toDouble: "$amountIn" },
          amountOut: { $toDouble: "$amountOut" },
        },
      },
      {
        $group: {
          _id: null,
          amount0Total: { $sum: "$amountIn" },
          amount1Total: { $sum: "$amountOut" },
        },
      },
    ]);
    let amount0Total = res[0]?.amount0Total || "0";
    let amount1Total = res[0]?.amount1Total || "0";

    res = await recordSwapDao.aggregate([
      {
        $match: {
          tickIn: tick1,
          tickOut: tick0,
          ts: {
            $gte: Date.now() / 1000 - interval,
          },
        },
      },
      {
        $project: {
          amountIn: { $toDouble: "$amountIn" },
          amountOut: { $toDouble: "$amountOut" },
        },
      },
      {
        $group: {
          _id: null,
          amount1Total: { $sum: "$amountIn" },
          amount0Total: { $sum: "$amountOut" },
        },
      },
    ]);
    amount0Total = uintCal([amount0Total, "add", res[0]?.amount0Total || "0"]);
    amount1Total = uintCal([amount1Total, "add", res[0]?.amount1Total || "0"]);

    return { amount0Total, amount1Total };
  }

  async globalPoolInfo(pair: string): Promise<PoolListItem> {
    const { tick0, tick1 } = getPairStructV2(pair);
    const res = await poolListDao.findOne({ tick0, tick1 });
    return {
      tick0,
      tick1,
      lp: bn(res?.lp || 0).toString(),
      tvl: bn(res?.tvl || 0).toString(),
      volume24h: bn(res?.volume24h || 0).toString(),
      volume7d: bn(res?.volume7d || 0).toString(),
    };
  }

  async globalPoolList(params: PoolListReq) {
    const { limit, start, search } = params;

    const query = {};
    if (search) {
      query["$or"] = [{ tick0: search }, { tick1: search }];
    }
    const total = await poolListDao.count({});

    const list = await poolListDao.aggregate([
      { $match: query },
      {
        $sort: { tvl: -1 },
      },
      { $skip: start },
      {
        $limit: limit,
      },
      {
        $project: {
          _id: 0,
        },
      },
    ]);

    return {
      total,
      list,
    };
  }

  myPool(params: MyPoolReq) {
    const { address, tick0, tick1 } = params;
    const res = this.myPoolList({ address, start: 0, limit: 10000 });
    for (let i = 0; i < res.list.length; i++) {
      const item = res.list[i];
      if (getPairStrV2(item.tick0, item.tick1) == getPairStrV2(tick0, tick1)) {
        return item;
      }
    }
    return null;
  }

  myPoolList(params: MyPoolListReq) {
    const { address, tick: search, limit, start } = params;
    const assets = operator.PendingSpace.Assets.dataRefer()["swap"];
    let list: MyPoolListItem[] = [];
    for (const pair in assets) {
      if (isLp(pair) && bn(assets[pair].balanceOf(address)).gt("0")) {
        const { tick0, tick1 } = getPairStructV2(pair);
        const decimal0 = decimal.get(tick0);
        const decimal1 = decimal.get(tick1);

        const myLp = assets[pair].balanceOf(address);
        const poolLp = assets[pair].Supply;
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

    // TOFIX
    list = list.filter((item) => {
      return (
        !item.tick0.toLowerCase().includes("unisat_") &&
        !item.tick1.toLowerCase().includes("unisat_")
      );
    });

    return {
      total: list.length,
      list: list.slice(start, start + limit),
    };
  }

  async overview(params: OverViewReq): Promise<OverViewRes> {
    const res = await poolListDao.aggregate([
      {
        $group: {
          _id: null,
          totalTvl: { $sum: "$tvl" },
          totalVolume24h: { $sum: "$volume24h" },
          totalVolume7d: { $sum: "$volume7d" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          totalTvl: { $toString: "$totalTvl" },
          totalVolume24h: { $toString: "$totalVolume24h" },
          totalVolume7d: { $toString: "$totalVolume7d" },
          count: "$count",
        },
      },
    ]);

    const transactions = await recordGasDao.count({
      ts: { $gt: Date.now() / 1000 - 24 * 3600 },
    });

    const item = res[0];

    return {
      liquidity: item.totalTvl,
      volume7d: item.totalVolume24h,
      volume24h: item.totalVolume7d,
      transactions,
      pairs: item.count,
    };
  }

  async gasHistory(params: GasHistoryReq): Promise<GasHistoryRes> {
    const { address, limit, start } = params;
    const query = {};
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
    const query = {};
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
    const { address, type, limit, start } = params;
    let tick = params.tick;
    const query = {};
    if (address) {
      query["address"] = address;
    }
    if (tick) {
      if (tick.length > 4) {
        try {
          const res = tick.split("/");
          need(res.length == 2);
          tick = getPairStrV2(res[0], res[1]);
        } catch (err) {}
      }
      if (isLp(tick)) {
        const { tick0, tick1 } = getPairStructV2(tick);
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
    const query = {};
    if (address) {
      query["address"] = address;
    }

    if (tick) {
      if (tick.includes("/")) {
        const [tick0, tick1] = tick.split("/");
        query["$or"] = [
          { tickIn: tick0, tickOut: tick1 },
          { tickIn: tick1, tickOut: tick0 },
        ];
      } else {
        query["$or"] = [{ tickIn: tick }, { tickOut: tick }];
      }
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

    const res1 = await opCommitDao.findNotInIndexer();
    let list1: RollUpHistoryItem[] = [];
    res1.forEach((item) => {
      list1.push({
        txid: item.txid ?? null,
        height: item.txid ? UNCONFIRM_HEIGHT : null,
        inscriptionId: item.inscriptionId ?? null,
        transactionNum: item.op.data.length,
        inscriptionNumber: null,
        ts: null,
      });
    });
    list1 = list1.reverse();

    const query = {
      "op.op": "commit",
    };
    const total = (await opEventDao.count(query)) + res1.length;
    const res2 = await opEventDao.find(query, {
      limit: 1000,
      skip: start,
      sort: { _id: -1 },
    });
    const list2: RollUpHistoryItem[] = res2.map((item) => {
      return {
        txid: item.txid,
        height: item.height,
        transactionNum: (item.op as CommitOp).data.length,
        inscriptionId: item.inscriptionId,
        inscriptionNumber: item.inscriptionNumber,
        ts: item.blocktime,
      };
    });
    return { total, list: list1.concat(list2).slice(start, start + limit) };
  }

  async depositHistory(params: DepositListReq) {
    const query = {
      address: params.address,
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

      if (item.height == UNCONFIRM_HEIGHT || !item.ts) {
        try {
          const info = await api.txInfo(item.txid);
          item.height = info.height;
          item.ts = info.timestamp;
          if (item.height !== UNCONFIRM_HEIGHT && item.ts) {
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
      const type = item.type || "conditional";
      if (type == "conditional") {
        let approve = matching.getApproveMatching(item.inscriptionId);
        if (approve) {
          completedAmount = decimalCal([
            item.amount,
            "sub",
            approve.remainAmount,
          ]);
        }
      } else {
        if (item.status == "order") {
          completedAmount = item.amount;
        }
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
      const totalConfirmedNum = Math.max(
        0,
        rollUpConfirmNum + approveConfirmNum
      );
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
        type: item.type,
      } as ConditionalWithdrawHistoryItem;
    });

    return { total, list };
  }

  async withdrawProcess(
    params: WithdrawProcessReq
  ): Promise<WithdrawProcessRes> {
    const { id } = params;
    const item = directWithdraw.getByOrderId(id);

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

  async getAllBalance(address: string): Promise<AllAddressBalanceRes> {
    const res = await assetDao.find({ address });
    const ret: AllAddressBalanceRes = {};
    for (let i = 0; i < res.length; i++) {
      const item = res[i];
      if (isLp(item.tick)) {
        continue;
      }
      if (!ret[item.tick]) {
        ret[item.tick] = {
          balance: {
            module: "0",
            swap: "0",
            pendingSwap: "0",
            pendingAvailable: "0",
          },
          decimal: decimal.get(item.tick),
        };
      }
      if (
        ["available", "approve", "conditionalApprove"].includes(item.assetType)
      ) {
        ret[item.tick].balance["module"] = decimalCal(
          [ret[item.tick].balance["module"], "add", item.displayBalance],
          "18"
        );
      } else {
        ret[item.tick].balance[item.assetType] = decimalCal(
          [ret[item.tick].balance[item.assetType], "add", item.displayBalance],
          "18"
        );
      }
    }
    return ret;
  }

  getPoolInfo(params: PoolInfoReq) {
    const pair = getPairStrV2(params.tick0, params.tick1);
    const existed = operator.PendingSpace.Assets.isExist(pair);
    if (!existed) {
      return { existed, addLiq: false };
    } else {
      const addLiq = bn(operator.PendingSpace.Assets.get(pair).Supply).gt("0");
      return { existed, addLiq };
    }
  }

  async getSelect(params: SelectReq): Promise<SelectRes> {
    const { address, search } = params;
    const list = decimal.getAllTick();
    const balances = await api.tickBalance(address);
    const ret0 = list.map((tick) => {
      let brc20Balance = "0";
      for (let i = 0; i < balances.detail.length; i++) {
        if (balances.detail[i].ticker == tick) {
          brc20Balance = balances.detail[i].overallBalance;
          break;
        }
      }
      let swapBalance = bnDecimal(
        operator.PendingSpace.Assets.getBalance(address, tick),
        decimal.get(tick)
      );
      return { tick, brc20Balance, swapBalance, decimal: decimal.get(tick) };
    });
    const ret1 = ret0.sort((a, b) => {
      return bn(b.swapBalance).gt(a.swapBalance) ? 1 : -1;
    });
    const ret2 = ret0.sort((a, b) => {
      return bn(b.brc20Balance).gt(a.brc20Balance) ? 1 : -1;
    });
    let ret: SelectRes = [];

    const set = new Set();
    for (let i = 0; i < ret1.length; i++) {
      if (ret1[i].swapBalance !== "0") {
        ret.push(ret1[i]);
        set.add(ret1[i].tick);
      } else {
        break;
      }
    }
    for (let i = 0; i < ret2.length; i++) {
      if (!set.has(ret2[i].tick)) {
        ret.push(ret2[i]);
      }
    }
    if (search) {
      ret = ret.filter((a) => {
        return isMatch(a.tick, search);
      });
    }
    ret = ret.filter((a) => {
      try {
        checkTick(a.tick);
        return true;
      } catch (err) {
        return false;
      }
    });
    return ret.slice(0, 20);
  }

  async tick() {
    await this.update();
  }

  async init() {
    if (config.readonly) {
      return;
    }
    await this.update();
  }

  private async calPoolInfo(pair: string): Promise<PoolListItem> {
    const { tick0, tick1 } = getPairStructV2(pair);

    let poolLp = "0";
    let poolAmount0 = "0";
    let poolAmount1 = "0";

    if (operator.PendingSpace.Assets.isExist(pair)) {
      const assets = operator.PendingSpace.Assets;

      poolLp = assets.get(pair).Supply;
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

  async update() {
    const assets = operator.PendingSpace.Assets.dataRefer()["swap"];
    for (const tick in assets) {
      if (isLp(tick)) {
        const item = await this.calPoolInfo(tick);
        poolListDao.upsertOne(
          { tick0: item.tick0, tick1: item.tick1 },
          {
            $set: {
              tick0: item.tick0,
              tick1: item.tick1,
              lp: parseInt(item.lp),
              tvl: parseInt(item.tvl),
              volume24h: parseInt(item.volume24h),
              volume7d: parseInt(item.volume7d),
            },
          }
        );
      }
    }
  }
}
