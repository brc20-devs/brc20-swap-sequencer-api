import hash from "object-hash";
import { exit } from "process";
import { allAssetType } from "../contract/assets";
import { bnDecimal } from "../contract/bn";
import { DepositData } from "../dao/deposit-dao";
import { EventType, InscriptionEventsRes } from "../types/api";
import { ContractResult } from "../types/func";
import {
  CommitOp,
  ConditionalApproveOp,
  ModuleOp,
  OpEvent,
  OpType,
  TransferOp,
} from "../types/op";
import { LP_DECIMAL, UNCONFIRM_HEIGHT } from "./constant";
import { convertFuncInscription2Internal } from "./convert-struct";
import { internal_server_error } from "./error";
import { Space, SpaceType } from "./space";
import {
  apiEventToOpEvent,
  getConfirmedNum,
  getSnapshotObjFromDao,
  isLp,
  need,
  record,
  sysFatal,
} from "./utils";

const TAG = "builder";

type AssetProcessingData = {
  cursor: number;
  height: number;
  commitParent?: string;
  displayBalance: string;
  opType: OpType;
};

export class Builder {
  private lastHandledHeight = 0;

  /**
   * events stream (chain):
   * -=-= snapshot -=-=|-=-= confirmed -=-=|-=-= mempool -=-=|-=-= pending -=-=
   */
  private snapshotSpace: Space;
  private confirmedSpace: Space;
  private mempoolSpace: Space;

  private snapshotToConfirmedHash: number;
  private confirmedToMempoolHash: number;
  private moduleOp: ModuleOp;

  private isResetPendingSpace = true;
  private needResetPendingSpace = true;

  get ModuleOp() {
    return this.moduleOp;
  }

  get IsResetPendingSpace() {
    return this.isResetPendingSpace;
  }

  get SnapshotSpaceCursor() {
    return this.snapshotSpace?.LastHandledApiEvent?.cursor || 0;
  }

  get ConfirmedSpaceCursor() {
    return this.confirmedSpace?.LastHandledApiEvent?.cursor || 0;
  }

  get MempoolSpaceCursor() {
    return this.mempoolSpace?.LastHandledApiEvent?.cursor || 0;
  }

  constructor() {}

  async calculateHash(cursor: number, size: number) {
    if (size <= 0) {
      return null;
    }
    need(size < 10000, "size too big");
    const res = await api.eventRawList({
      moduleId: config.moduleId,
      cursor,
      size,
    });
    return hash(res.detail);
  }

  async init() {
    const res = await api.eventRawList({
      moduleId: config.moduleId,
      cursor: 0,
      size: 1,
    });
    const opEvent = await apiEventToOpEvent(res.detail[0], 0);
    if (!opEvent || opEvent.op.op !== OpType.deploy) {
      console.log(`Module: ${config.moduleId} not found`);
      exit(1);
    }
    console.log(`Module: ${config.moduleId}`);
    this.moduleOp = opEvent.op;

    const snapshotStatus = await statusDao.findStatus();
    const snapshot = await getSnapshotObjFromDao();
    this.snapshotSpace = new Space(
      snapshot,
      env.ContractConfig,
      snapshotStatus.snapshotLastCommitId,
      snapshotStatus.snapshotLastOpEvent,
      true, // note
      SpaceType.snapshot
    );
    await this.restoreEventDao();

    let hasNext = false;
    do {
      console.log("rebuild from cursor: ", this.SnapshotSpaceCursor);
      hasNext = await this.move({
        updateSnapshotSpace: true,
        updateConfirmedSpace: false,
        updateMempoolSpace: false,
        startCursor: this.SnapshotSpaceCursor + 1,
      });
    } while (hasNext);
    console.log("rebuild success!");
    await this.updateAllSpace(true);
  }

  private async restoreEventDao() {
    const status = await statusDao.findStatus();
    if (status.confirmedLastOpEvent?.cursor) {
      let cursor = status.confirmedLastOpEvent.cursor;
      let res: InscriptionEventsRes;
      logger.debug({ tag: TAG, msg: "restore event begin", start: cursor });
      do {
        res = await api.eventRawList({
          moduleId: config.moduleId,
          cursor,
          size: config.eventListPerSize,
        });
        for (let i = 0; i < res.detail.length; i++) {
          const event = await apiEventToOpEvent(res.detail[i], cursor);
          if (event.height == UNCONFIRM_HEIGHT) {
            break;
          }
          if (event.valid) {
            await opEventDao.upsertData(event);
            await this.updateDepositData(event);
            if (event.op.op == OpType.commit) {
              await opCommitDao.updateOne(
                { txid: event.txid },
                { $set: { inEventList: true } }
              );
            }
            // await this.updateRecord(event, res);
          }
          cursor++;
        }
      } while (res.detail.length >= config.eventListPerSize);
      logger.debug({ tag: TAG, msg: "restore event end", end: cursor });
    }
  }

