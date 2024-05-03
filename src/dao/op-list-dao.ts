import { ContractResult } from "../types/func";
import { OpEvent, OpType } from "../types/op";
import { BaseDao } from "./base-dao";

export type OpListData = {
  opEvent: OpEvent;
  result?: ContractResult[];
  invalid?: boolean;
};

export class OpListDao extends BaseDao<OpListData> {
  async findLastCommit() {
    return (
      await this.find(
        { "opEvent.op.op": OpType.commit },
        { sort: { _id: -1 }, limit: 1 }
      )
    )[0];
  }

  async upsertData(data: OpListData) {
    await opListDao.upsertOne(
      {
        "opEvent.event": data.opEvent.event,
        "opEvent.inscriptionId": data.opEvent.inscriptionId,
        "opEvent.txid": data.opEvent.txid,
      },
      { $set: data }
    );
  }

  /**
   * @note it may be different from the order on the chain
   */
  async findFromEvent(opEvent: OpEvent, include: boolean) {
    return this.findFrom(
      {
        "opEvent.inscriptionId": opEvent.inscriptionId,
        "opEvent.event": opEvent.event,
        "opEvent.txid": opEvent.txid,
      },
      include
    );
  }
}
