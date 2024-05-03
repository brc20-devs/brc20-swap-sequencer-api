import { ContractResult } from "../types/func";
import { OpEvent } from "../types/op";
import { checkOpEvent, getEventKey } from "./utils";

export class EventsChecker {
  private eventResultMap: { [key: string]: ContractResult[] } = {};
  private commitResultMap: { [key: string]: ContractResult[] } = {};
  constructor() {}

  getEventResult(event: OpEvent) {
    checkOpEvent(event);
    const key = getEventKey(event);
    return this.eventResultMap[key];
  }

  addEventResult(event: OpEvent, result: ContractResult[]) {
    checkOpEvent(event);
    const key = getEventKey(event);
    this.eventResultMap[key] = result || null;
  }

  getCommmitResult(parent: string) {
    return this.commitResultMap[parent];
  }

  addCommitResult(parent: string, result: ContractResult[]) {
    this.commitResultMap[parent] = result || null;
  }
}
