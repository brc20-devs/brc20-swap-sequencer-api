import { Result } from "../types/func";
import { BaseDao } from "./base-dao";

export type RecordApproveData = {
  id: string;
  rollupInscriptionId: string;
  address: string;
  tick: string;
  amount: string;
  type: "approve" | "decreaseApprove";
  preResult: Result;
  result: Result;
  ts: number;
  invalid?: boolean;
};

export class RecordApproveDao extends BaseDao<RecordApproveData> {
  upsertData(data: RecordApproveData) {
    return this.upsertOne({ id: data.id }, { $set: data });
  }
}
