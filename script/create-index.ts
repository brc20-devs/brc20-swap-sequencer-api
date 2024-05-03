import { Collection, MongoClient } from "mongodb";
import { config } from "../src/config";

async function addIndexToCollection() {
  const client = new MongoClient(config.mongoUrl);

  try {
    await client.connect();

    const database = client.db("brc20-swap");

    let collection: Collection<Document>;

    collection = database.collection("op_commit");
    await collection.createIndex({ inscriptionId: 1 });
    await collection.createIndex({ "op.parent": 1 });
    await collection.createIndex({ invalid: 1 });

    collection = database.collection("op_confirm");
    await collection.createIndex({ snapshot: 1 });
    await collection.createIndex({ "opEvent.op.op": 1 });
    await collection.createIndex({ "opEvent.event": 1 });
    await collection.createIndex({ "opEvent.inscriptionId": 1 });
    await collection.createIndex({ "opEvent.txid": 1 });
    await collection.createIndex({ invalid: 1 });

    collection = database.collection("op_list");
    await collection.createIndex({ "opEvent.op.op": 1 });
    await collection.createIndex({ "opEvent.event": 1 });
    await collection.createIndex({ "opEvent.inscriptionId": 1 });
    await collection.createIndex({ "opEvent.txid": 1 });
    await collection.createIndex({ invalid: 1 });

    collection = database.collection("tick");
    await collection.createIndex({ tick: 1 });

    collection = database.collection("record_liq");
    await collection.createIndex({ id: 1 });
    await collection.createIndex({ address: 1 });
    await collection.createIndex({ tick0: 1 });
    await collection.createIndex({ tick1: 1 });
    await collection.createIndex({ type: 1 });
    await collection.createIndex({ ts: 1 });
    await collection.createIndex({ invalid: 1 });

    collection = database.collection("record_swap");
    await collection.createIndex({ id: 1 });
    await collection.createIndex({ address: 1 });
    await collection.createIndex({ exactType: 1 });
    await collection.createIndex({ tickIn: 1 });
    await collection.createIndex({ tickOut: 1 });
    await collection.createIndex({ ts: 1 });
    await collection.createIndex({ invalid: 1 });

    collection = database.collection("record_gas");
    await collection.createIndex({ id: 1 });
    await collection.createIndex({ address: 1 });
    await collection.createIndex({ invalid: 1 });

    collection = database.collection("record_approve");
    await collection.createIndex({ id: 1 });
    await collection.createIndex({ address: 1 });
    await collection.createIndex({ tick: 1 });
    await collection.createIndex({ type: 1 });
    await collection.createIndex({ invalid: 1 });

    collection = database.collection("sequencer_utxo");
    await collection.createIndex({ status: 1 });
    await collection.createIndex({ used: 1 });
    await collection.createIndex({ purpose: 1 });

    collection = database.collection("sequencer_tx");
    await collection.createIndex({ status: 1 });
    await collection.createIndex({ txid: 1 });

    collection = database.collection("withdraw");
    await collection.createIndex({ id: 1 });
    await collection.createIndex({ address: 1 });
    await collection.createIndex({ tick: 1 });
    await collection.createIndex({ invalid: 1 });

    collection = database.collection("matching");
    await collection.createIndex({ approveInscriptionId: 1 });
    await collection.createIndex({ transferInscriptionId: 1 });
    await collection.createIndex({ address: 1 });
    await collection.createIndex({ tick: 1 });
    await collection.createIndex({ invalid: 1 });

    collection = database.collection("deposit");
    await collection.createIndex({ address: 1 });
    await collection.createIndex({ tick: 1 });
    await collection.createIndex({ invalid: 1 });

    console.log("create index success");
  } catch (error) {
    console.error(error);
  } finally {
    await client.close();
  }
}

void addIndexToCollection();
