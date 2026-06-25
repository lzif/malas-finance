package com.example

import android.app.Application
import androidx.room.Room
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.example.data.AppDatabase
import com.example.data.TransactionRepository

private val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE transactions ADD COLUMN deletedAt INTEGER")
    }
}

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
        .addMigrations(MIGRATION_3_4)
        .build()
        repository = TransactionRepository(database.transactionDao())
    }
}
