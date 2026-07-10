package com.example.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface TransactionDao {
    @Query("SELECT * FROM transactions WHERE deletedAt IS NULL ORDER BY timestamp DESC")
    fun getAllTransactions(): Flow<List<Transaction>>

    @Query("SELECT * FROM transactions WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC")
    fun getDeletedTransactions(): Flow<List<Transaction>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTransaction(transaction: Transaction)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTransactions(transactions: List<Transaction>)

    @androidx.room.Update
    suspend fun updateTransaction(transaction: Transaction)

    @Query("UPDATE transactions SET deletedAt = :deletedAt WHERE id = :id")
    suspend fun softDeleteTransactionById(id: Int, deletedAt: Long)

    @Query("UPDATE transactions SET deletedAt = NULL WHERE id = :id")
    suspend fun restoreTransactionById(id: Int)

    @Query("DELETE FROM transactions WHERE id = :id")
    suspend fun deleteTransactionById(id: Int)

    @Query("SELECT * FROM wallets ORDER BY name ASC")
    fun getAllWallets(): Flow<List<Wallet>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWallet(wallet: Wallet)

    @androidx.room.Delete
    suspend fun deleteWallet(wallet: Wallet)

    /**
     * Counts every transaction that references this wallet, including
     * soft-deleted (trash) rows. Wallets must not be removed while any
     * record still points to them, otherwise those records become orphaned.
     */
    @Query("SELECT COUNT(*) FROM transactions WHERE walletSource = :walletName OR walletDestination = :walletName")
    suspend fun countTransactionsReferencingWallet(walletName: String): Int
}
