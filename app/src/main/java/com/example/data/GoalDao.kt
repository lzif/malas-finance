package com.example.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface GoalDao {

    @Query("SELECT * FROM goals WHERE deletedAt IS NULL ORDER BY createdAt DESC")
    fun getActiveGoals(): Flow<List<Goal>>

    @Query("SELECT * FROM goals WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC")
    fun getDeletedGoals(): Flow<List<Goal>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertGoal(goal: Goal)

    @Update
    suspend fun updateGoal(goal: Goal)

    @Query("UPDATE goals SET deletedAt = :deletedAt WHERE id = :id")
    suspend fun softDeleteGoalById(id: Int, deletedAt: Long)

    @Query("UPDATE goals SET deletedAt = NULL WHERE id = :id")
    suspend fun restoreGoalById(id: Int)

    @Query("DELETE FROM goals WHERE id = :id")
    suspend fun deleteGoalById(id: Int)

    /**
     * Atomic one-shot read of a single goal. Used by increment/decrement
     * where reading from the reactive StateFlow is racy: the StateFlow's
     * cached value lags the database, so two clicks fired in quick
     * succession can both read the same stale value and silently drop
     * the second update. A direct `suspend fun` query reads the latest
     * committed row, which the surrounding mutex then serialises.
     */
    @Query("SELECT * FROM goals WHERE id = :id LIMIT 1")
    suspend fun getGoalById(id: Int): Goal?
}
