import * as bitcoin from "bitcoinjs-lib";
import { Registry } from "prom-client";
import { config } from "./config";
import { ContractLoader } from "./contract/contract-loader";
import { AssetDao } from "./dao/asset-dao";
import { AssetSupplyDao } from "./dao/asset-supply-dao";
import { OpCommitDao } from "./dao/commit-dao";
import { DepositDao } from "./dao/deposit-dao";
import { OpEventDao } from "./dao/event-dao";
import { FeeRateDao } from "./dao/feerate-dao";
import { MatchingDao } from "./dao/matching-dao";
import { PoolListDao } from "./dao/pool-list-dao";
import { RecordApproveDao } from "./dao/record-approve-dao";
import { RecordGasDao } from "./dao/record-gas-dao";
import { RecordLiqDao } from "./dao/record-liq-dao";
import { RecordSendDao } from "./dao/record-send-dao";
import { RecordSwapDao } from "./dao/record-swap-dao";
import { SequencerTxDao } from "./dao/sequencer-tx-dao";
import { SequencerUtxoDao } from "./dao/sequencer-utxo-dao";
import { SnapshotAssetDao } from "./dao/snapshot-asset-dao";
import { SnapshotKLastDao } from "./dao/snapshot-klast-dao";
import { SnapshotSupplyDao } from "./dao/snapshot-supply-dao";
import { StatusDao } from "./dao/status-dao";
import { TickDao } from "./dao/tick-dao";
import { WithdrawDao } from "./dao/withdraw-dao";
import { API } from "./domain/api";
import { Builder } from "./domain/builder";
import { ConditionalWithdraw } from "./domain/conditional-withdraw";
import { BITCOIN_NAME } from "./domain/constant";
import { Decimal } from "./domain/decimal";
import { Deposit } from "./domain/deposit";
import { Env } from "./domain/env";
import { Keyring } from "./domain/keyring";
import { Matching } from "./domain/matching";
import { Metric } from "./domain/metric";
import { Operator } from "./domain/operator";
import { Query } from "./domain/query";
import { Sender } from "./domain/sender";
import { Statistic } from "./domain/statistic";
import { need } from "./domain/utils";
import { DirectWithdraw } from "./domain/withdraw";
import { AsyncTimer } from "./utils/async-timer";
import { DateLogger } from "./utils/logger";
import { MongoUtils } from "./utils/mongo-utils";
import { loggerError } from "./utils/utils";

