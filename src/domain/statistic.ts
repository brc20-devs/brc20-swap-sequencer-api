import { decimalCal } from "../contract/bn";
import { MatchingData } from "../dao/matching-dao";
import { WithdrawData } from "../dao/withdraw-dao";
import { StatusStatisticReq } from "../types/route-status";
import { need } from "./utils";

const step = 3600 * 24;

type StatisticMap = {
  [key: string]: { [key: string]: { total: string; num: number } };
};

type DepositStatisticMap = {
  [key: string]: {
    [key: string]: { total: string; num: number; matching_num: number };
  };
};

export class Statistic {
  tick() {
    for (let key in this.cache) {
      if (Date.now() - this.cache[key].timestamp > this.cache[key].intervalMs) {
        delete this.cache[key];
      }
    }
  }

  private cache: {
    [key: string]: { timestamp: number; intervalMs: number; data: any };
  } = {};

  async summary(params: StatusStatisticReq) {
    let { tick, startTs, endTs } = params;
    startTs = startTs || 0;
    endTs = endTs || Infinity;

    const depositRes = await this.deposit();
    const withdrawRes = await this.withdraw();
    const matchingRes = await this.matching();
    const backlogRes = await this.backlog();
    let minDate = Infinity;
    let maxDate = 0;
    let arr = [depositRes, withdrawRes, matchingRes];
    let lastBacklog = 0;
    for (let i = 0; i < arr.length; i++) {
      const map2 = arr[i];
      const map = map2[tick] || [];
      for (let k in map) {
        const date = parseInt(k);
        if (date < minDate) {
          minDate = date;
        }
        if (date > maxDate) {
          maxDate = date;
        }
      }
    }
    let count = 0;
    let date = minDate;
    let ret: {
      date: string[];
      deposit_total: string[];
      deposit_num: number[];
      withdraw_total: string[];
      withdraw_num: number[];
      matching_total: string[];
      matching_num: number[];
      backlog: string[];
    } = {
      date: [],
      deposit_total: [],
      deposit_num: [],
      withdraw_total: [],
      withdraw_num: [],
      matching_total: [],
      matching_num: [],
      backlog: [],
    };

    while (date !== maxDate) {
      if (date > startTs && date < endTs) {
        ret.date.push(new Date(date * 1000).toLocaleDateString());
        ret.deposit_total.push(depositRes[tick][date]?.total || "0");
        ret.deposit_num.push(depositRes[tick][date]?.num || 0);
        ret.withdraw_total.push(withdrawRes[tick][date]?.total || "0");
        ret.withdraw_num.push(withdrawRes[tick][date]?.num || 0);
        ret.matching_total.push(matchingRes[tick][date]?.total || "0");
        ret.matching_num.push(depositRes[tick][date]?.matching_num || 0);
        const item = backlogRes[tick][date] || lastBacklog;
        ret.backlog.push(item);
        lastBacklog = item;
      }

      date += step;
      count++;
      need(count < 100000);
    }

    return ret;
  }

  async deposit(): Promise<DepositStatisticMap> {
    const key = "deposit";
    if (!this.cache[key]) {
      const res = await depositDao.find({});
      // tick --> date --> amount
      const map: DepositStatisticMap = {};
      for (let i = 0; i < res.length; i++) {
        const item = res[i];
        if (!map[item.tick]) {
          map[item.tick] = {};
        }
        const date = item.ts - (item.ts % step);
        if (!map[item.tick][date]) {
          map[item.tick][date] = { total: "0", num: 0, matching_num: 0 };
        }
        map[item.tick][date].total = decimalCal([
          map[item.tick][date].total,
          "add",
          item.amount,
        ]);
        map[item.tick][date].num++;
        if (item.type == "matching") {
          map[item.tick][date].matching_num++;
        }
      }
      this.cache[key] = {
        data: map,
        timestamp: Date.now(),
        intervalMs: 300_000,
      };
    }
    return this.cache[key].data;
  }

  async withdraw(): Promise<StatisticMap> {
    const key = "withdraw";
    if (!this.cache[key]) {
      const res = await withdrawDao.find({ status: "order" });
      // tick --> date --> amount
      const map: StatisticMap = {};
      for (let i = 0; i < res.length; i++) {
        const item = res[i];
        if (!map[item.tick]) {
          map[item.tick] = {};
        }
        const date = item.ts - (item.ts % step);
        if (!map[item.tick][date]) {
          map[item.tick][date] = { total: "0", num: 0 };
        }
        map[item.tick][date].total = decimalCal([
          map[item.tick][date].total,
          "add",
          item.amount,
        ]);
        map[item.tick][date].num++;
      }
      this.cache[key] = {
        data: map,
        timestamp: Date.now(),
        intervalMs: 300_000,
      };
    }
    return this.cache[key].data;
  }

  async matching(): Promise<StatisticMap> {
    const key = "matching";
    if (!this.cache[key]) {
      const res = await matchingDao.findAll();
      // tick --> date --> amount
      const map: StatisticMap = {};
      for (let i = 0; i < res.length; i++) {
        const item = res[i];
        if (!map[item.tick]) {
          map[item.tick] = {};
        }
        const date = item.ts - (item.ts % step);
        if (!map[item.tick][date]) {
          map[item.tick][date] = { total: "0", num: 0 };
        }
        map[item.tick][date].total = decimalCal([
          map[item.tick][date].total,
          "add",
          item.consumeAmount,
        ]);
        map[item.tick][date].num++;
      }
      this.cache[key] = {
        data: map,
        timestamp: Date.now(),
        intervalMs: 300_000,
      };
    }
    return this.cache[key].data;
  }

  async backlog(): Promise<any> {
    const key = "backlog";
    if (!this.cache[key]) {
      const res1 = await matchingDao.findAll();
      const res2 = await withdrawDao.find({ status: "order" });

      // tick --> date --> amount
      const map = {};
      for (let i = 0; i < res1.length; i++) {
        const item = res1[i];
        if (!map[item.tick]) {
          map[item.tick] = {};
        }
        const date = item.ts - (item.ts % step);
        if (!map[item.tick][date]) {
          map[item.tick][date] = this._backlog(res1, res2, item.tick, date);
        }
      }
      for (let i = 0; i < res2.length; i++) {
        const item = res2[i];
        if (!map[item.tick]) {
          map[item.tick] = {};
        }
        const date = item.ts - (item.ts % step);
        if (!map[item.tick][date]) {
          map[item.tick][date] = this._backlog(res1, res2, item.tick, date);
        }
      }

      this.cache[key] = {
        data: map,
        timestamp: Date.now(),
        intervalMs: 300_000,
      };
    }
    return this.cache[key].data;
  }

  private _backlog(
    res: MatchingData[],
    res2: WithdrawData[],
    tick: string,
    date: number
  ) {
    let total = "0";
    const map = {};
    for (let i = 0; i < res2.length; i++) {
      const item = res2[i];
      if (item.tick == tick && item.ts < date + step) {
        map[item.inscriptionId] = item.amount;
      }
    }
    for (let i = 0; i < res.length; i++) {
      const item = res[i];
      if (item.tick == tick && item.ts < date + step) {
        map[item.approveInscriptionId] = item.remainAmount;
      }
    }
    for (let k in map) {
      total = decimalCal([map[k], "add", total]);
    }

    return total;
  }
}
