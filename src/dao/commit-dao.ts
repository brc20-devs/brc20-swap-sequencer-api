import { Result } from "../types/func";
import { CommitOp } from "../types/op";
import { BaseDao } from "./base-dao";

export type OpCommitData = {
  op: CommitOp;
  feeRate: string;
  satsPrice: string;
  result: Result[];
  inscriptionId?: string;
  txid?: string;
  inEventList?: boolean;
};

export class OpCommitDao extends BaseDao<OpCommitData> {
  upsertByParent(parent: string, data: Partial<OpCommitData>) {
    // remove result
    // data = _.cloneDeep(data);
    // delete data.result;

    return this.upsertOne({ "op.parent": parent }, { $set: data });
  }

  async findLastCommitedOp() {
    return (
      await this.find(
        { inscriptionId: { $exists: true } },
        { sort: { _id: -1 }, limit: 1 }
      )
    )[0];
  }

  async findUnCommitOp() {
    return (
      await this.find(
        { inscriptionId: { $exists: false } },
        { sort: { _id: -1 }, limit: 1 }
      )
    )[0];
  }

  async findByParent(parent: string) {
    return await this.findOne({ "op.parent": parent });
  }

  async findNotInIndexer() {
    const query = {
      inEventList: { $ne: true },
    };
    return await this.find(query);
  }

  async updateInEventList(inscriptionId: string) {
    await opCommitDao.updateOne(
      { inscriptionId },
      { $set: { inEventList: true } }
    );
  }
}
