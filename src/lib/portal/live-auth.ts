import { getSql } from "@/lib/db";
import { customerBySession } from "./sessions";

export async function customerIdForShopToken(token: string) {
  const value = token.trim().slice(0, 80);
  if (!value) return 0;
  const sql = await getSql();
  const row = await customerBySession(sql, value);
  const id = Number(row?.id ?? 0);
  return Number.isFinite(id) ? id : 0;
}
