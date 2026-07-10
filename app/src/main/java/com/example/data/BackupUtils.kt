package com.example.data

import org.json.JSONArray
import org.json.JSONObject

/**
 * Generates a JSON backup from the supplied transactions.
 *
 * Backups are intended for data recovery, so they include *all*
 * transactions passed in, including soft-deleted (trash) entries.
 * The caller decides whether to pass active records only or a full set.
 */
fun generateBackupJson(transactions: List<Transaction>): String {
    val array = JSONArray()
    transactions.forEach { tx ->
        array.put(JSONObject().apply {
            put("id", tx.id)
            put("amount", tx.amount)
            put("type", tx.type)
            put("category", tx.category)
            put("subcategory", tx.subcategory)
            put("notes", tx.notes)
            put("timestamp", tx.timestamp)
            put("walletSource", tx.walletSource)
            put("walletDestination", tx.walletDestination)
            put("fee", tx.fee)
            put("deletedAt", tx.deletedAt)
        })
    }
    return JSONObject().put("version", 1).put("transactions", array).toString(2)
}

fun parseBackupJson(json: String): List<Transaction> {
    val array = JSONObject(json).optJSONArray("transactions") ?: return emptyList()
    return (0 until array.length()).mapNotNull { index ->
        val item = array.optJSONObject(index) ?: return@mapNotNull null
        val amount = item.optLong("amount", 0L)
        val timestamp = item.optLong("timestamp", 0L)
        if (amount <= 0L || timestamp <= 0L) return@mapNotNull null
        Transaction(
            id = 0,
            amount = amount,
            type = item.optString("type", "OUT"),
            category = item.optString("category", "CORE"),
            subcategory = item.optString("subcategory", ""),
            notes = item.optString("notes").takeIf { !item.isNull("notes") && it.isNotBlank() },
            timestamp = timestamp,
            walletSource = item.optString("walletSource", "CASH"),
            walletDestination = item.optString("walletDestination").takeIf { !item.isNull("walletDestination") && it.isNotBlank() },
            fee = item.optLong("fee").takeIf { !item.isNull("fee") },
            deletedAt = item.optLong("deletedAt").takeIf { !item.isNull("deletedAt") }
        )
    }
}
