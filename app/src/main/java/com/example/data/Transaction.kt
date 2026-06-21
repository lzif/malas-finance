package com.example.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "transactions")
data class Transaction(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val amount: Long,
    val type: String, // "IN" or "OUT"
    val category: String,
    val notes: String,
    val timestamp: Long = System.currentTimeMillis()
)
