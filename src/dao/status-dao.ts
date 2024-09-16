import { OpEvent } from "../types/op";
import { BaseDao } from "./base-dao";

export type StatusData = {
  initedDB: boolean;
  snapshotLastCommitId: string;
  snapshotLastOpEvent: OpEvent;
  confirmedLastOpEvent: OpEvent;
  mempoolLastOpEvent: OpEvent;
};

export class StatusDao extends BaseDao<StatusData> {
  async findStatus() {
    return await this.findOne({ id: 1 });
  }

  async upsertStatus(data: Partial<StatusData>) {
    await this.upsertOne({ id: 1 }, { $set: data });
  }
}