export async function init(launch = true) {
  const networks = {
    testnet: bitcoin.networks.testnet,
    bitcoin: bitcoin.networks.bitcoin,
    regtest: bitcoin.networks.regtest,
  };

  [
    "cors",
    "fakeMarketPrice",
    "fixedGasPrice",
    "port",
    "mongoUrl",
    "openApi",
    "openApi2",
    "mempoolApi",
    "network",
    "keyring",
    "startHeight",
    "moduleId",
    "isContractOnChain",
    "pendingTransferNum",
    "pendingDepositDirectNum",
    "pendingDepositMatchingNum",
    "pendingRollupNum",
    "pendingWithdrawNum",
    "insertHeightNum",
    "openCommitPerMinute",
    "commitPerMinute",
    "commitPerSize",
    "eventListPerSize",
    "snapshotPerSize",
    "db",
    "enableApiUTXO",
    "verifyCommit",
    "source",
    "commitFeeRateRatio",
    "userFeeRateRatio",
    "openWhitelistTick",
    "whitelistTick",
    "verifyCommitInvalidException",
    "verifyCommitCriticalException",
    "verifyCommitFatalNum",
    "isLocalTest",
    "binOpts",
    "userWhiteList",
    "onlyUserWhiteList",
    "updateHeight1",
    "initTicks",
    "readonly",
    "minFeeRate",
    "openSwagger",
  ].forEach((key) => {
    need(config[key] !== undefined, "missing config field: " + key);
  });

  need(config.pendingDepositDirectNum >= 0);
  need(config.pendingDepositMatchingNum >= 0);
  need(config.eventListPerSize > 0);
  need(config.snapshotPerSize > 0);
  need(config.insertHeightNum > 3);
  need(config.insertHeightNum > config.pendingDepositDirectNum);
  need(config.insertHeightNum > config.pendingDepositMatchingNum);
  need(config.insertHeightNum > config.pendingRollupNum);
  need(config.insertHeightNum > config.pendingWithdrawNum);
  // if (config.openWhitelistTick) {
  //   need(!!config.whitelistTick["sats"].depositLimit);
  //   need(!!config.whitelistTick["sats"].withdrawLimit);
  // }
  if (launch) {
    need(
      [
        "FRACTAL_BITCOIN_MAINNET",
        "BITCOIN_MAINNET",
        "BITCOIN_TESTNET",
        "FRACTAL_BITCOIN_TESTNET",
      ].includes(process.env.BITCOIN_NETWORK)
    );
    need(!!BITCOIN_NAME);
  }

  global.inited = false;
  global.config = config;
  global.fatal = false; // TODO
  global.network = networks[config.network];

  console.log("db: ", config.db);
  global.mongoUtils = new MongoUtils(config.mongoUrl, config.db);
  global.decimal = new Decimal();
  global.query = new Query();
  global.env = new Env();
  global.api = new API();
  global.logger = new DateLogger();
  global.contractLoader = new ContractLoader();
  global.deposit = new Deposit();
  global.conditionalWithdraw = new ConditionalWithdraw();
  global.directWithdraw = new DirectWithdraw();
  global.matching = new Matching();
  global.keyring = new Keyring();
  global.metric = new Metric(new Registry());
  global.statistic = new Statistic();

  global.operator = new Operator();
  global.sender = new Sender();
  global.builder = new Builder();

  global.opCommitDao = new OpCommitDao("commit");
  global.opEventDao = new OpEventDao("event");
  global.tickDao = new TickDao("tick");
  global.recordLiqDao = new RecordLiqDao("record_liq");
  global.recordSwapDao = new RecordSwapDao("record_swap");
  global.recordGasDao = new RecordGasDao("record_gas");
  global.recordApproveDao = new RecordApproveDao("record_approve");
  global.recordSendDao = new RecordSendDao("record_send");
  global.sequencerUtxoDao = new SequencerUtxoDao("sequencer_utxo");
  global.sequencerTxDao = new SequencerTxDao("sequencer_tx");
  global.withdrawDao = new WithdrawDao("withdraw");
  global.matchingDao = new MatchingDao("matching");
  global.depositDao = new DepositDao("deposit");
  global.feeRateDao = new FeeRateDao("feerate");
  global.statusDao = new StatusDao("status");
  global.snapshotAssetDao = new SnapshotAssetDao("snapshot_asset");
  global.snapshotKLastDao = new SnapshotKLastDao("snapshot_klast");
  global.assetDao = new AssetDao("asset");
  global.snapshotSupplyDao = new SnapshotSupplyDao("snapshot_supply");
  global.assetSupplyDao = new AssetSupplyDao("asset_supply");
  global.poolListDao = new PoolListDao("pool_list");

  await mongoUtils.init();
  console.log("mongoUtils inited");

  await env.init();
  console.log("env inited");

  await decimal.init();
  console.log("decimal inited");

  await contractLoader.init();
  console.log("contractLoader inited");

  await deposit.init();
  console.log("deposit inited");

  await conditionalWithdraw.init();
  await directWithdraw.init();
  console.log("withdraw inited");

  // await matching.init();
  // console.log("matching inited");

  if (!(await global.statusDao.findStatus())?.initedDB) {
    await createIndexes();
    await createInitDbData();
  }

  if (launch) {
    // need to init the builder first, and the operator builds a new space based on the builder's history space.
    await builder.init();
    console.log("opBuilder inited");

    await sender.init();
    console.log("opSender inited");

    await operator.init();
    console.log("operator inited");

    await query.init();
    console.log("query inited");

    global.inited = true;

    const TAG = "tick";

    new AsyncTimer().setInterval(async () => {
      try {
        // The builder needs to remain constant during the update process
        await api.tick();
        await env.tick();

        if (fatal) {
          return;
        }

        logger.debug({ tag: TAG, msg: "directWithdraw" });
        await directWithdraw.tick();
        logger.debug({ tag: TAG, msg: "deposit" });
        await deposit.tick();
        // await matching.tick();
        logger.debug({ tag: TAG, msg: "opBuilder" });
        await builder.tick();
        logger.debug({ tag: TAG, msg: "operator" });
        await operator.tick();
      } catch (err) {
        loggerError(TAG, err);
      }
    }, 3_000);

    new AsyncTimer().setInterval(async () => {
      try {
        if (config.readonly) {
          return;
        }
        if (fatal) {
          return;
        }

        // only refresh utxo, it's safe
        await sender.tick();
      } catch (err) {
        loggerError(TAG, err);
      }
    }, 3_000);

    new AsyncTimer().setInterval(async () => {
      try {
        if (config.readonly) {
          return;
        }
        if (fatal) {
          return;
        }

        await query.tick();
      } catch (err) {
        loggerError(TAG, err);
      }
    }, 60_000);
  }
}

