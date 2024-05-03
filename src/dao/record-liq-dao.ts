import { Result } from "../types/func";
import { LiqHistoryItem } from "../types/route";
import { BaseDao } from "./base-dao";

export type RecordLiqData = {
  id: string;
  rollupInscriptionId: string;
  address: string;
  preResult: Result;
  result: Result;
  invalid?: boolean;
} & LiqHistoryItem;

export class RecordLiqDao extends BaseDao<RecordLiqData> {
  upsertData(data: RecordLiqData) {
    return this.upsertOne({ id: data.id }, { $set: data });
  }
}
