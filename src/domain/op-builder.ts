import hash from "object-hash";
import { exit } from "process";
import { DepositData } from "../dao/deposit-dao";
import { OpConfirmData } from "../dao/op-confirm-dao";
import { EventType, OpEventsRes } from "../types/api";
import { SpaceSnapshot } from "../types/domain";
import {
  CommitOp,
  ConditionalApproveOp,
  ModuleOp,
  OpEvent,
  OpType,
  TransferOp,
} from "../types/op";
import { lastItem as last } from "../utils/utils";
import { MAX_HEIGHT } from "./constant";
import { convertFuncInscription2Internal } from "./convert-struct";
import { Space } from "./space";
import { getEventKey, heightConfirmNum, need, record } from "./utils";

type CollectRangeRes = {
  endOp: OpEvent;
  endCommitOp: OpEvent;
  endOpSpace: Space;
  lastConfirmEventSnapshot: SpaceSnapshot;
  confirmedEventsFromStart2End: OpEvent[]; // ... (start, end]
  allEventsFromStart2End: OpEvent[]; // ......... (start, end]
  allEventsFromEnd: OpEvent[]; // ............... (end, ∞)
};

async function calculateHashFrom(startOpData: OpConfirmData): Promise<string> {
  let cursor = 0;
  let start = false;
  let res: OpEventsRes;
  let arr: OpEvent[] = [];
  do {
    res = await api.eventList({
      moduleId: config.moduleId,
      startHeight: startOpData.opEvent.height,
      cursor,
      size: config.eventListPerSize,
    });
    let count = 0;
    for (let i = 0; i < res.list.length; i++) {
      count++;

      const opEvent = res.list[i];
      if (getEventKey(opEvent) == getEventKey(startOpData.opEvent)) {
        start = true;
        continue;
      }
      if (!start) {
        continue;
      }
      arr.push(opEvent);
    }
    cursor = cursor + count;
  } while (cursor < res.total);

  return hash(arr);
}

async function calculateInfoFromRange(
  startOpData: OpConfirmData,
  expectedEndOp: OpEvent
): Promise<CollectRangeRes> {
  /**
   * --------------- events ----------------
   * xxxxxx(xxxxx.....].....................
   *     start       end      newest
   * ---------------------------------------
   *
   * x: represents a fixed inscription that will not change
   */
  const startHeight = startOpData.opEvent.height;
  const startSnapshot = startOpData.snapshot;
  const startOp = startOpData.opEvent;
  need(!!startHeight && !!startSnapshot && !!startOp);

  const confirmedEventsFromStart2End: OpEvent[] = [];
  const allEventsFromStart2End: OpEvent[] = [];
  const endOpSpace = new Space(startSnapshot, env.ContractConfig);

  let cursor = 0;
  let start = false;
  let realEndOp: OpEvent = startOp;
  let endCommitOp: OpEvent;
  let finish = false;
  let lastConfirmEventSnapshot: SpaceSnapshot = null;
  let res: OpEventsRes;
  do {
    res = await api.eventList({
      moduleId: config.moduleId,
      startHeight,
      cursor,
      size: config.eventListPerSize,
    });
    let count = 0;
    for (let i = 0; i < res.list.length; i++) {
      count++;

      const opEvent = res.list[i];
      if (getEventKey(opEvent) == getEventKey(startOp)) {
        if (
          expectedEndOp &&
          getEventKey(expectedEndOp) == getEventKey(startOp)
        ) {
          finish = true;
          break;
        } else {
          start = true;
          continue;
        }
      }
      if (!start) {
        continue;
      }

      endOpSpace.handleOpEvent(opEvent);

      realEndOp = opEvent;
      if (opEvent.op.op == OpType.commit) {
        endCommitOp = opEvent;
      }
      allEventsFromStart2End.push(opEvent);

      // record only the confirmed block
      if (heightConfirmNum(opEvent.height) >= config.insertHeightNum) {
        lastConfirmEventSnapshot = endOpSpace.snapshot(); // TOPERF
        confirmedEventsFromStart2End.push(opEvent);
      }

      if (getEventKey(expectedEndOp) == getEventKey(opEvent)) {
        finish = true;
        break;
      }
    }
    cursor = cursor + count;

    if (finish) {
      break;
    }
  } while (cursor < res.total);

  /**
   * @note the order of events may change, so the cursor may not be accurate
   */
  const allEventsFromEnd: OpEvent[] = [];
  if (cursor < res.total) {
    do {
      res = await api.eventList({
        moduleId: config.moduleId,
        startHeight,
        cursor,
        size: config.eventListPerSize,
      });
      for (let i = 0; i < res.list.length; i++) {
        const opEvent = res.list[i];
        allEventsFromEnd.push(opEvent);
      }
      cursor = cursor + res.list.length;
    } while (cursor < res.total);
  }

  return {
    endOpSpace,
    endOp: realEndOp,
    endCommitOp,
    lastConfirmEventSnapshot,
    confirmedEventsFromStart2End,
    allEventsFromEnd,
    allEventsFromStart2End,
  };
}

export class OpBuilder {
  private startOpData: OpConfirmData;
  private allEventsFromStart: OpEvent[];
  private endOpSpace: Space;
  private endOp: OpEvent;
  private endCommitOp: OpEvent;
  private isRestoring = false;
  private lastHash: string;
  private lashHeight: number;
  private moduleOp: ModuleOp;
  private rebuildFailCount = 0;

  get RebuildFailCount() {
    return this.rebuildFailCount;
  }

  get ModuleOp() {
    return this.moduleOp;
  }