  private async updateRecord(opEvent: OpEvent, res: ContractResult[]) {
    if (opEvent.event == EventType.commit) {
      const op = opEvent.op as CommitOp;
      for (let i = 0; i < op.data.length; i++) {
        const item = convertFuncInscription2Internal(i, op, opEvent.height);
        await record(opEvent.inscriptionId, item, res[i]);
      }

      await opCommitDao.updateInEventList(opEvent.inscriptionId);
    }
  }

  private async updateDepositData(opEvent: OpEvent) {
    if (opEvent.event == EventType.transfer) {
      const op = opEvent.op as TransferOp;
      const data: DepositData = {
        cursor: opEvent.cursor,
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
          cursor: opEvent.cursor,
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

  async move(params: {
    updateSnapshotSpace: boolean;
    updateConfirmedSpace: boolean;
    updateMempoolSpace: boolean;
    startCursor: number;
  }) {
    const startTime = Date.now();
    const {
      startCursor,
      updateSnapshotSpace,
      updateConfirmedSpace,
      updateMempoolSpace,
    } = params;

    const res = await api.eventRawList({
      moduleId: config.moduleId,
      cursor: startCursor,
      size: config.eventListPerSize,
    });

    logger.debug({
      tag: TAG,
      msg: "move-begin",
      cursor: startCursor,
      length: res.detail.length,
      total: res.total,
    });

    let moveMempoolSpaceCursor = false;
    let moveConfirmedSpaceCursor = false;
    let moveSnapshotSpaceCursor = false;

    /*****************************************************************
     * Update space
     *****************************************************************/
    let preHeight = res.detail[0]?.height;
    for (let i = 0; i < res.detail.length; i++) {
      const event = await apiEventToOpEvent(res.detail[i], startCursor + i);
      // check open api
      need(event.height >= preHeight, null, null, true);

      if (updateSnapshotSpace) {
        // udpate snapshot space
        if (getConfirmedNum(event.height) > config.insertHeightNum) {
          try {
            this.snapshotSpace.handleEvent(event);
          } catch (err) {
            sysFatal({
              tag: TAG,
              msg: "snapshot space update error",
              error: err.message,
              stack: err.stack,
            });
          }
          moveSnapshotSpaceCursor = true;
        }
      }

      // update confirmed space
      if (updateConfirmedSpace) {
        if (getConfirmedNum(event.height) > 0) {
          const res = this.confirmedSpace.handleEvent(event);
          moveConfirmedSpaceCursor = true;

          if (event.valid) {
            await opEventDao.upsertData(event);
            await this.updateDepositData(event);
            await this.updateRecord(event, res);
            await statusDao.upsertStatus({
              confirmedLastOpEvent: this.confirmedSpace.LastHandledApiEvent,
            });
          }
        }
      }

      if (updateMempoolSpace) {
        /****************************************
         * collector processing:
         * 1. collect data
         * 2. data processing (option)
         * 3. cursor++
         ****************************************/

        this.mempoolSpace.handleEvent(
          event,
          /*2*/ (item) => {
            let commitParent: string;
            if (event.op.op == OpType.commit) {
              commitParent = event.op.parent;
            }
            const cursor = event.cursor;
            const height = event.height;
            const opType = event.op.op;

            let tickDecimal: string;
            if (isLp(item.raw.tick)) {
              tickDecimal = LP_DECIMAL;
            } else {
              tickDecimal = decimal.get(item.raw.tick);
            }
            (item.processing as AssetProcessingData) = {
              cursor,
              height,
              displayBalance: bnDecimal(item.raw.balance, tickDecimal),
              commitParent,
              opType,
            };
          }
        );
        moveMempoolSpaceCursor = true;

        if (event.valid) {
          await opEventDao.upsertData(event);
          await this.updateDepositData(event);
        }
      }

      if (moveMempoolSpaceCursor && !this.needResetPendingSpace) {
        await operator.handleEvent(event, false);
      }
    }

    /*****************************************************************
     * Update snapshot
     *****************************************************************/
    if (moveSnapshotSpaceCursor) {
      const preSnapshotSpaceCursor =
        this.snapshotSpace.NotifyDataCollector.StartCursor;
      if (
        this.SnapshotSpaceCursor - preSnapshotSpaceCursor >
        config.snapshotPerSize
      ) {
        try {
          await mongoUtils.startTransaction(async () => {
            const assetList = this.snapshotSpace.NotifyDataCollector.AssetList;
            const klistList = this.snapshotSpace.NotifyDataCollector.KlastList;
            const tickSet: Set<string> = new Set();
            for (let i = 0; i < assetList.length; i++) {
              const item = assetList[i];
              await snapshotAssetDao.upsertData(item.raw);
              tickSet.add(item.raw.tick);
            }
            for (let i = 0; i < klistList.length; i++) {
              const item = klistList[i];
              await snapshotKLastDao.upsertData(item.raw);
            }
            for (let i = 0; i < allAssetType.length; i++) {
              const assetType = allAssetType[i];
              for (const tick of tickSet) {
                await snapshotSupplyDao.upsertData({
                  tick,
                  assetType,
                  supply:
                    this.snapshotSpace.Assets.dataRefer()[assetType][tick]
                      .Supply,
                });
              }
            }
            await statusDao.upsertStatus({
              snapshotLastCommitId: this.snapshotSpace.LastCommitId,
              snapshotLastOpEvent: this.snapshotSpace.LastHandledApiEvent,
            });
          });
          this.snapshotSpace.NotifyDataCollector.reset(
            this.SnapshotSpaceCursor
          );
        } catch (err) {
          logger.error({
            tag: TAG,
            msg: "snapshot-update-fail",
            error: err.message,
            stack: err.stack,
            snapshotSpaceCursor: this.SnapshotSpaceCursor,
            preSnapshotSpaceCursor,
          });
        }
      }
    }

    /*****************************************************************
     * Update asset
     *****************************************************************/
    if (moveMempoolSpaceCursor) {
      try {
        await mongoUtils.startTransaction(async () => {
          const assetList = this.mempoolSpace.NotifyDataCollector.AssetList;
          for (let i = 0; i < assetList.length; i++) {
            const item = assetList[i];
            const processing = item.processing as AssetProcessingData;
            await assetDao.upsertData({
              assetType: item.raw.assetType,
              tick: item.raw.tick,
              address: item.raw.address,
              balance: item.raw.balance,
              cursor: processing.cursor,
              height: processing.height,
              commitParent: processing.commitParent,
              displayBalance: processing.displayBalance,
            });
            await assetSupplyDao.upsertData({
              cursor: processing.cursor,
              height: processing.height,
              commitParent: processing.commitParent,
              tick: item.raw.tick,
              assetType: item.raw.assetType,
              supply:
                this.mempoolSpace.Assets.dataRefer()[item.raw.assetType][
                  item.raw.tick
                ].Supply,
            });
          }
          await statusDao.upsertStatus({
            mempoolLastOpEvent: this.mempoolSpace.LastHandledApiEvent,
          });
        });
        this.mempoolSpace.NotifyDataCollector.reset(
          this.mempoolSpace.LastHandledApiEvent.cursor
        );
      } catch (err) {
        logger.error({
          tag: TAG,
          msg: "asset-update-fail-1",

          error: err.message,
          stack: err.stack,
        });
      }
    }

    /*****************************************************************
     * Update hash
     *****************************************************************/
    if (moveSnapshotSpaceCursor || moveConfirmedSpaceCursor) {
      this.snapshotToConfirmedHash = await this.calculateHash(
        this.SnapshotSpaceCursor,
        this.ConfirmedSpaceCursor - this.SnapshotSpaceCursor + 1
      );
    }
    if (moveConfirmedSpaceCursor || moveMempoolSpaceCursor) {
      this.confirmedToMempoolHash = await this.calculateHash(
        this.ConfirmedSpaceCursor,
        this.MempoolSpaceCursor - this.ConfirmedSpaceCursor + 1
      );
    }

    const hasNext = res.detail.length == config.eventListPerSize;

    const ht = Date.now() - startTime;
    logger.debug({ tag: TAG, msg: "move-end", ht });
    return hasNext;
  }

  async hasReorg() {
    if (
      !this.snapshotToConfirmedHash ||
      this.SnapshotSpaceCursor == this.ConfirmedSpaceCursor
    ) {
      return false;
    }
    const size = this.ConfirmedSpaceCursor - this.SnapshotSpaceCursor + 1;
    const hash = await this.calculateHash(this.SnapshotSpaceCursor, size);
    const oldHash = this.confirmedToMempoolHash;
    return hash !== oldHash;
  }

  async hasUnconfirmedDiscord() {
    if (
      !this.confirmedToMempoolHash ||
      this.ConfirmedSpaceCursor == this.MempoolSpaceCursor
    ) {
      return false;
    }
    const size = this.MempoolSpaceCursor - this.ConfirmedSpaceCursor + 1;
    const hash = await this.calculateHash(this.ConfirmedSpaceCursor, size);
    const oldHash = this.confirmedToMempoolHash;
    return hash !== oldHash;
  }

  async updateMempoolSpace() {
    logger.debug({
      tag: TAG,
      msg: "updateMempool",
      snapshotSpaceCursor: this.SnapshotSpaceCursor,
      confirmedSpaceCursor: this.ConfirmedSpaceCursor,
      mempoolSpaceCursor: this.MempoolSpaceCursor,
    });
    await this.move({
      updateSnapshotSpace: false,
      updateConfirmedSpace: false,
      updateMempoolSpace: true,
      startCursor: this.MempoolSpaceCursor + 1,
    });
  }

  async updateSnapshotSpace() {
    logger.debug({
      tag: TAG,
      msg: "updateSnapshot",
      snapshotSpaceCursor: this.SnapshotSpaceCursor,
      confirmedSpaceCursor: this.ConfirmedSpaceCursor,
      mempoolSpaceCursor: this.MempoolSpaceCursor,
    });
    await this.move({
      updateSnapshotSpace: true,
      updateConfirmedSpace: false,
      updateMempoolSpace: false,
      startCursor: this.SnapshotSpaceCursor + 1,
    });
  }

  async updateConfirmedSpace() {
    logger.debug({
      tag: TAG,
      msg: "updateConfirmed",
      snapshotSpaceCursor: this.SnapshotSpaceCursor,
      confirmedSpaceCursor: this.ConfirmedSpaceCursor,
      mempoolSpaceCursor: this.MempoolSpaceCursor,
      lastHandledHeight: this.lastHandledHeight,
    });
    await this.move({
      updateSnapshotSpace: false,
      updateConfirmedSpace: true,
      updateMempoolSpace: false,
      startCursor: this.ConfirmedSpaceCursor + 1,
    });
  }

  private resetSpace(spaceType: SpaceType, from: Space) {
    logger.debug({
      tag: TAG,
      msg: "reset space",
      space: spaceType,
      from: from.SpaceType,
    });
    if (spaceType == SpaceType.snapshot) {
      throw new Error(internal_server_error);
    } else if (spaceType == SpaceType.confirmed) {
      this.confirmedSpace = new Space(
        from.snapshot(),
        env.ContractConfig,
        from.LastCommitId,
        from.LastHandledApiEvent,
        false, // note
        SpaceType.confirmed
      );
    } else if (spaceType == SpaceType.mempool) {
      this.mempoolSpace = new Space(
        from.snapshot(),
        env.ContractConfig,
        from.LastCommitId,
        from.LastHandledApiEvent,
        true, // note
        SpaceType.mempool
      );
    } else {
      throw new Error(internal_server_error);
    }
  }

  private async updateAllSpace(forceResetFromSnapshotSpace: boolean) {
    this.needResetPendingSpace = false;

    // determine whether to reset the cursor
    if (forceResetFromSnapshotSpace) {
      this.needResetPendingSpace = true;
      this.resetSpace(SpaceType.confirmed, this.snapshotSpace);
      this.resetSpace(SpaceType.mempool, this.snapshotSpace);
    } else {
      const blockHeight = await api.blockHeight();

      // handle reorg
      if (blockHeight !== this.lastHandledHeight) {
        this.lastHandledHeight = blockHeight;
        if (await this.hasReorg()) {
          this.needResetPendingSpace = true;
          this.resetSpace(SpaceType.confirmed, this.snapshotSpace);
          this.resetSpace(SpaceType.mempool, this.snapshotSpace);
        }
      }
    }

    // handle mempool discard
    if (await this.hasUnconfirmedDiscord()) {
      this.needResetPendingSpace = true;
      this.resetSpace(SpaceType.mempool, this.confirmedSpace);
    }

    // update space
    await this.updateSnapshotSpace();
    await this.updateConfirmedSpace();
    await this.updateMempoolSpace();

    if (this.needResetPendingSpace) {
      this.isResetPendingSpace = true;
      await operator.resetPendingSpace(this.mempoolSpace);
      this.isResetPendingSpace = false;
    }
  }

  private forceReset = false;
  private retryCount = 0;
  async tick() {
    logger.debug({ tag: TAG, msg: "builder tick" });

    // idempotent
    try {
      logger.debug({
        tag: TAG,
        msg: "update space",
        forceReset: this.forceReset,
        retryCount: this.retryCount,
      });
      await this.updateAllSpace(this.forceReset);
      this.forceReset = false;
      this.retryCount = 0;
    } catch (err) {
      logger.error({
        tag: TAG,
        msg: "update space error",
        error: err.message,
        stack: err.stack,
      });
      this.forceReset = true;
      this.retryCount++;

      // Do not throw exceptions, as it may affect the execution of the operator
      // throw err;
    }
  }
}
