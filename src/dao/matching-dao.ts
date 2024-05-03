import { BaseDao } from "./base-dao";

export type MatchingData = {
  approveInscriptionId: string;
  transferInscriptionId: string;
  tick: string;
  consumeAmount: string;
  remainAmount: string;
  approveAddress: string;
  transferAddress: string;
  txid: string;
  ts: number;
  invalid?: boolean;
  rollback?: boolean;
};

export class MatchingDao extends BaseDao<MatchingData> {
  upsertData(data: MatchingData) {
    return this.upsertOne(
      {
        approveInscriptionId: data.approveInscriptionId,
        transferInscriptionId: data.transferInscriptionId,
      },
      { $set: data }
    );
  }

  findAll() {
    return this.find({ invalid: { $ne: true } });
  }

  async findLastOneByApproveId(approveInscriptionId: string) {
    return (
      await this.find({ approveInscriptionId }, { sort: { _id: -1 } })
    )[0];
  }

  async findOneByTransferId(transferId: string) {
    return await this.findOne({ transferId });
  }

  async findOneByTxid(txid: string) {
    return await this.findOne({ txid });
  }
}
