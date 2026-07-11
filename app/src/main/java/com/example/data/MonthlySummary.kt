package com.example.data

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Aggregated per-month snapshot of a transaction list.
 *
 * - [yearMonthKey] is a `"yyyy-MM"` key suitable for lexicographic
 *   chronological sorting.
 * - [label] is a `"MMM yyyy"` display label rendered in Locale.ROOT so the
 *   text does not drift across device locales.
 * - [totalIn] / [totalOut] ignore TRANSFER rows so net movement between
 *   wallets does not skew totals.
 */
data class MonthlySummary(
    val yearMonthKey: String,
    val label: String,
    val totalIn: Long,
    val totalOut: Long,
    val netBalance: Long,
    val entryCount: Int
)

/**
 * Groups transactions by calendar month using the device's local timezone
 * and returns summaries ordered most-recent-first.
 *
 * Callers should pass only the transactions they want to summarize.
 * Because [MainViewModel.transactions] already excludes soft-deleted rows,
 * feeding that flow into this function is safe; passing the trash list
 * separately would intentionally include deleted entries.
 */
fun summarizeByMonth(transactions: List<Transaction>): List<MonthlySummary> {
    if (transactions.isEmpty()) return emptyList()

    val keyFormat = SimpleDateFormat("yyyy-MM", Locale.ROOT)
    val labelFormat = SimpleDateFormat("MMM yyyy", Locale.ROOT)

    return transactions
        .groupBy { keyFormat.format(Date(it.timestamp)) }
        .map { (key, txs) ->
            val totalIn = txs.filter { it.type == TxType.IN }.sumOf { it.amount }
            val totalOut = txs.filter { it.type == TxType.OUT }.sumOf { it.amount }
            MonthlySummary(
                yearMonthKey = key,
                label = labelFormat.format(Date(txs.first().timestamp)),
                totalIn = totalIn,
                totalOut = totalOut,
                netBalance = totalIn - totalOut,
                entryCount = txs.size
            )
        }
        .sortedByDescending { it.yearMonthKey }
}
