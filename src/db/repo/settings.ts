import { getSql } from '../connection.ts'
import type { CycleMode } from '../../domain/types.ts'

type Row = Record<string, unknown>

export interface Settings {
  cycleMode: CycleMode
  cycleAnchorDay: number
  cycleManualEnd: string | null
  endBuffer: number
  dayStartHour: number
  seedDailySpend: number
  startedAt: string | null
  nightlySummaryHour: number
  weeklyAuditDay: number
  weeklyAuditHour: number
  telegramChatId: number | null
  schemaVersion: number
}

function rowToSettings(row: Record<string, unknown>): Settings {
  return {
    cycleMode: row.cycle_mode as CycleMode,
    cycleAnchorDay: row.cycle_anchor_day as number,
    cycleManualEnd: (row.cycle_manual_end as string) ?? null,
    endBuffer: row.end_buffer as number,
    dayStartHour: row.day_start_hour as number,
    seedDailySpend: row.seed_daily_spend as number,
    startedAt: (row.started_at as string) ?? null,
    nightlySummaryHour: row.nightly_summary_hour as number,
    weeklyAuditDay: row.weekly_audit_day as number,
    weeklyAuditHour: row.weekly_audit_hour as number,
    telegramChatId: row.telegram_chat_id != null ? Number(row.telegram_chat_id) : null,
    schemaVersion: row.schema_version as number,
  }
}

export async function getSettings(): Promise<Settings> {
  const sql = getSql()
  const rows = await sql`SELECT * FROM settings WHERE key = 'settings'` as Row[]
  if (rows.length === 0) throw new Error('Settings row missing — run db:migrate first')
  return rowToSettings(rows[0])
}

export async function updateSettings(
  updates: Partial<Omit<Settings, 'schemaVersion'>>,
): Promise<Settings> {
  const current = await getSettings()
  const m = { ...current, ...updates }
  const sql = getSql()
  const rows = await sql`
    UPDATE settings SET
      cycle_mode         = ${m.cycleMode},
      cycle_anchor_day   = ${m.cycleAnchorDay},
      cycle_manual_end   = ${m.cycleManualEnd},
      end_buffer         = ${m.endBuffer},
      day_start_hour     = ${m.dayStartHour},
      seed_daily_spend   = ${m.seedDailySpend},
      started_at         = ${m.startedAt},
      nightly_summary_hour = ${m.nightlySummaryHour},
      weekly_audit_day   = ${m.weeklyAuditDay},
      weekly_audit_hour  = ${m.weeklyAuditHour},
      telegram_chat_id   = ${m.telegramChatId}
    WHERE key = 'settings'
    RETURNING *
  ` as Row[]
  return rowToSettings(rows[0])
}
