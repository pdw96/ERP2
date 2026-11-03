import { connect } from "./client";
import type { Db } from "./types";

// 화면 · 서버 액션이 요청 하나 동안 DB 에 닿는다 — 접속을 열고, 일이 끝나면 닫는다.

export class DatabaseUnsetError extends Error {
  constructor() {
    super("DATABASE_URL 이 없다");
    this.name = "DatabaseUnsetError";
  }
}

export async function withDb<T>(work: (db: Db) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new DatabaseUnsetError();
  const { db, close } = connect(url);
  try {
    return await work(db);
  } finally {
    await close();
  }
}
