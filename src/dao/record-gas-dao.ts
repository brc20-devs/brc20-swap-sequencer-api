import { GasHistoryItem } from "../types/route";
import { BaseDao } from "./base-dao";

export type RecordGasData = {
  id: string;
  address: string;
  invalid?: boolean;
} & GasHistoryItem;

export class RecordGasDao extends BaseDao<RecordGasData> {
  upsertData(data: RecordGasData) {
    return this.upsertOne({ id: data.id }, { $set: data });
  }
}
