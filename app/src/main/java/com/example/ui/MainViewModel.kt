package com.example.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.data.Category
import com.example.data.Transaction
import com.example.data.TransactionRepository
import com.example.data.TxType
import com.example.data.Wallet
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainViewModel(private val repository: TransactionRepository) : ViewModel() {

    val transactions: StateFlow<List<Transaction>> = repository.allTransactions
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    val wallets: StateFlow<List<Wallet>> = repository.allWallets
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    val deletedTransactions: StateFlow<List<Transaction>> = repository.deletedTransactions
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    private val _amountInput = MutableStateFlow("")
    val amountInput = _amountInput.asStateFlow()

    private val _subcategoryInput = MutableStateFlow("")
    val subcategoryInput = _subcategoryInput.asStateFlow()

    private val _notesInput = MutableStateFlow("")
    val notesInput = _notesInput.asStateFlow()

    private val _selectedCategory = MutableStateFlow(Category.CORE)
    val selectedCategory = _selectedCategory.asStateFlow()

    private val _transactionType = MutableStateFlow(TxType.OUT)
    val transactionType = _transactionType.asStateFlow()

    private val _walletSource = MutableStateFlow("CASH")
    val walletSource = _walletSource.asStateFlow()

    private val _walletDestination = MutableStateFlow<String?>(null)
    val walletDestination = _walletDestination.asStateFlow()

    private val _feeInput = MutableStateFlow("")
    val feeInput = _feeInput.asStateFlow()

    private val _editingTransactionId = MutableStateFlow<Int?>(null)
    val editingTransactionId = _editingTransactionId.asStateFlow()

    private val _walletDeleteError = MutableStateFlow<String?>(null)
    val walletDeleteError = _walletDeleteError.asStateFlow()

    private val timestampFormat = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT).apply {
        isLenient = false
    }

    private val _timestampInput = MutableStateFlow(timestampFormat.format(Date()))
    val timestampInput = _timestampInput.asStateFlow()

    val frequentLogs: StateFlow<List<Transaction>> = transactions.map { txList ->
        txList.filter { it.type != TxType.TRANSFER }.groupBy { "${it.amount}|${it.category}|${it.subcategory}|${it.type}" }
            .map { entry -> entry.value.first() to entry.value.size }
            .sortedByDescending { it.second }
            .map { it.first }
            .filter { it.subcategory.isNotBlank() }
            .take(3)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _customSubcategories = MutableStateFlow<Map<String, Set<String>>>(emptyMap())

    val subcategories: StateFlow<List<String>> = combine(
        transactions, 
        selectedCategory, 
        _customSubcategories
    ) { txList, category, customMap ->
        val customForCat = customMap[category] ?: emptySet()
        val existingForCat = txList.filter { it.category == category && it.subcategory.isNotBlank() }
            .groupBy { it.subcategory }
            .map { it.key to it.value.size }
            .sortedByDescending { it.second }
            .map { it.first }
            .take(5)
            
        (customForCat + existingForCat).distinct().take(5)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun addWallet(name: String) {
        val trimmed = name.trim()
        if (trimmed.isNotEmpty()) {
            viewModelScope.launch {
                repository.insertWallet(Wallet(trimmed))
            }
        }
    }

    fun deleteWallet(name: String) {
        viewModelScope.launch {
            val refCount = repository.countReferencesToWallet(name)
            if (refCount > 0) {
                _walletDeleteError.value = "Cannot delete '$name': $refCount active transaction(s) use this wallet"
            } else {
                repository.deleteWallet(Wallet(name))
            }
        }
    }

    fun clearWalletDeleteError() {
        _walletDeleteError.value = null
    }

    fun onAmountChange(value: String) {
        // Only allow numbers
        if (value.all { it.isDigit() }) {
            _amountInput.value = value
        }
    }
    
    fun onFeeChange(value: String) {
        if (value.all { it.isDigit() }) {
            _feeInput.value = value
        }
    }

    fun onSubcategoryChange(value: String) {
        _subcategoryInput.value = value
    }
    
    fun onCustomSubcategoryAdded(value: String) {
        val currentCategory = _selectedCategory.value
        val currentMap = _customSubcategories.value.toMutableMap()
        val currentSet = currentMap[currentCategory] ?: emptySet()
        currentMap[currentCategory] = setOf(value) + currentSet
        _customSubcategories.value = currentMap
        _subcategoryInput.value = value
    }

    fun onNotesChange(value: String) {
        _notesInput.value = value
    }

    fun onTimestampChange(value: String) {
        _timestampInput.value = value
    }

    fun onCategorySelect(category: String) {
        _selectedCategory.value = category
    }

    fun onTypeSelect(type: String) {
        if (_transactionType.value != type) {
            _transactionType.value = type
            _subcategoryInput.value = ""
            if (type == TxType.OUT) {
                _selectedCategory.value = Category.CORE
            } else if (type == TxType.IN) {
                _selectedCategory.value = Category.GAJI
            } else if (type == TxType.TRANSFER) {
                _selectedCategory.value = Category.TRANSFER
                _walletDestination.value = wallets.value.firstOrNull()?.name ?: "BANK"
                _feeInput.value = ""
            }
        }
    }

    fun onWalletSourceSelect(wallet: String) {
        _walletSource.value = wallet
    }

    fun onWalletDestinationSelect(wallet: String) {
        _walletDestination.value = wallet
    }

    fun appendZeros() {
        if (_amountInput.value.isNotEmpty()) {
            _amountInput.value += "000"
        }
    }

    fun onEditTransaction(transaction: Transaction) {
        _editingTransactionId.value = transaction.id
        _transactionType.value = transaction.type
        _amountInput.value = transaction.amount.toString()
        _selectedCategory.value = transaction.category
        _subcategoryInput.value = transaction.subcategory
        _notesInput.value = transaction.notes ?: ""
        _walletSource.value = transaction.walletSource
        _walletDestination.value = transaction.walletDestination
        _feeInput.value = transaction.fee?.toString() ?: ""
        _timestampInput.value = timestampFormat.format(Date(transaction.timestamp))
    }

    fun applyFrequent(amount: Long, category: String, subcategory: String, type: String) {
        _amountInput.value = amount.toString()
        _selectedCategory.value = category
        _subcategoryInput.value = subcategory
        _notesInput.value = ""
        _transactionType.value = type
    }

    fun saveTransaction() {
        val amount = _amountInput.value.toLongOrNull()
        val timestamp = runCatching { timestampFormat.parse(_timestampInput.value)?.time }.getOrNull()
        if (amount != null && amount > 0 && timestamp != null) {
            val editId = _editingTransactionId.value
            
            val isTransfer = _transactionType.value == TxType.TRANSFER

            val tx = Transaction(
                id = editId ?: 0,
                amount = amount,
                type = _transactionType.value,
                category = if (isTransfer) Category.TRANSFER else _selectedCategory.value,
                subcategory = if (isTransfer) "" else _subcategoryInput.value.trim(),
                notes = _notesInput.value.trim().takeIf { it.isNotEmpty() },
                timestamp = timestamp,
                walletSource = _walletSource.value,
                walletDestination = if (isTransfer) _walletDestination.value else null,
                fee = if (isTransfer) _feeInput.value.toLongOrNull() else null
            )
            viewModelScope.launch {
                if (editId != null) {
                    repository.update(tx)
                    _editingTransactionId.value = null
                } else {
                    repository.insert(tx)
                }
                _amountInput.value = ""
                _subcategoryInput.value = ""
                _notesInput.value = ""
                _feeInput.value = ""
                _timestampInput.value = timestampFormat.format(Date())
            }
        }
    }

    fun softDeleteTransaction(id: Int) {
        viewModelScope.launch {
            repository.softDeleteById(id)
        }
    }

    fun restoreTransaction(id: Int) {
        viewModelScope.launch {
            repository.restoreById(id)
        }
    }

    fun importTransactions(transactions: List<Transaction>) {
        viewModelScope.launch {
            repository.insertAll(transactions)
        }
    }

    fun deleteTransaction(id: Int) {
        viewModelScope.launch {
            repository.deleteById(id)
        }
    }
}

class MainViewModelFactory(private val repository: TransactionRepository) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(MainViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return MainViewModel(repository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
