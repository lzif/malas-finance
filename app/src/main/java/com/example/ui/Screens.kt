package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.List
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.example.data.Category
import com.example.data.Transaction
import com.example.data.TxType
import com.example.data.formatCurrency
import com.example.ui.theme.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(viewModel: MainViewModel) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route ?: "entry"

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets.systemBars,
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.onSurface,
                tonalElevation = 8.dp,
                modifier = Modifier.padding(top = 8.dp)
            ) {
                NavigationBarItem(
                    selected = currentRoute == "entry",
                    onClick = {
                        navController.navigate("entry") {
                            popUpTo(navController.graph.startDestinationId) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                    icon = { Icon(Icons.Default.Add, contentDescription = "Entry") },
                    label = { Text("ENTRY", style = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 10.sp)) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = White,
                        selectedTextColor = PrimaryBlue,
                        indicatorColor = PrimaryBlue,
                        unselectedIconColor = TextGray,
                        unselectedTextColor = TextGray
                    )
                )
                NavigationBarItem(
                    selected = currentRoute == "logs",
                    onClick = {
                        navController.navigate("logs") {
                            popUpTo(navController.graph.startDestinationId) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                    icon = { Icon(Icons.Default.List, contentDescription = "Logs") },
                    label = { Text("LOGS", style = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 10.sp)) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = White,
                        selectedTextColor = PrimaryBlue,
                        indicatorColor = PrimaryBlue,
                        unselectedIconColor = TextGray,
                        unselectedTextColor = TextGray
                    )
                )
            }
        }
    ) { paddingValues ->
        NavHost(
            navController = navController,
            startDestination = "entry",
            modifier = Modifier.padding(paddingValues).fillMaxSize()
        ) {
            composable("entry") {
                EntryScreen(viewModel)
            }
            composable("logs") {
                LogsScreen(viewModel = viewModel, onNavigateToEntry = {
                    navController.navigate("entry") {
                        popUpTo(navController.graph.startDestinationId) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                })
            }
        }
    }
}

