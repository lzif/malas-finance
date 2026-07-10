package com.example.data

import com.example.util.filterByRange

// String literals for category/type are now centralized in com.example.data.Constants.kt
// to prevent drift between UI, ViewModel and export layers.
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.*

fun formatCurrency(amount: Long): String {
    val formatter = NumberFormat.getNumberInstance(Locale("id", "ID"))
    return formatter.format(amount)
}

fun escapeMarkdown(value: String): String = value.replace("|", "\\|").replace("\n", " ")

fun generateMarkdown(transactions: List<Transaction>, range: String): String {
    val activeOnly = transactions.filter { it.deletedAt == null }
    val filtered = filterByRange(activeOnly, range)
    val totalIn = filtered.filter { it.type == TxType.IN }.sumOf { it.amount }
    val totalOut = filtered.filter { it.type == TxType.OUT }.sumOf { it.amount }
    val balance = totalIn - totalOut

    val outCore = filtered.filter { it.type == TxType.OUT && it.category == Category.CORE }.sumOf { it.amount }
    val outOper = filtered.filter { it.type == TxType.OUT && (it.category == Category.OPER || it.category == Category.OPS) }.sumOf { it.amount }
    val outHobby = filtered.filter { it.type == TxType.OUT && it.category == Category.HOBBY }.sumOf { it.amount }
    val outVault = filtered.filter { it.type == TxType.OUT && it.category == Category.VAULT }.sumOf { it.amount }

    val builder = StringBuilder()
    builder.appendLine("# SUMMARY ($range)")
    builder.appendLine("- Current Balance: $balance")
    builder.appendLine("- Total IN: $totalIn")
    builder.appendLine("- Total OUT: $totalOut")
    builder.appendLine()
    builder.appendLine("## OUT BY CATEGORY")
    builder.appendLine("- CORE: $outCore")
    builder.appendLine("- OPERASIONAL: $outOper")
    builder.appendLine("- HOBBY: $outHobby")
    builder.appendLine("- VAULT: $outVault")
    builder.appendLine()

    builder.appendLine("## OUT BY SUBCATEGORY")
    filtered.filter { it.type == TxType.OUT && it.subcategory.isNotBlank() }
        .groupBy { it.subcategory }
        .mapValues { entry -> entry.value.sumOf { it.amount } }
        .toList()
        .sortedByDescending { it.second }
        .forEach { (subcat, amount) -> builder.appendLine("- ${escapeMarkdown(subcat)}: $amount") }
    builder.appendLine()

    builder.appendLine("## LEDGER LOG")
    builder.appendLine("| Date Time | Type | Category | Subcategory / Notes | Amount |")
    builder.appendLine("|---|---|---|---|---|")

    val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT)
    filtered.forEach { tx ->
        val dStr = dateFormat.format(Date(tx.timestamp))
        val dispCat = if (tx.category == Category.OPS) "OPERASIONAL" else tx.category
        val combinedNotes = if (!tx.notes.isNullOrBlank()) "${tx.subcategory} (${tx.notes})" else tx.subcategory
        val subcat = escapeMarkdown(combinedNotes.ifBlank { "-" })
        builder.appendLine("| $dStr | ${tx.type} | $dispCat | $subcat | ${tx.amount} |")
    }

    return builder.toString()
}
