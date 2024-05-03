import { FastifyInstance } from "fastify";
import Joi from "joi";
import _ from "lodash";
import { bn, bnDecimal, decimalCal } from "../contract/bn";
import { Brc20 } from "../contract/brc20";
import { LP_DECIMAL, MAX_HEIGHT } from "../domain/constant";
import { isLp, notInEventCommitIds } from "../domain/utils";
import { Req, Res } from "../types/route";
import {
  StatusAssetsReq,
  StatusDepositMatching,
  StatusDepositReq,
  StatusDepositRes,
  StatusLiqReq,
  StatusStatisticReq,
  StatusStatisticRes,
  StatusStatusReq,
  StatusStatusRes,
  StatusSwapReq,
  StatusWithdrawMatching,
  StatusWithdrawReq,
  StatusWithdrawRes,
} from "../types/route-status";
import { getDate, lastItem, schema } from "../utils/utils";

const formatHeight = (height: number) => {
  return height == MAX_HEIGHT ? ("" as any) : height;
};

export function statusRoute(fastify: FastifyInstance, opts, done) {
  fastify.get(
    `/liq`,
    schema(
      Joi.object<StatusLiqReq>({
        address: Joi.string(),
        tick0: Joi.string(),
        tick1: Joi.string(),
        type: Joi.string(),
        startTime: Joi.number(),
        endTime: Joi.number(),
        start: Joi.number().required(),
        limit: Joi.number().required(),
      }),
      "get"
    ),
    async (req: Req<StatusLiqReq, "get">, res) => {
      const {
        address,
        tick0,
        tick1,
        type,
        limit,
        start,
        startTime,
        endTime,
        displayResult,
      } = req.query;
      const query = {
        // invalid: { $ne: true },
      };
      if (address) {
        query["address"] = address;
      }
      if (tick0) {
        query["tick0"] = tick0;
      }
      if (tick1) {
        query["tick1"] = tick1;
      }
      if (type) {
        query["type"] = type;
      }
      if (startTime) {
        query["ts"] = { $gte: Math.floor(startTime / 1000) };
      }
      if (endTime) {
        query["ts"] = { $lte: Math.floor(endTime / 1000) };
      }
      const display = displayResult ? 1 : 0;
      const total = await recordLiqDao.count(query);
      const list = await recordLiqDao.find(query, {
        limit,
        skip: start,
        sort: { _id: -1 },
        projection: { _id: 0, preResult: display, result: display },
      });
      list.forEach((item) => {
        (item as any).date = getDate(item.ts * 1000);
      });

      void res.send({ total, list });
    }
  );

  fastify.get(
    `/swap`,
    schema(
      Joi.object<StatusSwapReq>({
        address: Joi.string(),
        tick: Joi.string(),
        startTime: Joi.number(),
        endTime: Joi.number(),
        start: Joi.number().required(),
        limit: Joi.number().required(),
      }),
      "get"
    ),
    async (req: Req<StatusSwapReq, "get">, res) => {
      const { address, tick, limit, start, startTime, endTime, displayResult } =
        req.query;
      const query = {
        // invalid: { $ne: true },
      };
      if (address) {
        query["address"] = address;
      }
      if (tick) {
        query["tick"] = tick;
      }
      if (startTime) {
        query["ts"] = { $gte: Math.floor(startTime / 1000) };
      }
      if (endTime) {
        query["ts"] = { $lte: Math.floor(endTime / 1000) };
      }
      const display = displayResult ? 1 : 0;
      const total = await recordSwapDao.count(query);
      const list = await recordSwapDao.find(query, {
        limit,
        skip: start,
        sort: { _id: -1 },
        projection: { _id: 0, preResult: display, result: display },
      });
      list.forEach((item) => {
        (item as any).date = getDate(item.ts * 1000);
      });
      void res.send({ total, list });
    }
  );

  fastify.get(
    `/assets`,
    schema(
      Joi.object<StatusAssetsReq>({
        address: Joi.string(),
        tick: Joi.string(),
      }),
      "get"
    ),
    async (req: Req<StatusAssetsReq, "get">, res) => {
      const { address: specifiedAddress, tick: specifiedTick } = req.query;
      const ret = {};
      const map = operator.NewestSpace.Assets.dataRefer();

      for (const assetType in map) {
        const asset = map[assetType];
        ret[assetType] = {};
        for (const tick in asset) {
          const brc20 = asset[tick] as Brc20;
          if (bn(brc20.supply).gt("0")) {
            if (!specifiedTick || specifiedTick.includes(tick)) {
              ret[assetType][tick] = {
                balance: {},
                supply: bnDecimal(
                  brc20.supply,
                  isLp(brc20.tick) ? LP_DECIMAL : decimal.get(brc20.tick)
                ),
              };
            }

            for (const address in brc20.balance) {
              if (!specifiedAddress || specifiedAddress == address) {
                if (bn(brc20.balanceOf(address)).gt("0")) {
                  if (!specifiedTick || specifiedTick.includes(tick)) {
                    ret[assetType][tick].balance[address] = bnDecimal(
                      brc20.balanceOf(address),
                      isLp(brc20.tick) ? LP_DECIMAL : decimal.get(brc20.tick)
                    );
                  }
                }
              }
            }
          }
        }
      }
      void res.send(JSON.stringify(ret, null, 2));
    }
  );

  fastify.get(
    `/withdraw`,
    schema(
      Joi.object<StatusWithdrawReq>({
        address: Joi.string(),
        tick: Joi.string(),
        inscriptionId: Joi.string(),
        startTime: Joi.number(),
        endTime: Joi.number(),
        start: Joi.number(),
        limit: Joi.number(),
      }),
      "get"
    ),
    async (req: Req<StatusWithdrawReq, "get">, res: Res<StatusWithdrawRes>) => {
      const { address, tick, limit, start, startTime, endTime, inscriptionId } =
        req.query;
      const query = {
        // invalid: { $ne: true },
      };
      if (address) {
        query["address"] = address;
      }
      if (tick) {
        query["tick"] = tick;
      }
      if (startTime) {
        query["ts"] = { $gte: Math.floor(startTime / 1000) };
      }
      if (endTime) {
        query["ts"] = { $lte: Math.floor(endTime / 1000) };
      }
      if (inscriptionId) {
        query["inscriptionId"] = inscriptionId;
      }

      const total = await withdrawDao.count(query);
      const withdrawRes = await withdrawDao.find(query, {
        limit,
        skip: start,
        sort: { _id: -1 },
      });

      const ret: StatusWithdrawRes = {
        total,
        list: [],
        statistic: null,
        statisticTotal: null,
      };
      for (let i = 0; i < withdrawRes.length; i++) {
        const withdraw = withdrawRes[i];
        const matchingRes = await matchingDao.find({
          approveInscriptionId: withdraw.inscriptionId,
        });
        const matching: StatusWithdrawMatching[] = [];
        for (let j = 0; j < matchingRes.length; j++) {
          const item = matchingRes[j];
          const depositItem = await depositDao.findOne({
            inscriptionId: item.transferInscriptionId,
          });
          matching.push({
            deposit: {
              address: depositItem.address,
              inscriptionId: depositItem.inscriptionId,
              tick: depositItem.tick,
              amount: depositItem.amount,
              height: depositItem.height,
              txid: depositItem.txid,
              invalid: depositItem.invalid,
              date: getDate(depositItem.ts * 1000),
            },
            "matching-data": {
              consumeAmount: item.consumeAmount,
              remainAmount: item.remainAmount,
              txid: item.txid,
              invalid: item.invalid,
              date: getDate(item.ts * 1000),
            },
          });
        }
        ret.list.push({
          withdraw: {
            id: withdraw.id,
            status: withdraw.status,
            inscriptionId: withdraw.inscriptionId,
            address: withdraw.address,
            tick: withdraw.tick,
            amount: withdraw.amount,
            commitParent: withdraw.commitParent,
            rollUpHeight: formatHeight(withdraw.rollUpHeight),
            approveHeight: formatHeight(withdraw.approveHeight),
            cancelHeight: formatHeight(withdraw.cancelHeight),
            inscribeTxid: withdraw.inscribeTxid,
            rollUpTxid: withdraw.rollUpTxid,
            approveTxid: withdraw.approveTxid,
            invalid: withdraw.invalid,
            errMsg: withdraw.errMsg,
            date: getDate(withdraw.ts * 1000),
          },
          matching: matching,
        });
      }
      const statistic = _.cloneDeep(matching.statistic);
      for (const statisticAddress in statistic) {
        if (!address || statisticAddress == address) {
          //
        } else {
          delete statistic[statisticAddress];
        }
      }
      for (const address in statistic) {
        for (const approveId in statistic[address]) {
          if (tick && statistic[address][approveId].tick !== tick) {
            delete statistic[address][approveId];
          }
        }
      }
      ret.statistic = statistic;
      const statisticTotal = {};
      for (const address in statistic) {
        let total = "0";
        for (const approveId in statistic[address]) {
          const item = statistic[address][approveId];
          total = decimalCal([total, "add", item.remain]);
        }
        statisticTotal[address] = total;
      }
      ret.statisticTotal = statisticTotal;
      void res.send(ret);
    }
  );

  fastify.get(
    `/statistic`,
    schema(
      Joi.object<StatusStatisticReq>({
        tick: Joi.string().required(),
        startTs: Joi.number(),
        endTs: Joi.number(),
      }),
      "get"
    ),
    async (
      req: Req<StatusStatisticReq, "get">,
      res: Res<StatusStatisticRes>
    ) => {
      const data = await global.statistic.summary(req.query);
      return (res as any).view("statistic.html", {
        data,
      });
    }
  );

  fastify.get(
    `/deposit`,
    schema(
      Joi.object<StatusDepositReq>({
        address: Joi.string(),
        tick: Joi.string(),
        inscriptionId: Joi.string(),
        startTime: Joi.number(),
        endTime: Joi.number(),
        start: Joi.number(),
        limit: Joi.number(),
      }),
      "get"
    ),
    async (req: Req<StatusDepositReq, "get">, res: Res<StatusDepositRes>) => {
      const { address, tick, limit, start, startTime, endTime, inscriptionId } =
        req.query;
      const query = {
        // invalid: { $ne: true },
      };
      if (address) {
        query["address"] = address;
      }
      if (tick) {
        query["tick"] = tick;
      }
      if (startTime) {
        query["ts"] = { $gte: Math.floor(startTime / 1000) };
      }
      if (endTime) {
        query["ts"] = { $lte: Math.floor(endTime / 1000) };
      }
      if (inscriptionId) {
        query["inscriptionId"] = inscriptionId;
      }

      const total = await depositDao.count(query);
      const depositRes = await depositDao.find(query, {
        limit,
        skip: start,
        sort: { _id: -1 },
        projection: { _id: 0 },
      });

      const ret: StatusDepositRes = {
        total,
        list: [],
        statistic: null,
        statisticTotal: null,
      };
      for (let i = 0; i < depositRes.length; i++) {
        const deposit = depositRes[i];
        const matchingRes = await matchingDao.find({
          transferInscriptionId: deposit.inscriptionId,
        });
        const depositMatching: StatusDepositMatching[] = [];
        let matchingStatistic = "0";
        for (let j = 0; j < matchingRes.length; j++) {
          const item = matchingRes[j];
          const withdrawItem = await withdrawDao.findOne({
            inscriptionId: item.approveInscriptionId,
          });
          if (withdrawItem.invalid) {
            continue;
          }
          depositMatching.push({
            withdraw: {
              id: withdrawItem.id,
              status: withdrawItem.status,
              inscriptionId: withdrawItem.inscriptionId,
              address: withdrawItem.address,
              tick: withdrawItem.tick,
              amount: withdrawItem.amount,
              commitParent: withdrawItem.commitParent,
              rollUpHeight: formatHeight(withdrawItem.rollUpHeight),
              approveHeight: formatHeight(withdrawItem.approveHeight),
              cancelHeight: formatHeight(withdrawItem.cancelHeight),
              inscribeTxid: withdrawItem.inscribeTxid,
              rollUpTxid: withdrawItem.rollUpTxid,
              approveTxid: withdrawItem.approveTxid,
              invalid: withdrawItem.invalid,
              date: getDate(withdrawItem.ts * 1000),
            },
            "matching-data": {
              consumeAmount: item.consumeAmount,
              remainAmount: item.remainAmount,
              txid: item.txid,
              invalid: item.invalid,
              date: getDate(item.ts * 1000),
            },
          });
          matchingStatistic = decimalCal([
            matchingStatistic,
            "add",
            item.consumeAmount,
          ]);
        }

        let statistic = _.cloneDeep(matching.statistic);
        for (const statisticAddress in statistic) {
          if (!address || statisticAddress == address) {
            //
          } else {
            delete statistic[statisticAddress];
          }
        }
        for (const address in statistic) {
          for (const approveId in statistic[address]) {
            if (tick && statistic[address][approveId].tick !== tick) {
              delete statistic[address][approveId];
            }
          }
        }

        ret.list.push({
          deposit: {
            ...deposit,
            date: getDate(deposit.ts * 1000),
          },
          matching: depositMatching,
          matchingStatistic,
        });
        ret.statistic = statistic;

        const statisticTotal = {};
        for (const address in statistic) {
          let total = "0";
          for (const approveId in statistic[address]) {
            const item = statistic[address][approveId];
            total = decimalCal([total, "add", item.remain]);
          }
          statisticTotal[address] = total;
        }
        ret.statisticTotal = statisticTotal;
      }
      void res.send(ret);
    }
  );

  fastify.get(
    `/system_metric`,
    schema(Joi.object<StatusStatusReq>({}), "get"),
    async (req: Req<StatusStatusReq, "get">, res) => {
      metric.committing.set(opSender.Committing ? 1 : 0);
      metric.isRestoring.set(opBuilder.IsRestoring ? 1 : 0);
      metric.tryCommitCount.set(opSender.TryCommitCount);

      const ids = await notInEventCommitIds();
      metric.notInEventList.set(ids.length);

      const commitOpTotal = await opCommitDao.count({ invalid: { $ne: true } });
      metric.commitOpTotal.set(commitOpTotal);

      const curPriceInfo = await operator.calculateCurPriceInfo();
      const withdrawNum = await withdrawDao.count({});
      const withdrawErrorNum = await withdrawDao.count({ status: "error" });

      metric.curPriceInfo_gasPrice.set(parseFloat(curPriceInfo.gasPrice));
      metric.curPriceInfo_feeRate.set(parseFloat(curPriceInfo.feeRate));
      metric.curPriceInfo_satsPrice.set(parseFloat(curPriceInfo.satsPrice));

      metric.unCommitInfo_funcNum.set(operator.CommitData.op.data.length);
      metric.unCommitInfo_feeRate.set(parseFloat(operator.CommitData.feeRate));
      metric.unCommitInfo_gasPrice.set(
        parseFloat(operator.CommitData.op.gas_price)
      );
      metric.unCommitInfo_satsPrice.set(
        parseFloat(operator.CommitData.satsPrice)
      );

      metric.withdrawNum.set(withdrawNum);
      metric.withdrawErrorNum.set(withdrawErrorNum);

      res.headers["content-type"] = metric.register.contentType;
      void res.send(await metric.register.metrics());
    }
  );

  fastify.get(
    `/system`,
    schema(Joi.object<StatusStatusReq>({}), "get"),
    async (req: Req<StatusStatusReq, "get">, res: Res<StatusStatusRes>) => {
      const ids = await notInEventCommitIds();
      const commitOpTotal = await opCommitDao.count({ invalid: { $ne: true } });
      const res2 = await opCommitDao.find(
        { invalid: { $ne: true } },
        { sort: { _id: -1 }, limit: 2 }
      );

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

      const lastCommit = res2[1];
      const curPriceInfo = await operator.calculateCurPriceInfo();
      const withdrawNum = await withdrawDao.count({});
      const withdrawErrorNum = await withdrawDao.count({ status: "error" });

      const apiStatistic: StatusStatusRes["apiStatistic"] = {};
      for (const key in api.statistic) {
        const all = api.statistic[key];
        const avialable = all.filter((a) => {
          return a !== -1;
        });
        const min = Math.min(...avialable);
        const max = Math.max(...avialable);
        const sum = avialable.reduce((a, b) => {
          return a + b;
        }, 0);
        const avg = Math.floor(sum / avialable.length);
        apiStatistic[key] = {
          min,
          avg,
          max,
          total: all.length,
          errNum: all.length - avialable.length,
          last: lastItem(avialable),
        };
      }

      const ret: StatusStatusRes = {
        commiting: opSender.Committing,
        isRestoring: opBuilder.IsRestoring,
        notInEventList: ids.length,
        notInEventIds: ids,
        commitOpTotal,
        curPriceInfo,
        unCommitInfo: {
          funcNum: operator.CommitData.op.data.length,
          feeRate: operator.CommitData.feeRate,
          gasPrice: operator.CommitData.op.gas_price,
          satsPrice: operator.CommitData.satsPrice,
        },
        lastCommitInfo: lastCommit
          ? {
              funcNum: lastCommit.op.data.length,
              feeRate: lastCommit.feeRate,
              gasPrice: lastCommit.op.gas_price,
              satsPrice: lastCommit.satsPrice,
              inscriptionId: lastCommit.inscriptionId,
            }
          : null,
        sequencerUTXOAInfo: {
          totalCount: A.length,
          totalAmount: A.reduce((a, b) => {
            return a + b.satoshi;
          }, 0),
          nextUTXOAmount: A[0] ? A[0].satoshi : 0,
          utxos: A.map((v) => ({
            txid: v.txid,
            vout: v.vout,
            satoshi: v.satoshi,
          })),
        },
        sequencerUTXOBInfo: {
          totalCount: B.length,
          totalAmount: B.reduce((a, b) => {
            return a + b.satoshi;
          }, 0),
          nextUTXOAmount: B[0] ? B[0].satoshi : 0,
          utxos: B.map((v) => ({
            txid: v.txid,
            vout: v.vout,
            satoshi: v.satoshi,
          })),
        },
        withdrawNum,
        withdrawErrorNum,
        lastAggregateTimestamp: operator.LastAggregateTimestamp,
        apiStatistic,
        rebuildFailCount: opBuilder.RebuildFailCount,
      };
      void res.send(ret);
    }
  );

  done();
}
