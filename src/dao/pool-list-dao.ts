import { BaseDao } from "./base-dao";

export type PoolListData = {
  tick0: string;
  tick1: string;
  lp: number;
  tvl: number;
  volume24h: number;
  volume7d: number;
};

export class PoolListDao extends BaseDao<PoolListData> {}
