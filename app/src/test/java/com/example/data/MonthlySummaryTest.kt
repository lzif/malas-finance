package com.example.data

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

class MonthlySummaryTest {

    private lateinit var originalTz: TimeZone

    @Before
    fun setUp() {
        // Lock the default TZ so that mid-month timestamps do not drift
        // into adjacent months on CI hosts.
        originalTz = TimeZone.getDefault()
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"))
    }

    @After
    fun tearDown() {
        TimeZone.setDefault(originalTz)
    }

    private fun makeTx(
        timestamp: Long,
        amount: Long = 1000L,
        type: String = TxType.OUT
    ): Transaction = Transaction(
        id = 0,
        amount = amount,
        type = type,
        category = "CORE",
        subcategory = "test",
        notes = null,
        timestamp = timestamp
    )

    @Test
    fun `empty list returns empty summary`() {
        assertEquals(emptyList<MonthlySummary>(), summarizeByMonth(emptyList()))
    }

    @Test
    fun `single transaction produces one summary`() {
        val tx = makeTx(millisFor(2026, Calendar.JULY, 15))
        val result = summarizeByMonth(listOf(tx))
        assertEquals(1, result.size)
        assertEquals("2026-07", result[0].yearMonthKey)
        assertEquals(1000L, result[0].totalOut)
        assertEquals(0L, result[0].totalIn)
        assertEquals(-1000L, result[0].netBalance)
        assertEquals(1, result[0].entryCount)
    }

    @Test
    fun `same month entries are summed`() {
        val txs = listOf(
            makeTx(millisFor(2026, Calendar.JULY, 2), amount = 100L, type = TxType.IN),
            makeTx(millisFor(2026, Calendar.JULY, 10), amount = 200L, type = TxType.OUT),
            makeTx(millisFor(2026, Calendar.JULY, 20), amount = 300L, type = TxType.OUT)
        )
        val result = summarizeByMonth(txs)
        assertEquals(1, result.size)
        assertEquals(100L, result[0].totalIn)
        assertEquals(500L, result[0].totalOut)
        assertEquals(-400L, result[0].netBalance)
        assertEquals(3, result[0].entryCount)
    }

    @Test
    fun `different months are separated and ordered most recent first`() {
        val txs = listOf(
            makeTx(millisFor(2026, Calendar.MAY, 15)),
            makeTx(millisFor(2026, Calendar.JULY, 15)),
            makeTx(millisFor(2026, Calendar.JUNE, 15))
        )
        val result = summarizeByMonth(txs)
        assertEquals(listOf("2026-07", "2026-06", "2026-05"), result.map { it.yearMonthKey })
    }

    @Test
    fun `year boundary separates months`() {
        val txs = listOf(
            makeTx(millisFor(2025, Calendar.DECEMBER, 31)),
            makeTx(millisFor(2026, Calendar.JANUARY, 1))
        )
        val result = summarizeByMonth(txs)
        assertEquals(listOf("2026-01", "2025-12"), result.map { it.yearMonthKey })
    }

    @Test
    fun `display label uses Locale ROOT format`() {
        val txs = listOf(makeTx(millisFor(2026, Calendar.JULY, 15)))
        val result = summarizeByMonth(txs)
        // Locale.ROOT gives English abbreviations on the JVM. Be tolerant
        // about whitespace/punctuation across JDK versions.
        assertTrue("Label should contain year", result[0].label.contains("2026"))
        assertTrue(
            "Label should abbreviate month",
            result[0].label.lowercase(Locale.ROOT).contains("jul")
        )
    }

    @Test
    fun `transfers are excluded from in and out totals`() {
        val txs = listOf(
            makeTx(millisFor(2026, Calendar.JULY, 5), amount = 5000L, type = TxType.TRANSFER),
            makeTx(millisFor(2026, Calendar.JULY, 10), amount = 1000L, type = TxType.IN),
            makeTx(millisFor(2026, Calendar.JULY, 20), amount = 400L, type = TxType.OUT)
        )
        // TRANSFER contributes to entryCount (it is still a logged entry) but
        // stays out of totalIn/totalOut so wallet-to-wallet moves do not
        // distort the monthly net.
        val result = summarizeByMonth(txs)
        assertEquals(1, result.size)
        assertEquals(1000L, result[0].totalIn)
        assertEquals(400L, result[0].totalOut)
        assertEquals(600L, result[0].netBalance)
        assertEquals(3, result[0].entryCount)
    }

    private fun millisFor(year: Int, month: Int, day: Int): Long {
        // Noon on a mid-month day — safely inside the target month for any
        // reasonable device timezone and free of DST transition risk.
        return Calendar.getInstance().apply {
            set(year, month, day, 12, 0, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis
    }
}
