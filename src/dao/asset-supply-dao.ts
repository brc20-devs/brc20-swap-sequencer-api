import { BaseDao } from "./base-dao";

export type AssetSupply = {
  cursor: number;
  commitParent: string; // In which commit was the balance updated
  height: number;

  tick: string;
  assetType: string;
  supply: string;
};

export class AssetSupplyDao extends BaseDao<AssetSupply> {
  async upsertData(data: AssetSupply) {
    await this.upsertOne(
      { tick: data.tick, assetType: data.assetType },
      { $set: data }
    );
  }
}
