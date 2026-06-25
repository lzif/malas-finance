package com.example.data

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [Transaction::class, Wallet::class], version = 4, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun transactionDao(): TransactionDao
}
