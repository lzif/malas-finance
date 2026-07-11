package com.example.data

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [Transaction::class, Wallet::class, Goal::class], version = 5, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun transactionDao(): TransactionDao
    abstract fun goalDao(): GoalDao
}
