/* eslint-env node */
import { MongoClient } from "mongodb";

let _client = null;
let _db = null;

export async function connectDb(opts = {}) {
  const uri =
    opts.uri ||
    (typeof process !== "undefined" && process.env
      ? process.env.MONGO_URI
      : undefined);
  const dbName =
    opts.dbName ||
    (typeof process !== "undefined" && process.env
      ? process.env.MONGO_DB
      : "aula_chatgpt") ||
    "aula_chatgpt";
  if (_db) return _db;
  if (!_client) _client = new MongoClient(uri);
  await _client.connect();
  _db = _client.db(dbName);
  console.log("db connected", uri, "db=", dbName);
  return _db;
}

export function getDb() {
  if (!_db) throw new Error("Database not connected. Call connectDb() first.");
  return _db;
}

export function getCollection(name) {
  return getDb().collection(name);
}

export async function closeDb() {
  if (_client) {
    await _client.close();
    _client = null;
    _db = null;
  }
}
