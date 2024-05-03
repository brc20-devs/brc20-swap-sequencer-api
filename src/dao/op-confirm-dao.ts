import { SpaceSnapshot } from "../types/domain";
import { OpEvent, OpType } from "../types/op";
import { BaseDao } from "./base-dao";

export type OpConfirmData = {
  opEvent: OpEvent;
  snapshot?: SpaceSnapshot;
};

export class OpConfirmDao extends BaseDao<OpConfirmData> {
  async findLastOpWithSnapshot() {
    return (
      await this.find(
        { snapshot: { $exists: true } },
        { sort: { _id: -1 }, limit: 1 }
      )
    )[0];
  }
  async findLastCommitOp() {
    return (
      await this.find(
        { "opEvent.op.op": OpType.commit },
        { sort: { _id: -1 }, limit: 1 }
      )
    )[0];
  }

  async upsertData(data: OpConfirmData) {
    await this.upsertOne(
      {
        "opEvent.event": data.opEvent.event,
        "opEvent.inscriptionId": data.opEvent.inscriptionId,
        "opEvent.txid": data.opEvent.txid,
      },
      { $set: data }
    );
  }
}
