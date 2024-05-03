import { Wallet, bitcoin } from "../src/lib/bitcoin";
import { AddressType } from "../src/types/domain";
import { deployTools } from "./deploy-tools";

global.network = bitcoin.networks.testnet;

// It's a good idea to use a different wallet for each role

// moduleWallet is the wallet that will deploy the module
const moduleWallet = Wallet.fromWIF("xx", AddressType.P2WPKH);

// inscribeWallet is the wallet that will inscribe the module
const inscribeWallet = Wallet.fromWIF("xx", AddressType.P2WPKH);

// btcWallet is the wallet that will pay the fees
const btcWallet = Wallet.fromWIF("xx", AddressType.P2WPKH);

// sequencerWallet is the wallet that will sequence the module commits
const sequencerWallet = Wallet.fromWIF("xx", AddressType.P2WPKH);

// feeToWallet is the wallet that will receive the swap-fees
const feeToWallet = Wallet.fromWIF("xx", AddressType.P2WPKH);

// gasToWallet is the wallet that will receive the commit-gas
const gasToWallet = Wallet.fromWIF("xx", AddressType.P2WPKH);

// approveWallet is the wallet that will approve the withdraw
// no longer used
const approveWallet = Wallet.fromWIF("xx", AddressType.P2WPKH);

// rootWallet is the wallet that to generate multisig address
// no longer used
const rootWallet = Wallet.fromWIF("xx", AddressType.P2WPKH);

const op_module = {
  p: "brc20-module",
  op: "deploy",
  name: "swap",
  source: "39ce8a4b93451cc9172fe1a4f34e37cbe106b9b06250c4681dec9d4d834707cei0",
  init: {
    swap_fee_rate: "0.003",
    gas_tick: "sats",
    gas_to: gasToWallet.address,
    fee_to: feeToWallet.address,
    sequencer: sequencerWallet.address,
  },
};

console.log(`
moduleWallet: ${moduleWallet.address}
inscribeWallet: ${inscribeWallet.address}
btcWallet: ${btcWallet.address}
sequencerWallet: ${sequencerWallet.address}
feeToWallet: ${feeToWallet.address}
gasToWallet: ${gasToWallet.address}
approveWallet: ${approveWallet.address}
rootWallet: ${rootWallet.address}
`);

// customize the fee rate
const feeRate = 1;
async function deployModule() {
  await deployTools.deployModule({
    op: op_module,
    moduleWallet,
    btcWallet,
    inscribeWallet,
    feeRate,
  });
}

async function deployContract() {
  await deployTools.deployContract({
    moduleWallet,
    inscribeWallet,
    btcWallet,
    feeRate,
  });
}

async function splitUTXO() {
  await deployTools.splitUTXO({
    btcWallet,
    feeRate,
  });
}

const run = async () => {
  // await deployModule();
  // await deployContract();
  // await splitUTXO();
};

run();
