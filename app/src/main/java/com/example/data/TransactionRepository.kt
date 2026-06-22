package com.example.data

import kotlinx.coroutines.flow.Flow

class TransactionRepository(private val transactionDao: TransactionDao) {
    val allTransactions: Flow<List<Transaction>> = transactionDao.getAllTransactions()
    val allWallets: Flow<List<Wallet>> = transactionDao.getAllWallets()

    suspend fun insert(transaction: Transaction) = transactionDao.insertTransaction(transaction)

    suspend fun update(transaction: Transaction) = transactionDao.updateTransaction(transaction)

    suspend fun deleteById(id: Int) = transactionDao.deleteTransactionById(id)

    suspend fun insertWallet(wallet: Wallet) = transactionDao.insertWallet(wallet)

    suspend fun deleteWallet(wallet: Wallet) = transactionDao.deleteWallet(wallet)
}
