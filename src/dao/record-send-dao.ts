import { Result } from "../types/func";
import { BaseDao } from "./base-dao";

export type RecordSendData = {
  id: string;
  rollupInscriptionId: string;
  address: string;
  tick: string;
  amount: string;
  to: string;
  preResult: Result;
  result: Result;
  ts: number;
  invalid?: boolean;
};

export class RecordSendDao extends BaseDao<RecordSendData> {
  upsertData(data: RecordSendData) {
    return this.upsertOne({ id: data.id }, { $set: data });
  }
}
