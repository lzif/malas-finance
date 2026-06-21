package com.example

import android.app.Application
import androidx.room.Room
import com.example.data.AppDatabase
import com.example.data.TransactionRepository

class MalasApplication : Application() {
    lateinit var database: AppDatabase
    lateinit var repository: TransactionRepository

    override fun onCreate() {
        super.onCreate()
        database = Room.databaseBuilder(
            this,
            AppDatabase::class.java,
            "malas_database"
        )
        .fallbackToDestructiveMigration()
        .build()
        repository = TransactionRepository(database.transactionDao())
    }
}
