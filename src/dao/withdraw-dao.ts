import { PreRes } from "../types/route";
import { BaseDao } from "./base-dao";

export type WithdrawStatus =
  | "pendingOrder"
  | "pendingCancel"
  | "order"
  | "error"
  | "completed"
  | "cancel";

export type WithdrawData = {
  id: string;
  rollUpHeight: number;
  approveHeight: number;
  cancelHeight: number;
  status: WithdrawStatus;

  pubkey: string;
  address: string;
  tick: string;
  amount: string;
  ts: number;

  commitParent: string;
  signMsg: string;
  paymentPsbt: string;
  approvePsbt: string;
  networkFee: number;
  inscriptionId: string;
  op: string;

  sig?: string;
  signedPaymentPsbt?: string;
  signedInscribePsbt: string;
  signedApprovePsbt?: string;
  rollUpTxid?: string;
  paymentTxid?: string;
  inscribeTxid?: string;
  approveTxid?: string;
  errMsg?: string;
  invalid?: boolean;
  failCount?: number;
  testFail?: boolean;
} & PreRes;

export class WithdrawDao extends BaseDao<WithdrawData> {
  upsertData(data: WithdrawData) {
    return this.upsertOne(
      { id: data.id, invalid: { $ne: true } },
      { $set: data }
    );
  }

  discardData(data: WithdrawData) {
    return this.updateOne(
      { id: data.id, invalid: { $ne: true } },
      { $set: { invalid: true } }
    );
  }

  findAll() {
    return this.find({ invalid: { $ne: true } });
  }
}