  get IsRestoring() {
    return this.isRestoring;
  }

  get LastCommitOpEvent() {
    return this.endCommitOp;
  }

  get AllEventsFromStart() {
    return this.allEventsFromStart;
  }

  get AllEventsFromStartSnapshot() {
    return this.startOpData.snapshot;
  }

  get EndOpSpace() {
    return this.endOpSpace;
  }

  get EndOp() {
    return this.endOp;
  }

  constructor() {}

  private async getLastCommitOp(opEvent: OpEvent) {
    if (opEvent) {
      return opEvent;
    }
    let res = await opConfirmDao.findLastCommitOp();
    return res?.opEvent;
  }

  async init() {
    const res = await api.eventList({
      moduleId: config.moduleId,
      startHeight: config.startHeight,
      cursor: 0,
      size: 1,
    });
    const opEvent = res.list[0];
    if (!opEvent || opEvent.op.op !== OpType.deploy) {
      console.log(`Module: ${config.moduleId} not found`);
      exit(1);
    }
    console.log(`Module: ${config.moduleId}`);
    this.moduleOp = opEvent.op;

    const opData = await opConfirmDao.findLastOpWithSnapshot();
    if (opData) {
      this.startOpData = opData;
    } else {
      this.startOpData = {
        opEvent,
        snapshot: {
          assets: {
            swap: {},
            pendingSwap: {},
            available: {},
            pendingAvailable: {},
            approve: {},
            conditionalApprove: {},
          },
          assetsCheck: {},
          contractStatus: {
            kLast: {},
          },
        },
      };
      await opConfirmDao.upsertData(this.startOpData);
    }

    this.endOpSpace = new Space(this.startOpData.snapshot, env.ContractConfig);
    this.endOp = this.startOpData.opEvent;
    this.endCommitOp = await this.getLastCommitOp(null);

    await this.tick();
  }

  async tick() {
    need(this.startOpData.opEvent.height !== MAX_HEIGHT);

    // check if there are any updates to the event stream
    const hash = await calculateHashFrom(this.startOpData);
    if (this.lastHash == hash && this.lashHeight == env.NewestHeight) {
      return;
    }

    const res = await calculateInfoFromRange(this.startOpData, this.endOp);

    // support re-entry in case of exceptions
    this.allEventsFromStart = res.allEventsFromStart2End.concat(
      res.allEventsFromEnd
    );
    this.endOpSpace = res.endOpSpace;
    this.endOp = res.endOp;
    this.endCommitOp = await this.getLastCommitOp(res.endCommitOp);

    logger.info({
      tag: "rebuild",
      startInscriptionId: this.startOpData.opEvent.inscriptionId,
      startHeight: this.startOpData.opEvent.height,
      endCommitInscriptionId: this.endCommitOp?.inscriptionId,
      endCommitHeight: this.endCommitOp?.height,
      endInscriptionId: this.EndOp.inscriptionId,
      endHeight: this.EndOp.height,
      newestInscriptionId: last(this.AllEventsFromStart)?.inscriptionId,
      newestHeight: last(this.AllEventsFromStart)?.height,
    });

    this.isRestoring = true;
    try {
      await operator.rebuild(
        this.AllEventsFromStart,
        this.AllEventsFromStartSnapshot,
        true
      );
    } catch (err) {
      this.rebuildFailCount++;
      throw err;
    }
    this.rebuildFailCount = 0;
    this.isRestoring = false;

    // update confirm table
    if (res.confirmedEventsFromStart2End.length >= config.snapshotPerSize) {
      const list: OpConfirmData[] = res.confirmedEventsFromStart2End.map(
        (opEvent) => {
          return { opEvent };
        }
      );
      const lastItem = last(list);
      lastItem.snapshot = res.lastConfirmEventSnapshot;
      await opConfirmDao.insertMany(list);
      this.startOpData = lastItem;
    }

    // update db
    for (let i = 0; i < this.allEventsFromStart.length; i++) {
      const opEvent = this.allEventsFromStart[i];
      await opListDao.upsertData({ opEvent });

      // update history space
      const res = this.endOpSpace.handleOpEvent(opEvent);
      this.endOp = opEvent;

      if (opEvent.event == EventType.commit) {
        this.endCommitOp = opEvent;
        const op = opEvent.op as CommitOp;

        for (let i = 0; i < op.data.length; i++) {
          const item = convertFuncInscription2Internal(i, op);
          await record(opEvent.inscriptionId, item, res[i]);
        }

        await opCommitDao.updateInEventList(opEvent.inscriptionId);
      } else if (opEvent.event == EventType.transfer) {
        const op = opEvent.op as TransferOp;
        const data: DepositData = {
          address: opEvent.from,
          inscriptionId: opEvent.inscriptionId,
          height: opEvent.height,
          ts: opEvent.blocktime,
          txid: opEvent.txid,
          tick: op.tick,
          amount: op.amt,
          type: "direct",
        };
        await depositDao.upsertData(data);
      } else if (opEvent.event == EventType.conditionalApprove) {
        // not cancel withdraw
        if (opEvent.data.transfer) {
          const op = opEvent.op as ConditionalApproveOp;
          const data: DepositData = {
            address: opEvent.to,
            inscriptionId: opEvent.data.transfer,
            height: opEvent.height,
            ts: opEvent.blocktime,
            txid: opEvent.txid,
            tick: op.tick,
            amount: opEvent.data.transferMax,
            type: "matching",
          };
          await depositDao.upsertData(data);
        }
      }
    }

    this.lastHash = hash;
    this.lashHeight = env.NewestHeight;
  }
}
