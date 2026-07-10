package com.example.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ExportUtilsTest {

    private fun makeTx(
        id: Int = 0,
        amount: Long = 5000L,
        type: String = TxType.OUT,
        category: String = Category.CORE,
        subcategory: String = "FOOD",
        notes: String? = null,
        timestamp: Long = System.currentTimeMillis(),
        deletedAt: Long? = null
    ): Transaction = Transaction(
        id = id,
        amount = amount,
        type = type,
        category = category,
        subcategory = subcategory,
        notes = notes,
        timestamp = timestamp,
        deletedAt = deletedAt
    )

    @Test
    fun `escapeMarkdown replaces pipe and newline`() {
        assertEquals("a\\|b", escapeMarkdown("a|b"))
        assertEquals("a b", escapeMarkdown("a\nb"))
        assertEquals("a\\| b", escapeMarkdown("a|\nb"))
    }

    @Test
    fun `escapeMarkdown leaves clean text unchanged`() {
        assertEquals("hello", escapeMarkdown("hello"))
    }

    @Test
    fun `formatCurrency formats with grouping separators`() {
        val result = formatCurrency(1500000L)
        // Indonesian locale uses dot as thousands separator; just verify
        // it contains the digits and at least one separator.
        assertTrue("Should contain 1500000 digits", result.replace(".", "").replace(",", "") == "1500000")
        assertTrue("Should have grouping separators", result.contains(".") || result.contains(","))
    }

    @Test
    fun `generateMarkdown excludes trash entries`() {
        val activeTx = makeTx(id = 1, amount = 10000L, subcategory = "LUNCH")
        val deletedTx = makeTx(id = 2, amount = 20000L, subcategory = "DELETED", deletedAt = 12345L)
        val md = generateMarkdown(listOf(activeTx, deletedTx), "All Time")

        assertTrue("Active subcategory should appear", md.contains("LUNCH"))
        assertFalse("Deleted subcategory should not appear", md.contains("DELETED"))
    }

    @Test
    fun `generateMarkdown includes summary section`() {
        val txs = listOf(
            makeTx(amount = 10000L, type = TxType.IN, category = Category.GAJI),
            makeTx(amount = 3000L, type = TxType.OUT, category = Category.CORE)
        )
        val md = generateMarkdown(txs, "All Time")

        assertTrue(md.contains("# SUMMARY (All Time)"))
        assertTrue(md.contains("Total IN: 10000"))
        assertTrue(md.contains("Total OUT: 3000"))
        assertTrue(md.contains("Current Balance: 7000"))
    }

    @Test
    fun `generateMarkdown includes category breakdown`() {
        val txs = listOf(
            makeTx(amount = 1000L, type = TxType.OUT, category = Category.CORE),
            makeTx(amount = 2000L, type = TxType.OUT, category = Category.OPS),
            makeTx(amount = 3000L, type = TxType.OUT, category = Category.HOBBY),
            makeTx(amount = 4000L, type = TxType.OUT, category = Category.VAULT)
        )
        val md = generateMarkdown(txs, "All Time")

        assertTrue(md.contains("CORE: 1000"))
        assertTrue(md.contains("OPERASIONAL: 2000"))
        assertTrue(md.contains("HOBBY: 3000"))
        assertTrue(md.contains("VAULT: 4000"))
    }

    @Test
    fun `generateMarkdown includes ledger table header`() {
        val md = generateMarkdown(emptyList(), "All Time")
        assertTrue(md.contains("| Date Time | Type | Category | Subcategory / Notes | Amount |"))
        assertTrue(md.contains("|---|---|---|---|---|"))
    }

    @Test
    fun `generateMarkdown with empty list still produces structure`() {
        val md = generateMarkdown(emptyList(), "Current Month")
        assertTrue(md.contains("# SUMMARY (Current Month)"))
        assertTrue(md.contains("Total IN: 0"))
        assertTrue(md.contains("Total OUT: 0"))
    }

    @Test
    fun `generateMarkdown handles OPS category display as OPERASIONAL`() {
        val txs = listOf(makeTx(amount = 5000L, type = TxType.OUT, category = Category.OPS, subcategory = "OPS_TEST"))
        val md = generateMarkdown(txs, "All Time")
        assertTrue(md.contains("OPERASIONAL"))
        assertFalse(md.contains("| OPS |"))
    }

    @Test
    fun `generateMarkdown escapes pipe in notes`() {
        val txs = listOf(makeTx(amount = 1000L, subcategory = "TEST", notes = "has|pipe"))
        val md = generateMarkdown(txs, "All Time")
        assertTrue(md.contains("has\\|pipe"))
    }
}
