package com.example.data

import kotlinx.coroutines.flow.Flow

class TransactionRepository(private val transactionDao: TransactionDao) {
    val allTransactions: Flow<List<Transaction>> = transactionDao.getAllTransactions()
    val deletedTransactions: Flow<List<Transaction>> = transactionDao.getDeletedTransactions()
    val allWallets: Flow<List<Wallet>> = transactionDao.getAllWallets()

    suspend fun insert(transaction: Transaction) = transactionDao.insertTransaction(transaction)

    suspend fun insertAll(transactions: List<Transaction>) = transactionDao.insertTransactions(transactions)

    suspend fun update(transaction: Transaction) = transactionDao.updateTransaction(transaction)

    suspend fun softDeleteById(id: Int) = transactionDao.softDeleteTransactionById(id, System.currentTimeMillis())

    suspend fun restoreById(id: Int) = transactionDao.restoreTransactionById(id)

    suspend fun deleteById(id: Int) = transactionDao.deleteTransactionById(id)

    suspend fun insertWallet(wallet: Wallet) = transactionDao.insertWallet(wallet)

    suspend fun deleteWallet(wallet: Wallet) = transactionDao.deleteWallet(wallet)
}