@Composable
fun EntryScreen(viewModel: MainViewModel) {
    val transactions by viewModel.transactions.collectAsStateWithLifecycle()
    val deletedTransactions by viewModel.deletedTransactions.collectAsStateWithLifecycle()
    val amountInput by viewModel.amountInput.collectAsStateWithLifecycle()
    val notesInput by viewModel.notesInput.collectAsStateWithLifecycle()
    val selectedCategory by viewModel.selectedCategory.collectAsStateWithLifecycle()
    val transactionType by viewModel.transactionType.collectAsStateWithLifecycle()
    val frequentLogs by viewModel.frequentLogs.collectAsStateWithLifecycle()
    val subcategories by viewModel.subcategories.collectAsStateWithLifecycle()

    val subcategoryInput by viewModel.subcategoryInput.collectAsStateWithLifecycle()

    val wallets by viewModel.wallets.collectAsStateWithLifecycle()
    val walletSource by viewModel.walletSource.collectAsStateWithLifecycle()
    val walletDestination by viewModel.walletDestination.collectAsStateWithLifecycle()
    val feeInput by viewModel.feeInput.collectAsStateWithLifecycle()
    val timestampInput by viewModel.timestampInput.collectAsStateWithLifecycle()

    val editingTransactionId by viewModel.editingTransactionId.collectAsStateWithLifecycle()
    val walletDeleteError by viewModel.walletDeleteError.collectAsStateWithLifecycle()

    val context = LocalContext.current

    val totalInflow = transactions.filter { it.type == TxType.IN }.sumOf { it.amount }
    val totalOutflow = transactions.filter { it.type == TxType.OUT }.sumOf { it.amount }
    val balance = totalInflow - totalOutflow

    val focusManager = LocalFocusManager.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                detectTapGestures(onTap = { focusManager.clearFocus() })
            }
            .padding(6.dp)
    ) {
        HeaderSection(totalInflow, totalOutflow, balance, transactions + deletedTransactions, context, viewModel::importTransactions)

        Spacer(modifier = Modifier.height(6.dp))

        // QuickLogs — recent active transactions inline above the entry form.
        Surface(
            modifier = Modifier.weight(0.35f).fillMaxWidth().shadow(
                elevation = 3.dp,
                shape = RoundedCornerShape(12.dp),
                spotColor = Color.LightGray,
                ambientColor = Color.LightGray
            ),
            shape = RoundedCornerShape(12.dp),
            color = White
        ) {
            Column(modifier = Modifier.fillMaxSize().padding(6.dp)) {
                Text("QUICK LOGS", style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = TextGray))
                Spacer(modifier = Modifier.height(4.dp))
                LazyColumn(modifier = Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    items(transactions) { tx ->
                        val dateFormat = SimpleDateFormat("HH:mm", Locale.ROOT)
                        val timeStr = dateFormat.format(Date(tx.timestamp))

                        val displayCategory = if (tx.category == Category.OPS) Category.OPER else tx.category
                        val color = when (displayCategory) {
                            Category.CORE -> CoreColor
                            Category.OPER -> OpsColor
                            Category.HOBBY -> HobbyColor
                            Category.VAULT -> VaultColor
                            else -> TextPrimary
                        }
                        Surface(
                            shape = RoundedCornerShape(20.dp),
                            color = ComponentBg,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(timeStr, style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 10.sp, color = TextGray))
                                Spacer(modifier = Modifier.width(6.dp))
                                Surface(color = color.copy(alpha = 0.15f), shape = RoundedCornerShape(percent = 50)) {
                                    Text(displayCategory, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp), style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = color))
                                }
                                Spacer(modifier = Modifier.width(6.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    val subcatText = tx.subcategory.ifBlank { "NO SUBCATEGORY" }
                                    Text(subcatText, style = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = TextPrimary), maxLines = 1)
                                    if (!tx.notes.isNullOrEmpty()) {
                                        Text(tx.notes, style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 10.sp, color = TextGray), maxLines = 1)
                                    }
                                }
                                Text(
                                    text = formatCurrency(tx.amount),
                                    style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 14.sp, fontWeight = FontWeight.Black, color = if (tx.type == TxType.IN) VaultColor else TextPrimary),
                                    textAlign = TextAlign.End
                                )
                            }
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(6.dp))

        Surface(
            modifier = Modifier.weight(0.65f).fillMaxWidth().shadow(
                elevation = 3.dp,
                shape = RoundedCornerShape(12.dp),
                spotColor = Color.LightGray,
                ambientColor = Color.LightGray
            ),
            shape = RoundedCornerShape(12.dp),
            color = White
        ) {
            MidSection(
                modifier = Modifier.fillMaxWidth().padding(6.dp),
                amountInput = amountInput,
                onAmountChange = viewModel::onAmountChange,
                subcategoryInput = subcategoryInput,
                onSubcategoryChange = viewModel::onSubcategoryChange,
                onCustomSubcategoryAdded = viewModel::onCustomSubcategoryAdded,
                notesInput = notesInput,
                onNotesChange = viewModel::onNotesChange,
                selectedCategory = selectedCategory,
                onCategorySelect = viewModel::onCategorySelect,
                transactionType = transactionType,
                onTypeSelect = viewModel::onTypeSelect,
                wallets = wallets.map { it.name },
                walletSource = walletSource,
                onWalletSourceSelect = viewModel::onWalletSourceSelect,
                walletDestination = walletDestination,
                onWalletDestinationSelect = viewModel::onWalletDestinationSelect,
                feeInput = feeInput,
                onFeeChange = viewModel::onFeeChange,
                timestampInput = timestampInput,
                onTimestampChange = viewModel::onTimestampChange,
                onAddWallet = viewModel::addWallet,
                onDeleteWallet = viewModel::deleteWallet,
                walletDeleteError = walletDeleteError,
                onClearWalletDeleteError = viewModel::clearWalletDeleteError,
                onSave = viewModel::saveTransaction,
                frequentLogs = frequentLogs,
                subcategories = subcategories,
                editingTransactionId = editingTransactionId,
                onAppendZeros = viewModel::appendZeros,
                onApplyFrequent = viewModel::applyFrequent
            )
        }
    }
}

@Composable
fun LogsScreen(viewModel: MainViewModel, onNavigateToEntry: () -> Unit) {
    val transactions by viewModel.transactions.collectAsStateWithLifecycle()
    val deletedTransactions by viewModel.deletedTransactions.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        BottomSection(
            transactions = transactions,
            deletedTransactions = deletedTransactions,
            onDelete = viewModel::softDeleteTransaction,
            onRestore = viewModel::restoreTransaction,
            onPermanentDelete = viewModel::deleteTransaction,
            onEdit = { tx ->
                viewModel.onEditTransaction(tx)
                onNavigateToEntry()
            }
        )
    }
}
