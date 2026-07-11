package com.example.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GoalMathTest {

    @Test
    fun `zero target yields zero percent and not completed`() {
        val r = computeGoalProgress(current = 50_000L, target = 0L)
        assertEquals(0, r.percent)
        assertEquals(0L, r.remaining)
        assertFalse(r.isCompleted)
    }

    @Test
    fun `negative target is treated as zero`() {
        val r = computeGoalProgress(current = 50_000L, target = -100L)
        assertEquals(0, r.percent)
        assertFalse(r.isCompleted)
        assertEquals(0L, r.remaining)
    }

    @Test
    fun `equal current and target yields 100 percent and completed`() {
        val r = computeGoalProgress(current = 500_000L, target = 500_000L)
        assertEquals(100, r.percent)
        assertEquals(0L, r.remaining)
        assertTrue(r.isCompleted)
    }

    @Test
    fun `overdelivery caps visible percent at 999 and stays completed`() {
        val r = computeGoalProgress(current = 1_000_000L, target = 100_000L)
        assertEquals(999, r.percent)
        assertEquals(0L, r.remaining)
        assertTrue(r.isCompleted)
    }

    @Test
    fun `zero current yields zero percent and full remaining`() {
        val r = computeGoalProgress(current = 0L, target = 500_000L)
        assertEquals(0, r.percent)
        assertEquals(500_000L, r.remaining)
        assertFalse(r.isCompleted)
    }

    @Test
    fun `partial progress reports correct remaining and percent`() {
        val r = computeGoalProgress(current = 200_000L, target = 500_000L)
        assertEquals(40, r.percent)
        assertEquals(300_000L, r.remaining)
        assertFalse(r.isCompleted)
    }

    @Test
    fun `negative current clamps to zero in display only`() {
        val r = computeGoalProgress(current = -50_000L, target = 500_000L)
        assertEquals(0, r.percent)
        assertEquals(500_000L, r.remaining)
        assertFalse(r.isCompleted)
    }

    @Test
    fun `tiny progress rounds down via integer truncation`() {
        val r = computeGoalProgress(current = 99L, target = 10_000L)
        assertEquals(0, r.percent)
        assertEquals(9_901L, r.remaining)
        assertFalse(r.isCompleted)
    }
}
