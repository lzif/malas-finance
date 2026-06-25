package com.example.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "transactions")
data class Transaction(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val amount: Long,
    val type: String, // "IN", "OUT", or "TRANSFER"
    val category: String,
    val subcategory: String,
    val notes: String?,
    val timestamp: Long = System.currentTimeMillis(),
    val walletSource: String = "CASH",
    val walletDestination: String? = null,
    val fee: Long? = null,
    val deletedAt: Long? = null
)
