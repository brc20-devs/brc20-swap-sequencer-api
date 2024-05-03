import {
  AggregateOptions,
  BulkWriteOptions,
  CountDocumentsOptions,
  Filter,
  FindOptions,
  InsertOneOptions,
  MongoClient,
  UpdateFilter,
  UpdateOptions,
} from "mongodb";

export class MongoUtils {
  readonly url: string;
  readonly dbName: string;

  private client: MongoClient;

  constructor(url: string, dbName: string) {
    this.url = url;
    this.dbName = dbName;
  }

  async init() {
    this.client = await MongoClient.connect(this.url, {
      useUnifiedTopology: true,
      minPoolSize: 20,
      maxPoolSize: 200,
    } as any);
  }

  count(
    tableName: string,
    findFilter: object,
    opts: CountDocumentsOptions = {}
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      this.client
        .db(this.dbName)
        .collection(tableName)
        .countDocuments(findFilter, opts)
        .then((res: number) => {
          resolve(res);
        })
        .catch((err: Error) => {
          reject(err);
        });
    });
  }

  insert(
    tableName: string,
    data: object,
    opts: InsertOneOptions = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      this.client
        .db(this.dbName)
        .collection(tableName)
        .insertOne(data, opts)
        .then((res: any) => {
          resolve(res.insertedId.toString());
        })
        .catch((err: Error) => {
          reject(err);
        });
    });
  }

  insertMany(
    tableName: string,
    data: object[],
    opts: BulkWriteOptions = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      this.client
        .db(this.dbName)
        .collection(tableName)
        .insertMany(data, opts)
        .then((res: any) => {
          resolve(res);
        })
        .catch((err: Error) => {
          reject(err);
        });
    });
  }

  findOne(
    tableName: string,
    findFilter: Filter<any>,
    opts: FindOptions = {}
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client
        .db(this.dbName)
        .collection(tableName)
        .findOne(findFilter, opts)
        .then((res: any) => {
          resolve(res);
        })
        .catch((err: Error) => {
          reject(err);
        });
    });
  }

  find(
    tableName: string,
    findFilter: Filter<any>,
    opts: FindOptions = {}
  ): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.client
        .db(this.dbName)
        .collection(tableName)
        .find(findFilter, opts)
        .toArray()
        .then((res: any) => {
          resolve(res);
        })
        .catch((err: Error) => {
          reject(err);
        });
    });
  }

  aggregate(
    tableName: string,
    pipeline: object[],
    opts: AggregateOptions
  ): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.client
        .db(this.dbName)
        .collection(tableName)
        .aggregate(pipeline, opts)
        .toArray()
        .then((res: any) => {
          resolve(res);
        })
        .catch((err: Error) => {
          reject(err);
        });
    });
  }

  updateOne(
    tableName: string,
    findFilter: Filter<any>,
    updateFilter: UpdateFilter<any>,
    opts: UpdateOptions = {}
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        this.client
          .db(this.dbName)
          .collection(tableName)
          .updateOne(findFilter, updateFilter, opts)
          .then((res: any) => {
            resolve(res.matchedCount);
          })
          .catch((err: Error) => {
            reject(err);
          });
      } catch (e) {
        reject(e);
      }
    });
  }

  updateMany(
    tableName: string,
    findFilter: object,
    updateFilter: object,
    opts: UpdateOptions = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.client
          .db(this.dbName)
          .collection(tableName)
          .updateMany(findFilter, updateFilter, opts)
          .then((res: any) => {
            resolve(res);
          })
          .catch((err: Error) => {
            reject(err);
          });
      } catch (e) {
        reject(e);
      }
    });
  }

  upsertOne(
    tabName: string,
    findFilter: object,
    updateFilter: object,
    opts: UpdateOptions = {}
  ): Promise<number> {
    opts.upsert = true;
    return this.updateOne(tabName, findFilter, updateFilter, opts);
  }
}
