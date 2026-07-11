package com.example.data

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * A savings goal the user is tracking manually. Intentionally **decoupled**
 * from wallets and transactions: [currentAmount] is a counter the user
 * maintains (increment / decrement) rather than anything derived from the
 * transactions table.
 *
 * - Soft delete via [deletedAt] matches the existing transaction pattern.
 * - [completedAt] is stamped by the ViewModel layer when
 *   [currentAmount] reaches [targetAmount]. It is cleared automatically if
 *   the user decrements back below the target.
 */
@Entity(tableName = "goals")
data class Goal(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val name: String,
    val targetAmount: Long,
    val currentAmount: Long,
    val completedAt: Long? = null,
    val deletedAt: Long? = null,
    val createdAt: Long = System.currentTimeMillis()
)

/**
 * Read-only progress snapshot used by the UI. Computed live from
 * [currentAmount] / [targetAmount] so the entity stays the source of
 * truth and the math can be unit-tested without Room.
 */
data class GoalProgress(
    val percent: Int,
    val remaining: Long,
    val isCompleted: Boolean
)

/**
 * Pure progress calculation. Behavior contract:
 *
 * - [target] <= 0 yields zero progress without throwing (defensive: a
 *   goal with no target is meaningless but we must not divide by zero).
 * - Negative [current] is clamped to zero in the display so a corrupt
 *   row never flips the percent negative.
 * - Percent is capped at 999 so overdelivery ("saved 5x the target!")
 *   shows an obvious strong-positive number without overflowing the bar.
 */
fun computeGoalProgress(current: Long, target: Long): GoalProgress {
    if (target <= 0L) return GoalProgress(percent = 0, remaining = 0L, isCompleted = false)
    val safeCurrent = current.coerceAtLeast(0L)
    val percent = (safeCurrent.toDouble() / target.toDouble() * 100.0)
        .toInt()
        .coerceIn(0, 999)
    val remaining = if (safeCurrent >= target) 0L else target - safeCurrent
    val completed = safeCurrent >= target
    return GoalProgress(percent = percent, remaining = remaining, isCompleted = completed)
}
