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

/**
 * v4 → v5 introduces the savings goals feature. Goals are intentionally
 * decoupled from wallets/transactions per the feature spec, so this is a
 * pure additive migration: a new table with no effect on existing rows.
 */
private val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                name TEXT NOT NULL,
                targetAmount INTEGER NOT NULL,
                currentAmount INTEGER NOT NULL,
                completedAt INTEGER,
                deletedAt INTEGER,
                createdAt INTEGER NOT NULL
            )
            """.trimIndent()
        )
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
        .addMigrations(MIGRATION_3_4, MIGRATION_4_5)
        .build()
        repository = TransactionRepository(database.transactionDao(), database.goalDao())
    }
}
