import { Result } from "../types/func";
import { SwapHistoryItem } from "../types/route";
import { BaseDao } from "./base-dao";

export type RecordSwapData = {
  id: string;
  rollupInscriptionId: string;
  address: string;
  preResult: Result;
  result: Result;
  invalid?: boolean;
} & SwapHistoryItem;

export class RecordSwapDao extends BaseDao<RecordSwapData> {
  upsertData(data: RecordSwapData) {
    return this.upsertOne({ id: data.id }, { $set: data });
  }
}
