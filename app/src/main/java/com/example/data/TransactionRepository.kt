package com.example.data

import kotlinx.coroutines.flow.Flow

class TransactionRepository(
    private val transactionDao: TransactionDao,
    private val goalDao: GoalDao
) {
    val allTransactions: Flow<List<Transaction>> = transactionDao.getAllTransactions()
    val deletedTransactions: Flow<List<Transaction>> = transactionDao.getDeletedTransactions()
    val allWallets: Flow<List<Wallet>> = transactionDao.getAllWallets()

    // Goals live in a separate DAO, intentionally independent from wallets
    // and transactions. The flow pair mirrors the active/trash pattern used
    // for transactions so the UI can render the same lifecycle.
    val activeGoals: Flow<List<Goal>> = goalDao.getActiveGoals()
    val deletedGoals: Flow<List<Goal>> = goalDao.getDeletedGoals()

    suspend fun insert(transaction: Transaction) = transactionDao.insertTransaction(transaction)

    suspend fun insertAll(transactions: List<Transaction>) = transactionDao.insertTransactions(transactions)

    suspend fun update(transaction: Transaction) = transactionDao.updateTransaction(transaction)

    suspend fun softDeleteById(id: Int) = transactionDao.softDeleteTransactionById(id, System.currentTimeMillis())

    suspend fun restoreById(id: Int) = transactionDao.restoreTransactionById(id)

    suspend fun deleteById(id: Int) = transactionDao.deleteTransactionById(id)

    suspend fun insertWallet(wallet: Wallet) = transactionDao.insertWallet(wallet)

    suspend fun deleteWallet(wallet: Wallet) = transactionDao.deleteWallet(wallet)

    suspend fun countReferencesToWallet(walletName: String): Int = transactionDao.countTransactionsReferencingWallet(walletName)

    suspend fun insertGoal(goal: Goal) = goalDao.insertGoal(goal)

    suspend fun updateGoal(goal: Goal) = goalDao.updateGoal(goal)

    suspend fun softDeleteGoalById(id: Int) = goalDao.softDeleteGoalById(id, System.currentTimeMillis())

    suspend fun restoreGoalById(id: Int) = goalDao.restoreGoalById(id)

    suspend fun deleteGoalById(id: Int) = goalDao.deleteGoalById(id)

    suspend fun getGoalById(id: Int): Goal? = goalDao.getGoalById(id)
}
