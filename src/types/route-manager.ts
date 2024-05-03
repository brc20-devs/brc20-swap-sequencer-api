import { WithdrawStatus } from "../dao/withdraw-dao";

export type SetWithdrawStatusReq = {
  address: string;
  tick: string;
  oldStatus: WithdrawStatus;
  newStatus: WithdrawStatus;
};
