import { BaseDao } from "./base-dao";

export type FeeRateData = {
  feeRate: number;
  height: number;
  timestamp: number;
};

export class FeeRateDao extends BaseDao<FeeRateData> {}
