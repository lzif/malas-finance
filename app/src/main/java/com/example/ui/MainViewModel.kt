package com.example.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.data.Transaction
import com.example.data.TransactionRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class MainViewModel(private val repository: TransactionRepository) : ViewModel() {

    val transactions: StateFlow<List<Transaction>> = repository.allTransactions
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

    private val _selectedCategory = MutableStateFlow("CORE")
    val selectedCategory = _selectedCategory.asStateFlow()

    private val _transactionType = MutableStateFlow("OUT") // "IN" or "OUT"
    val transactionType = _transactionType.asStateFlow()

    val frequentLogs: StateFlow<List<Transaction>> = transactions.map { txList ->
        txList.groupBy { "${it.amount}|${it.category}|${it.subcategory}|${it.type}" }
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

    fun onAmountChange(value: String) {
        // Only allow numbers
        if (value.all { it.isDigit() }) {
            _amountInput.value = value
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

    fun onCategorySelect(category: String) {
        _selectedCategory.value = category
    }

    fun onTypeSelect(type: String) {
        _transactionType.value = type
    }

    fun appendZeros() {
        if (_amountInput.value.isNotEmpty()) {
            _amountInput.value += "000"
        }
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
        if (amount != null && amount > 0) {
            val tx = Transaction(
                amount = amount,
                type = _transactionType.value,
                category = _selectedCategory.value,
                subcategory = _subcategoryInput.value.trim(),
                notes = _notesInput.value.trim().takeIf { it.isNotEmpty() }
            )
            viewModelScope.launch {
                repository.insert(tx)
                _amountInput.value = ""
                _subcategoryInput.value = ""
                _notesInput.value = ""
            }
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
