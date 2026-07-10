package com.example.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BackupUtilsTest {

    private fun makeTx(
        id: Int = 1,
        amount: Long = 10000L,
        type: String = TxType.OUT,
        category: String = Category.CORE,
        subcategory: String = "FOOD",
        notes: String? = "lunch",
        timestamp: Long = 1700000000000L,
        walletSource: String = "CASH",
        walletDestination: String? = null,
        fee: Long? = null,
        deletedAt: Long? = null
    ): Transaction = Transaction(
        id = id,
        amount = amount,
        type = type,
        category = category,
        subcategory = subcategory,
        notes = notes,
        timestamp = timestamp,
        walletSource = walletSource,
        walletDestination = walletDestination,
        fee = fee,
        deletedAt = deletedAt
    )

    @Test
    fun `generateBackupJson includes all transactions including trash`() {
        val active = makeTx(id = 1, subcategory = "ACTIVE")
        val deleted = makeTx(id = 2, subcategory = "TRASH", deletedAt = 12345L)
        val json = generateBackupJson(listOf(active, deleted))

        assertTrue(json.contains("\"subcategory\": \"ACTIVE\""))
        assertTrue(json.contains("\"subcategory\": \"TRASH\""))
        assertTrue(json.contains("\"deletedAt\": 12345"))
    }

    @Test
    fun `generateBackupJson wraps in version 1 envelope`() {
        val json = generateBackupJson(listOf(makeTx()))
        assertTrue(json.contains("\"version\": 1"))
        assertTrue(json.contains("\"transactions\""))
    }

    @Test
    fun `generateBackupJson with empty list produces valid envelope`() {
        val json = generateBackupJson(emptyList())
        assertTrue(json.contains("\"version\": 1"))
        assertTrue(json.contains("\"transactions\": []"))
    }

    @Test
    fun `parseBackupJson zeroes imported ids to avoid collision`() {
        val original = makeTx(id = 42, amount = 5000L)
        val json = generateBackupJson(listOf(original))
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.size)
        assertEquals(0, parsed[0].id)
        assertEquals(5000L, parsed[0].amount)
    }

    @Test
    fun `parseBackupJson round-trips transaction fields`() {
        val tx = makeTx(
            id = 1,
            amount = 25000L,
            type = TxType.IN,
            category = Category.GAJI,
            subcategory = "SALARY",
            notes = "monthly",
            timestamp = 1700000000000L,
            walletSource = "BANK",
            walletDestination = null,
            fee = null,
            deletedAt = null
        )
        val json = generateBackupJson(listOf(tx))
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.size)
        val p = parsed[0]
        assertEquals(25000L, p.amount)
        assertEquals(TxType.IN, p.type)
        assertEquals(Category.GAJI, p.category)
        assertEquals("SALARY", p.subcategory)
        assertEquals("monthly", p.notes)
        assertEquals(1700000000000L, p.timestamp)
        assertEquals("BANK", p.walletSource)
        assertNull(p.walletDestination)
        assertNull(p.fee)
        assertNull(p.deletedAt)
    }

    @Test
    fun `parseBackupJson preserves transfer fields`() {
        val tx = makeTx(
            id = 1,
            amount = 50000L,
            type = TxType.TRANSFER,
            category = Category.TRANSFER,
            subcategory = "",
            walletSource = "CASH",
            walletDestination = "BANK",
            fee = 1000L
        )
        val json = generateBackupJson(listOf(tx))
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.size)
        val p = parsed[0]
        assertEquals(TxType.TRANSFER, p.type)
        assertEquals("BANK", p.walletDestination)
        assertEquals(1000L, p.fee)
    }

    @Test
    fun `parseBackupJson filters out entries with non-positive amount`() {
        val valid = makeTx(id = 1, amount = 1000L)
        val zero = makeTx(id = 2, amount = 0L)
        val negative = makeTx(id = 3, amount = -500L)
        val json = generateBackupJson(listOf(valid, zero, negative))
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.size)
        assertEquals(1000L, parsed[0].amount)
    }

    @Test
    fun `parseBackupJson filters out entries with zero timestamp`() {
        val valid = makeTx(id = 1, timestamp = 1700000000000L)
        val zeroTs = makeTx(id = 2, timestamp = 0L)
        val json = generateBackupJson(listOf(valid, zeroTs))
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.size)
        assertEquals(1700000000000L, parsed[0].timestamp)
    }

    @Test(expected = org.json.JSONException::class)
    fun `parseBackupJson throws on invalid json`() {
        parseBackupJson("not json at all")
    }

    @Test
    fun `parseBackupJson returns empty list for missing transactions array`() {
        val parsed = parseBackupJson("""{"version": 1}""")
        assertTrue(parsed.isEmpty())
    }

    @Test
    fun `parseBackupJson handles empty transactions array`() {
        val parsed = parseBackupJson("""{"version": 1, "transactions": []}""")
        assertTrue(parsed.isEmpty())
    }

    @Test
    fun `parseBackupJson handles deleted entries in trash`() {
        val tx = makeTx(id = 1, amount = 3000L, deletedAt = 99999L)
        val json = generateBackupJson(listOf(tx))
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.size)
        assertNotNull(parsed[0].deletedAt)
        assertEquals(99999L, parsed[0].deletedAt)
    }

    @Test
    fun `round-trip preserves deletedAt as null for active entries`() {
        val tx = makeTx(id = 1, deletedAt = null)
        val json = generateBackupJson(listOf(tx))
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.size)
        assertNull(parsed[0].deletedAt)
    }
}