async function createInitDbData() {
  await statusDao.upsertStatus({
    initedDB: true,
    snapshotLastCommitId: "",
    snapshotLastOpEvent: null,
    confirmedLastOpEvent: null,
    mempoolLastOpEvent: null,
  });
}

async function createIndexes() {
  await opCommitDao.createIndex({ inscriptionId: 1 });
  await opCommitDao.createIndex({ "op.parent": 1 });
  await opCommitDao.createIndex({ inEventList: 1 });

  await snapshotKLastDao.createIndex({ tick: 1 });

  await snapshotAssetDao.createIndex({ tick: 1 });
  await snapshotAssetDao.createIndex({ address: 1 });
  await snapshotAssetDao.createIndex({ assetType: 1 });

  await assetDao.createIndex({ cursor: 1 });
  await assetDao.createIndex({ commitParent: 1 });
  await assetDao.createIndex({ tick: 1 });
  await assetDao.createIndex({ address: 1 });
  await assetDao.createIndex({ assetType: 1 });

  await opEventDao.createIndex({ "op.op": 1 });
  await opEventDao.createIndex({ cursor: 1 });

  await tickDao.createIndex({ tick: 1 });

  await recordLiqDao.createIndex({ id: 1 });
  await recordLiqDao.createIndex({ address: 1 });
  await recordLiqDao.createIndex({ tick0: 1 });
  await recordLiqDao.createIndex({ tick1: 1 });
  await recordLiqDao.createIndex({ type: 1 });
  await recordLiqDao.createIndex({ ts: 1 });

  await recordSwapDao.createIndex({ id: 1 });
  await recordSwapDao.createIndex({ address: 1 });
  await recordSwapDao.createIndex({ exactType: 1 });
  await recordSwapDao.createIndex({ tickIn: 1 });
  await recordSwapDao.createIndex({ tickOut: 1 });
  await recordSwapDao.createIndex({ ts: 1 });

  await recordGasDao.createIndex({ id: 1 });
  await recordGasDao.createIndex({ address: 1 });

  await recordApproveDao.createIndex({ id: 1 });
  await recordApproveDao.createIndex({ address: 1 });
  await recordApproveDao.createIndex({ tick: 1 });
  await recordApproveDao.createIndex({ type: 1 });

  await sequencerUtxoDao.createIndex({ status: 1 });
  await sequencerUtxoDao.createIndex({ used: 1 });
  await sequencerUtxoDao.createIndex({ purpose: 1 });

  await sequencerTxDao.createIndex({ status: 1 });
  await sequencerTxDao.createIndex({ txid: 1 });

  await withdrawDao.createIndex({ id: 1 });
  await withdrawDao.createIndex({ address: 1 });
  await withdrawDao.createIndex({ tick: 1 });

  // await matchingDao.createIndex({ approveInscriptionId: 1 });
  // await matchingDao.createIndex({ transferInscriptionId: 1 });
  // await matchingDao.createIndex({ address: 1 });
  // await matchingDao.createIndex({ tick: 1 });

  await depositDao.createIndex({ address: 1 });
  await depositDao.createIndex({ tick: 1 });
  await depositDao.createIndex({ inscriptionId: 1 });

  await assetSupplyDao.createIndex({ cursor: 1 });
  await assetSupplyDao.createIndex({ commitParent: 1 });
  await assetSupplyDao.createIndex({ tick: 1 });

  await snapshotSupplyDao.createIndex({ tick: 1 });

  await poolListDao.createIndex({ tick0: 1 });
  await poolListDao.createIndex({ tick1: 1 });
  await poolListDao.createIndex({ tvl: 1 });
}
