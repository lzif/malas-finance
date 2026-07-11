package com.example.data

import org.json.JSONArray
import org.json.JSONObject

/**
 * Result of parsing a backup JSON. Holds both the transaction and goal
 * lists in the order they appeared in the file. Either list may be empty
 * if the source backup predates the matching feature (v1 backups yield
 * an empty goals list — full backward compatibility).
 */
data class BackupData(
    val transactions: List<Transaction>,
    val goals: List<Goal>
)

/**
 * Generates a JSON v2 backup including both transactions and goals.
 *
 * Backups are intended for data recovery, so they include *all* records
 * passed in, including soft-deleted (trash) entries. The caller decides
 * whether to pass active records only or a full set.
 *
 * Schema:
 * ```
 * {
 *   "version": 2,
 *   "transactions": [ {...}, ... ],
 *   "goals":        [ {...}, ... ]
 * }
 * ```
 */
fun generateBackupJson(transactions: List<Transaction>, goals: List<Goal>): String {
    val txArray = JSONArray()
    transactions.forEach { tx ->
        txArray.put(JSONObject().apply {
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
    val goalArray = JSONArray()
    goals.forEach { g ->
        goalArray.put(JSONObject().apply {
            put("id", g.id)
            put("name", g.name)
            put("targetAmount", g.targetAmount)
            put("currentAmount", g.currentAmount)
            put("completedAt", g.completedAt)
            put("deletedAt", g.deletedAt)
            put("createdAt", g.createdAt)
        })
    }
    return JSONObject()
        .put("version", 2)
        .put("transactions", txArray)
        .put("goals", goalArray)
        .toString(2)
}

/**
 * Parses a backup JSON (v1 or v2) into a [BackupData]. Missing arrays
 * (e.g. v1 backups without a `goals` key) yield empty lists, not errors.
 *
 * - Throws [org.json.JSONException] if the input is not a JSON object.
 * - Filters out invalid records from each list rather than failing the
 *   whole import: e.g. transactions with non-positive amount or zero
 *   timestamp, and goals with empty name, non-positive target, or
 *   negative current.
 * - Always returns records with `id = 0` so Room auto-generates a fresh
 *   id on insert — matching the existing transaction import contract
 *   and preventing the REPLACE collision the prior PLAN item called out.
 */
fun parseBackupJson(json: String): BackupData {
    val root = JSONObject(json)
    return BackupData(
        transactions = parseTransactionArray(root),
        goals = parseGoalArray(root)
    )
}

private fun parseTransactionArray(root: JSONObject): List<Transaction> {
    val array = root.optJSONArray("transactions") ?: return emptyList()
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

private fun parseGoalArray(root: JSONObject): List<Goal> {
    val array = root.optJSONArray("goals") ?: return emptyList()
    return (0 until array.length()).mapNotNull { index ->
        val item = array.optJSONObject(index) ?: return@mapNotNull null
        val name = item.optString("name", "").trim()
        val targetAmount = item.optLong("targetAmount", 0L)
        val currentAmount = item.optLong("currentAmount", 0L)
        if (name.isEmpty() || targetAmount <= 0L || currentAmount < 0L) return@mapNotNull null
        val rawCreatedAt = item.optLong("createdAt", 0L)
        Goal(
            id = 0,
            name = name,
            targetAmount = targetAmount,
            currentAmount = currentAmount,
            completedAt = item.optLong("completedAt").takeIf { !item.isNull("completedAt") && it > 0L },
            deletedAt = item.optLong("deletedAt").takeIf { !item.isNull("deletedAt") && it > 0L },
            createdAt = if (rawCreatedAt > 0L) rawCreatedAt else System.currentTimeMillis()
        )
    }
}
