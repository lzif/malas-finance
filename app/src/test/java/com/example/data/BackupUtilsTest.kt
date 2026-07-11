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

    private fun makeGoal(
        id: Int = 1,
        name: String = "VACATION",
        targetAmount: Long = 5_000_000L,
        currentAmount: Long = 1_000_000L,
        completedAt: Long? = null,
        deletedAt: Long? = null,
        createdAt: Long = 1700000000000L
    ): Goal = Goal(
        id = id,
        name = name,
        targetAmount = targetAmount,
        currentAmount = currentAmount,
        completedAt = completedAt,
        deletedAt = deletedAt,
        createdAt = createdAt
    )

    // ---- Transaction round-trip (v2 schema) ----

    @Test
    fun `generateBackupJson includes all transactions including trash`() {
        val active = makeTx(id = 1, subcategory = "ACTIVE")
        val deleted = makeTx(id = 2, subcategory = "TRASH", deletedAt = 12345L)
        val json = generateBackupJson(listOf(active, deleted), emptyList())

        assertTrue(json.contains("\"subcategory\": \"ACTIVE\""))
        assertTrue(json.contains("\"subcategory\": \"TRASH\""))
        assertTrue(json.contains("\"deletedAt\": 12345"))
    }

    @Test
    fun `generateBackupJson wraps in version 2 envelope`() {
        val json = generateBackupJson(listOf(makeTx()), emptyList())
        assertTrue(json.contains("\"version\": 2"))
        assertTrue(json.contains("\"transactions\""))
        assertTrue(json.contains("\"goals\""))
    }

    @Test
    fun `generateBackupJson with empty list produces valid envelope`() {
        val json = generateBackupJson(emptyList(), emptyList())
        assertTrue(json.contains("\"version\": 2"))
        assertTrue(json.contains("\"transactions\": []"))
        assertTrue(json.contains("\"goals\": []"))
    }

    @Test
    fun `parseBackupJson zeroes imported ids to avoid collision`() {
        val original = makeTx(id = 42, amount = 5000L)
        val json = generateBackupJson(listOf(original), emptyList())
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.transactions.size)
        assertEquals(0, parsed.transactions[0].id)
        assertEquals(5000L, parsed.transactions[0].amount)
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
        val json = generateBackupJson(listOf(tx), emptyList())
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.transactions.size)
        val p = parsed.transactions[0]
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
        val json = generateBackupJson(listOf(tx), emptyList())
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.transactions.size)
        val p = parsed.transactions[0]
        assertEquals(TxType.TRANSFER, p.type)
        assertEquals("BANK", p.walletDestination)
        assertEquals(1000L, p.fee)
    }

    @Test
    fun `parseBackupJson filters out entries with non-positive amount`() {
        val valid = makeTx(id = 1, amount = 1000L)
        val zero = makeTx(id = 2, amount = 0L)
        val negative = makeTx(id = 3, amount = -500L)
        val json = generateBackupJson(listOf(valid, zero, negative), emptyList())
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.transactions.size)
        assertEquals(1000L, parsed.transactions[0].amount)
    }

    @Test
    fun `parseBackupJson filters out entries with zero timestamp`() {
        val valid = makeTx(id = 1, timestamp = 1700000000000L)
        val zeroTs = makeTx(id = 2, timestamp = 0L)
        val json = generateBackupJson(listOf(valid, zeroTs), emptyList())
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.transactions.size)
        assertEquals(1700000000000L, parsed.transactions[0].timestamp)
    }

    @Test(expected = org.json.JSONException::class)
    fun `parseBackupJson throws on invalid json`() {
        parseBackupJson("not json at all")
    }

    @Test
    fun `parseBackupJson returns empty transactions for missing transactions array`() {
        val parsed = parseBackupJson("""{"version": 2}""")
        assertTrue(parsed.transactions.isEmpty())
    }

    @Test
    fun `parseBackupJson handles empty transactions array`() {
        val parsed = parseBackupJson("""{"version": 2, "transactions": []}""")
        assertTrue(parsed.transactions.isEmpty())
    }

    @Test
    fun `parseBackupJson handles deleted entries in trash`() {
        val tx = makeTx(id = 1, amount = 3000L, deletedAt = 99999L)
        val json = generateBackupJson(listOf(tx), emptyList())
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.transactions.size)
        assertNotNull(parsed.transactions[0].deletedAt)
        assertEquals(99999L, parsed.transactions[0].deletedAt)
    }

    @Test
    fun `round-trip preserves deletedAt as null for active entries`() {
        val tx = makeTx(id = 1, deletedAt = null)
        val json = generateBackupJson(listOf(tx), emptyList())
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.transactions.size)
        assertNull(parsed.transactions[0].deletedAt)
    }

    // ---- Goals round-trip (v2 schema) ----

    @Test
    fun `generateBackupJson includes goals in v2 envelope`() {
        val goal = makeGoal(name = "VACATION", targetAmount = 5_000_000L)
        val json = generateBackupJson(emptyList(), listOf(goal))

        assertTrue(json.contains("\"name\": \"VACATION\""))
        assertTrue(json.contains("\"targetAmount\": 5000000"))
        assertTrue(json.contains("\"version\": 2"))
    }

    @Test
    fun `parseBackupJson includes goals from v2 backup`() {
        val goal = makeGoal(name = "EMERGENCY FUND", targetAmount = 10_000_000L, currentAmount = 2_500_000L)
        val json = generateBackupJson(emptyList(), listOf(goal))
        val parsed = parseBackupJson(json)

        assertEquals(0, parsed.transactions.size)
        assertEquals(1, parsed.goals.size)
        val g = parsed.goals[0]
        assertEquals("EMERGENCY FUND", g.name)
        assertEquals(10_000_000L, g.targetAmount)
        assertEquals(2_500_000L, g.currentAmount)
    }

    @Test
    fun `parseBackupJson zeroes imported goal ids to avoid collision`() {
        val goal = makeGoal(id = 99, name = "CAR")
        val json = generateBackupJson(emptyList(), listOf(goal))
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.goals.size)
        assertEquals(0, parsed.goals[0].id)
    }

    @Test
    fun `parseBackupJson round-trips goal fields including completedAt`() {
        val goal = makeGoal(
            id = 1,
            name = "LAPTOP",
            targetAmount = 15_000_000L,
            currentAmount = 15_000_000L,
            completedAt = 1700123456789L,
            createdAt = 1700000000000L
        )
        val json = generateBackupJson(emptyList(), listOf(goal))
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.goals.size)
        val g = parsed.goals[0]
        assertEquals(0, g.id)
        assertEquals("LAPTOP", g.name)
        assertEquals(15_000_000L, g.targetAmount)
        assertEquals(15_000_000L, g.currentAmount)
        assertEquals(1700123456789L, g.completedAt)
        assertEquals(1700000000000L, g.createdAt)
    }

    @Test
    fun `parseBackupJson preserves goal deletedAt for trash round-trip`() {
        val goal = makeGoal(name = "ARCHIVED", deletedAt = 1700999999999L)
        val json = generateBackupJson(emptyList(), listOf(goal))
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.goals.size)
        assertNotNull(parsed.goals[0].deletedAt)
        assertEquals(1700999999999L, parsed.goals[0].deletedAt)
    }

    @Test
    fun `parseBackupJson filters out goals with empty name`() {
        val valid = makeGoal(name = "OK")
        val blank = makeGoal(name = "")
        val json = generateBackupJson(emptyList(), listOf(valid, blank))
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.goals.size)
        assertEquals("OK", parsed.goals[0].name)
    }

    @Test
    fun `parseBackupJson filters out goals with non-positive target`() {
        val valid = makeGoal(name = "OK", targetAmount = 1_000_000L)
        val zeroTarget = makeGoal(name = "ZERO", targetAmount = 0L)
        val negativeTarget = makeGoal(name = "NEG", targetAmount = -100L)
        val json = generateBackupJson(emptyList(), listOf(valid, zeroTarget, negativeTarget))
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.goals.size)
        assertEquals("OK", parsed.goals[0].name)
    }

    @Test
    fun `parseBackupJson filters out goals with negative currentAmount`() {
        val valid = makeGoal(name = "OK", currentAmount = 1_000L)
        val negative = makeGoal(name = "NEG", currentAmount = -100L)
        val json = generateBackupJson(emptyList(), listOf(valid, negative))
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.goals.size)
        assertEquals("OK", parsed.goals[0].name)
    }

    @Test
    fun `parseBackupJson handles combined transactions and goals in v2 backup`() {
        val tx = makeTx(amount = 5_000L)
        val goal = makeGoal(name = "COMBO", targetAmount = 1_000_000L)
        val json = generateBackupJson(listOf(tx), listOf(goal))
        val parsed = parseBackupJson(json)

        assertEquals(1, parsed.transactions.size)
        assertEquals(1, parsed.goals.size)
        assertEquals(5_000L, parsed.transactions[0].amount)
        assertEquals("COMBO", parsed.goals[0].name)
    }

    // ---- Backward compatibility (v1 backup without goals) ----

    @Test
    fun `parseBackupJson v1 backup returns empty goals list`() {
        val parsed = parseBackupJson(
            """{"version": 1, "transactions": [{"amount": 1000, "type": "OUT", "category": "CORE", "subcategory": "FOOD", "timestamp": 1700000000000, "walletSource": "CASH"}]}"""
        )
        assertEquals(0, parsed.goals.size)
        assertEquals(1, parsed.transactions.size)
        assertEquals(1000L, parsed.transactions[0].amount)
    }
}
