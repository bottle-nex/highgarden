import { prisma, type HedgerEventLevel } from "@solmarket/database";

export interface RecordEventParams {
  level: HedgerEventLevel;
  category: string;
  message: string;
  payload?: unknown;
}

export default class EventRepo {
  public async record(params: RecordEventParams): Promise<void> {
    await prisma.hedgerEvent.create({
      data: {
        level: params.level,
        category: params.category,
        message: params.message,
        payload: params.payload === undefined ? undefined : (params.payload as object),
      },
    });
  }

  public async record_alert(category: string, message: string, payload?: unknown): Promise<void> {
    await this.record({ level: "ALERT", category, message, payload });
  }
}
