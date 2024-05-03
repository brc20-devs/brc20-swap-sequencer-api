import { BaseDao } from "./base-dao";

export type TickData = {
  tick: string;
  decimal: string;
};

export class TickDao extends BaseDao<TickData> {}
