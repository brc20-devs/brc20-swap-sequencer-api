import * as bitcoin from "bitcoinjs-lib";
import { Registry } from "prom-client";
import { config } from "./config";
import { ContractLoader } from "./contract/contract-loader";
import { DepositDao } from "./dao/deposit-dao";
import { MatchingDao } from "./dao/matching-dao";
import { OpCommitDao } from "./dao/op-commit-dao";
import { OpConfirmDao } from "./dao/op-confirm-dao";
import { OpListDao } from "./dao/op-list-dao";
import { RecordApproveDao } from "./dao/record-approve-dao";
import { RecordGasDao } from "./dao/record-gas-dao";
import { RecordLiqDao } from "./dao/record-liq-dao";
import { RecordSendDao } from "./dao/record-send-dao";
import { RecordSwapDao } from "./dao/record-swap-dao";
import { SequencerTxDao } from "./dao/sequencer-tx-dao";
import { SequencerUtxoDao } from "./dao/sequencer-utxo-dao";
import { TickDao } from "./dao/tick-dao";
import { WithdrawDao } from "./dao/withdraw-dao";
import { API } from "./domain/api";
import { Decimal } from "./domain/decimal";
import { Deposit } from "./domain/deposit";
import { Env } from "./domain/env";
import { Keyring } from "./domain/keyring";
import { Matching } from "./domain/matching";
import { Metric } from "./domain/metric";
import { OpBuilder } from "./domain/op-builder";
import { OpSender } from "./domain/op-sender";
import { Operator } from "./domain/operator";
import { Query } from "./domain/query";
import { Statistic } from "./domain/statistic";
import { handleInvalidDaoData, need } from "./domain/utils";
import { Withdraw } from "./domain/withdraw";
import { AsyncTimer } from "./utils/async-timer";
import { DateLogger } from "./utils/logger";
import { MongoUtils } from "./utils/mongo-utils";
import { printErr } from "./utils/utils";

export async function init(launch = true) {
  const networks = {
    testnet: bitcoin.networks.testnet,
    bitcoin: bitcoin.networks.bitcoin,
    regtest: bitcoin.networks.regtest,
  };

  [
    "cors",
    "routeDebugLog",
    "winstonDebugLog",
    "fakeMarketPrice",
    "fixedGasPrice",
    "port",
    "mongoUrl",
    "openApi",
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
    "canSwap",
    "userWhiteList",
    "onlyUserWhiteList",
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
  if (config.openWhitelistTick) {
    need(!!config.whitelistTick["sats"].depositLimit);
    need(!!config.whitelistTick["sats"].withdrawLimit);
  }

  global.inited = false;
  global.config = config;
  global.fatal = false; // TODO
  global.network = networks[config.network];
  if (config.isLocalTest) {
    config.commitPerSize = 10000;
  }

  console.log("db: ", config.db);
  global.mongoUtils = new MongoUtils(config.mongoUrl, config.db);
  global.decimal = new Decimal();
  global.query = new Query();
  global.env = new Env();
  global.api = new API();
  global.logger = new DateLogger();
  global.contractLoader = new ContractLoader();
  global.deposit = new Deposit();
  global.withdraw = new Withdraw();
  global.matching = new Matching();
  global.keyring = new Keyring();
  global.metric = new Metric(new Registry());
  global.statistic = new Statistic();

  global.operator = new Operator();
  global.opSender = new OpSender();
  global.opBuilder = new OpBuilder();

  global.opCommitDao = new OpCommitDao("op_commit");
  global.opConfirmDao = new OpConfirmDao("op_confirm");
  global.opListDao = new OpListDao("op_list");
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

  await withdraw.init();
  console.log("withdraw inited");

  await matching.init();
  console.log("matching inited");

  if (launch) {
    // set op_commit { invalid: true, invalidHandled: false }
    await handleInvalidDaoData();

    // need to init the builder first, and the operator builds a new space based on the builder's history space.
    await opBuilder.init();
    console.log("opBuilder inited");

    await opSender.init();
    console.log("opSender inited");

    await operator.init();
    console.log("operator inited");

    global.inited = true;

    const timer = new AsyncTimer();
    timer.setInterval(async () => {
      try {
        if (fatal) {
          timer.cancel();
          return;
        }
        await api.tick();
        await env.tick();

        await withdraw.tick();
        await deposit.tick();
        await matching.tick();

        await opBuilder.tick();
        await operator.tick();
      } catch (err) {
        printErr("timer-tick", err);
      }
    }, 3_000);

    timer.setInterval(async () => {
      try {
        // only refresh utxo, it's safe
        await opSender.tick();
      } catch (err) {
        printErr("timer-tick", err);
      }
    }, 3_000);
  }
}
