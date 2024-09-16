import { GasHistoryItem } from "../types/route";
import { BaseDao } from "./base-dao";

export type RecordGasData = {
  id: string;
  address: string;
} & GasHistoryItem;

export class RecordGasDao extends BaseDao<RecordGasData> {
  upsertData(data: RecordGasData) {
    return this.upsertOne({ id: data.id }, { $set: data });
  }
}
