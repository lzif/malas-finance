package com.example.util

import com.example.data.Transaction
import com.example.data.TxType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar

class DateFilterTest {

    private fun makeTx(timestamp: Long): Transaction = Transaction(
        id = 0,
        amount = 1000L,
        type = TxType.OUT,
        category = "CORE",
        subcategory = "test",
        notes = null,
        timestamp = timestamp
    )

    private val now: Long = System.currentTimeMillis()

    @Test
    fun `all time returns all transactions`() {
        val txs = listOf(makeTx(now), makeTx(now - 86_400_000L), makeTx(now - 86_400_000L * 30))
        assertEquals(txs, filterByRange(txs, "All Time"))
    }

    @Test
    fun `unknown range returns all transactions`() {
        val txs = listOf(makeTx(now), makeTx(now - 86_400_000L))
        assertEquals(txs, filterByRange(txs, "Nonsense"))
    }

    @Test
    fun `empty list returns empty`() {
        assertEquals(emptyList<Transaction>(), filterByRange(emptyList(), "Current Month"))
    }

    @Test
    fun `current month includes today and excludes last month`() {
        val cal = Calendar.getInstance()
        val today = makeTx(now)

        // First day of this month at 00:00
        val firstOfMonth = Calendar.getInstance().apply {
            set(Calendar.DAY_OF_MONTH, 1)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis

        // Last day of previous month
        val lastMonth = Calendar.getInstance().apply {
            add(Calendar.MONTH, -1)
            set(Calendar.DAY_OF_MONTH, getActualMaximum(Calendar.DAY_OF_MONTH))
            set(Calendar.HOUR_OF_DAY, 23)
            set(Calendar.MINUTE, 59)
            set(Calendar.SECOND, 59)
        }.timeInMillis

        val txs = listOf(today, makeTx(firstOfMonth), makeTx(lastMonth))
        val filtered = filterByRange(txs, "Current Month")

        assertTrue("Today should be included", filtered.contains(today))
        assertTrue("First of month should be included", filtered.contains(makeTx(firstOfMonth)))
        assertTrue("Last month should be excluded", !filtered.any { it.timestamp == lastMonth })
    }

    @Test
    fun `this week includes today and excludes two weeks ago`() {
        val today = makeTx(now)

        val twoWeeksAgo = Calendar.getInstance().apply {
            add(Calendar.WEEK_OF_YEAR, -2)
        }.timeInMillis

        val txs = listOf(today, makeTx(twoWeeksAgo))
        val filtered = filterByRange(txs, "This Week")

        assertTrue("Today should be included", filtered.contains(today))
        assertTrue("Two weeks ago should be excluded", !filtered.any { it.timestamp == twoWeeksAgo })
    }
}
