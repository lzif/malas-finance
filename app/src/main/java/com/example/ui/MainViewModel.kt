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

    private val _notesInput = MutableStateFlow("")
    val notesInput = _notesInput.asStateFlow()

    private val _selectedCategory = MutableStateFlow("CORE")
    val selectedCategory = _selectedCategory.asStateFlow()

    private val _transactionType = MutableStateFlow("OUT") // "IN" or "OUT"
    val transactionType = _transactionType.asStateFlow()

    fun onAmountChange(value: String) {
        // Only allow numbers
        if (value.all { it.isDigit() }) {
            _amountInput.value = value
        }
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

    fun saveTransaction() {
        val amount = _amountInput.value.toLongOrNull()
        if (amount != null && amount > 0) {
            val tx = Transaction(
                amount = amount,
                type = _transactionType.value,
                category = _selectedCategory.value,
                notes = _notesInput.value.trim()
            )
            viewModelScope.launch {
                repository.insert(tx)
                _amountInput.value = ""
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
