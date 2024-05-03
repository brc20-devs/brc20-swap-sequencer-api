import { Filter } from "mongodb";
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
  invalid?: boolean;
  invalidHandled?: boolean;
};

export class OpCommitDao extends BaseDao<OpCommitData> {
  upsertByParent(parent: string, data: Partial<OpCommitData>) {
    return this.upsertOne(
      { "op.parent": parent, invalid: { $ne: true } },
      { $set: data }
    );
  }

  async findLastCommitOp() {
    return (
      await this.find(
        { inscriptionId: { $exists: true }, invalid: { $ne: true } },
        { sort: { _id: -1 }, limit: 1 }
      )
    )[0];
  }

  async findUnCommitOp() {
    return (
      await this.find(
        { inscriptionId: { $exists: false }, invalid: { $ne: true } },
        { sort: { _id: -1 }, limit: 1 }
      )
    )[0];
  }

  async findByParent(parent: string) {
    return await this.findOne({ "op.parent": parent, invalid: { $ne: true } });
  }

  async findFromInscriptionId(inscriptionId: string) {
    let query: Filter<any> = { inscriptionId };
    if (!inscriptionId) {
      query = { inscriptionId: { $exists: false } };
    }
    let res = await this.findFrom(query);

    // ignore invalid
    res = res.filter((item) => {
      return !item.invalid;
    });

    return res;
  }

  async findNotInEventList() {
    const query = {
      inEventList: { $ne: true },
      invalid: { $ne: true },
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
