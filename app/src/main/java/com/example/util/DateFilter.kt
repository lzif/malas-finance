package com.example.util

import com.example.data.Transaction
import java.util.Calendar

fun filterByRange(transactions: List<Transaction>, range: String): List<Transaction> {
    if (range == "All Time") return transactions
    val now = Calendar.getInstance()
    val start = Calendar.getInstance().apply {
        when (range) {
            "This Week" -> {
                firstDayOfWeek = now.firstDayOfWeek
                set(Calendar.DAY_OF_WEEK, firstDayOfWeek)
            }
            "Current Month" -> set(Calendar.DAY_OF_MONTH, 1)
            else -> return transactions
        }
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }
    val end = Calendar.getInstance().apply {
        timeInMillis = start.timeInMillis
        when (range) {
            "This Week" -> add(Calendar.WEEK_OF_YEAR, 1)
            "Current Month" -> add(Calendar.MONTH, 1)
        }
    }
    return transactions.filter { it.timestamp >= start.timeInMillis && it.timestamp < end.timeInMillis }
}
