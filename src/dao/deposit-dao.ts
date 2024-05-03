import { DepositType } from "../types/route";
import { BaseDao } from "./base-dao";

export type DepositData = {
  address: string;
  inscriptionId: string;
  tick: string;
  amount: string;
  height: number;
  ts: number;
  txid: string;
  type: DepositType;
  invalid?: boolean;
};

export class DepositDao extends BaseDao<DepositData> {
  upsertData(data: DepositData) {
    if (!data.ts) {
      delete data.ts;
    }
    return this.upsertOne(
      { inscriptionId: data.inscriptionId },
      { $set: data }
    );
  }
}
