package com.example.ui

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Context
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.List
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.data.Transaction
import com.example.data.formatCurrency
import com.example.data.generateBackupJson
import com.example.data.generateMarkdown
import com.example.data.parseBackupJson
import com.example.ui.theme.*
import com.example.util.copyToClipboard
import com.example.util.saveToFile
import java.text.SimpleDateFormat
import java.util.*

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

    val totalInflow = transactions.filter { it.type == "IN" }.sumOf { it.amount }
    val totalOutflow = transactions.filter { it.type == "OUT" }.sumOf { it.amount }
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
                        
                        val displayCategory = if (tx.category == "OPS") "OPER" else tx.category
                        val color = when (displayCategory) {
                            "CORE" -> CoreColor
                            "OPER" -> OpsColor
                            "HOBBY" -> HobbyColor
                            "VAULT" -> VaultColor
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
                                    style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 14.sp, fontWeight = FontWeight.Black, color = if (tx.type == "IN") VaultColor else TextPrimary),
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

@Composable
fun HeaderSection(inflow: Long, outflow: Long, balance: Long, transactions: List<Transaction>, context: Context, onImport: (List<Transaction>) -> Unit) {
    var showExportDialog by remember { mutableStateOf(false) }

    if (showExportDialog) {
        ExportDialog(
            transactions = transactions,
            onDismiss = { showExportDialog = false },
            context = context,
            onImport = onImport
        )
    }

    Surface(
        modifier = Modifier.fillMaxWidth().shadow(
            elevation = 3.dp,
            shape = RoundedCornerShape(12.dp),
            spotColor = Color.LightGray,
            ambientColor = Color.LightGray
        ),
        shape = RoundedCornerShape(12.dp),
        color = White
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "MALAS_FINANCE_v1.5.1",
                    style = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp, letterSpacing = 1.sp, color = TextGray)
                )
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Box(modifier = Modifier.size(20.dp))
                    Icon(
                        imageVector = Icons.Default.Share,
                        contentDescription = "Export",
                        tint = TextPrimary,
                        modifier = Modifier.size(20.dp).clickable { showExportDialog = true }
                    )
                }
            }
        
        Spacer(modifier = Modifier.height(6.dp))
        
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 6.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("INCOME", style = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 10.sp, color = TextGray))
                Text("+${formatCurrency(inflow)}", style = TextStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Black, fontSize = 16.sp, color = VaultColor))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text("EXPENSE", style = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 10.sp, color = TextGray))
                Text("-${formatCurrency(outflow)}", style = TextStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Black, fontSize = 16.sp, color = CoreColor))
            }
            Column(modifier = Modifier.weight(1f), horizontalAlignment = Alignment.End) {
                Text("BALANCE", style = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 10.sp, color = TextGray))
                Text(formatCurrency(balance), style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 16.sp, fontWeight = FontWeight.Black, color = TextPrimary))
            }
        }

        HorizontalDivider(color = MediumGray, thickness = 1.dp)
        Spacer(modifier = Modifier.height(6.dp))

        // Category percentages
        val outTxs = transactions.filter { it.type == "OUT" }
        val outTotal = outTxs.sumOf { it.amount }.coerceAtLeast(1)
        val corePct = (outTxs.filter { it.category == "CORE" }.sumOf { it.amount } * 100 / outTotal).toInt()
        val opsPct = (outTxs.filter { it.category == "OPS" }.sumOf { it.amount } * 100 / outTotal).toInt()
        val hobbyPct = (outTxs.filter { it.category == "HOBBY" }.sumOf { it.amount } * 100 / outTotal).toInt()
        val vaultPct = (outTxs.filter { it.category == "VAULT" }.sumOf { it.amount } * 100 / outTotal).toInt()

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            CategoryStatBox("CORE", corePct, CoreColor)
            CategoryStatBox("OPER", opsPct, OpsColor)
            CategoryStatBox("HOBBY", hobbyPct, HobbyColor)
            CategoryStatBox("VAULT", vaultPct, VaultColor)
        }
        }
    }
}

@Composable
fun CategoryStatBox(name: String, percentage: Int, color: Color) {
    Surface(
        color = Color.Transparent
    ) {
        Row(modifier = Modifier.padding(start = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(modifier = Modifier.size(16.dp), shape = CircleShape, color = color.copy(alpha = 0.2f)) {
                Box(modifier = Modifier.fillMaxSize().padding(4.dp).background(color, CircleShape))
            }
            Spacer(modifier = Modifier.width(4.dp))
            Column {
                Text(name, style = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 9.sp, color = TextGray))
                Text("$percentage%", style = TextStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 11.sp, color = TextPrimary))
            }
        }
    }
}

@Composable
fun MidSection(
    modifier: Modifier = Modifier,
    amountInput: String,
    onAmountChange: (String) -> Unit,
    subcategoryInput: String,
    onSubcategoryChange: (String) -> Unit,
    onCustomSubcategoryAdded: (String) -> Unit,
    notesInput: String,
    onNotesChange: (String) -> Unit,
    selectedCategory: String,
    onCategorySelect: (String) -> Unit,
    transactionType: String,
    onTypeSelect: (String) -> Unit,
    wallets: List<String>,
    walletSource: String,
    onWalletSourceSelect: (String) -> Unit,
    walletDestination: String?,
    onWalletDestinationSelect: (String) -> Unit,
    feeInput: String,
    onFeeChange: (String) -> Unit,
    timestampInput: String,
    onTimestampChange: (String) -> Unit,
    onAddWallet: (String) -> Unit,
    onDeleteWallet: (String) -> Unit,
    walletDeleteError: String?,
    onClearWalletDeleteError: () -> Unit,
    onSave: () -> Unit,
    frequentLogs: List<Transaction>,
    subcategories: List<String>,
    editingTransactionId: Int?,
    onAppendZeros: () -> Unit,
    onApplyFrequent: (Long, String, String, String) -> Unit
) {
    var isAddingSubcat by remember { mutableStateOf(false) }
    var showWalletManager by remember { mutableStateOf(false) }

    if (showWalletManager) {
        WalletManagerDialog(
            wallets = wallets,
            onAddWallet = onAddWallet,
            onDeleteWallet = onDeleteWallet,
            onDismiss = { showWalletManager = false },
            deleteError = walletDeleteError,
            onClearError = onClearWalletDeleteError
        )
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        // Quick Action Chips
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            frequentLogs.forEach { tx ->
                val catDisp = if (tx.category == "OPS") "OPER" else tx.category
                QuickActionChip(text = "${tx.subcategory.ifBlank{catDisp}} ${tx.amount/1000}k", isDynamic = true) {
                    onApplyFrequent(tx.amount, tx.category, tx.subcategory, tx.type)
                }
            }
        }

        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("TYPE: ", style = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 10.sp, color = TextGray, letterSpacing = 2.sp))
                val types = listOf("OUT" to "EXPENSE", "IN" to "INCOME", "TRANSFER" to "TRANSFER")
                types.forEach { (typeKey, textLabel) ->
                    val isSelected = transactionType == typeKey
                    val color = if (isSelected) (if (typeKey == "IN") VaultColor else if (typeKey == "OUT") CoreColor else PrimaryBlue) else TextGray
                    Surface(
                        modifier = Modifier.clickable { onTypeSelect(typeKey) },
                        shape = CircleShape,
                        color = if (isSelected) color.copy(alpha = 0.15f) else Color.Transparent
                    ) {
                        Text(
                            text = textLabel,
                            color = color,
                            style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 12.sp, fontWeight = if (isSelected) FontWeight.ExtraBold else FontWeight.Normal, letterSpacing = 1.sp),
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.height(4.dp))
            
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Surface(
                    modifier = Modifier.weight(1f),
                    color = ComponentBg,
                    shape = RoundedCornerShape(20.dp)
                ) {
                    val formattedAmount = amountInput.toLongOrNull()?.let { formatCurrency(it).replace("IDR ", "") } ?: ""
                    BasicTextField(
                        value = formattedAmount,
                        onValueChange = { newVal ->
                            val plainDigits = newVal.replace(".", "").replace(",", "")
                            onAmountChange(plainDigits)
                        },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        textStyle = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 28.sp, fontWeight = FontWeight.Black, color = TextPrimary, textAlign = TextAlign.Center),
                        modifier = Modifier.fillMaxWidth().padding(8.dp).testTag("amount_input"),
                        cursorBrush = SolidColor(TextPrimary),
                        decorationBox = { innerTextField ->
                            if (amountInput.isEmpty()) {
                                Text("0", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 28.sp, fontWeight = FontWeight.Black, color = TextSecondary, textAlign = TextAlign.Center), modifier = Modifier.fillMaxWidth())
                            }
                            innerTextField()
                        }
                    )
                }
                
                Surface(
                    modifier = Modifier.clickable { onAppendZeros() },
                    shape = RoundedCornerShape(20.dp),
                    color = ComponentBg
                ) {
                    Text(
                        text = "000",
                        style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 20.sp, color = TextPrimary, fontWeight = FontWeight.Bold),
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)
                    )
                }
            }
        }

        // Wallet Selection
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("WALLET:", style = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 10.sp, color = TextGray))
            WalletDropdown(
                selectedWallet = walletSource.ifBlank { "CASH" },
                wallets = wallets,
                onSelect = onWalletSourceSelect,
                modifier = Modifier.weight(1f)
            )
            Icon(
                imageVector = Icons.Default.Settings,
                contentDescription = "Manage Wallets",
                tint = TextGray,
                modifier = Modifier.size(24.dp).clickable { showWalletManager = true }
            )
        }

        if (transactionType == "TRANSFER") {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("TO:", style = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 10.sp, color = TextGray))
                WalletDropdown(
                    selectedWallet = walletDestination ?: wallets.firstOrNull() ?: "BANK",
                    wallets = wallets,
                    onSelect = onWalletDestinationSelect,
                    modifier = Modifier.weight(1f)
                )
            }
            
            // Fee input
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("FEE:", style = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 10.sp, color = TextGray))
                Spacer(modifier = Modifier.width(8.dp))
                Surface(
                    modifier = Modifier.weight(1f),
                    color = ComponentBg,
                    shape = RoundedCornerShape(percent = 50)
                ) {
                    val formattedFee = feeInput.toLongOrNull()?.let { formatCurrency(it).replace("IDR ", "") } ?: ""
                    BasicTextField(
                        value = formattedFee,
                        onValueChange = { newVal -> onFeeChange(newVal.replace(".", "").replace(",", "")) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        textStyle = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TextPrimary),
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp).testTag("fee_input"),
                        cursorBrush = SolidColor(TextPrimary),
                        decorationBox = { innerTextField ->
                            if (feeInput.isEmpty()) {
                                Text("0", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TextSecondary))
                            }
                            innerTextField()
                        }
                    )
                }
            }
        }

        // Categories stay one row to keep entry form thumb-height.
        if (transactionType != "TRANSFER") {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                val cat1 = if (transactionType == "IN") "GAJI" else "CORE"
                val cat2 = if (transactionType == "IN") "KEBUN" else "OPER"
                val cat2Value = if (transactionType == "IN") "KEBUN" else "OPS"
                val cat3 = if (transactionType == "IN") "BONUS" else "HOBBY"
                val cat4 = if (transactionType == "IN") "LAINNYA" else "VAULT"

                CategoryGridButton(cat1, selectedCategory == cat1, CoreColor, modifier = Modifier.weight(1f)) { onCategorySelect(cat1) }
                CategoryGridButton(cat2, selectedCategory == cat2Value, OpsColor, modifier = Modifier.weight(1f)) { onCategorySelect(cat2Value) }
                CategoryGridButton(cat3, selectedCategory == cat3, HobbyColor, modifier = Modifier.weight(1f)) { onCategorySelect(cat3) }
                CategoryGridButton(cat4, selectedCategory == cat4, VaultColor, modifier = Modifier.weight(1f)) { onCategorySelect(cat4) }
            }

            // Subcategory / Tags
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                subcategories.forEach { subcat ->
                    val isSelected = subcategoryInput == subcat
                    Surface(
                        modifier = Modifier.clickable { onSubcategoryChange(if (isSelected) "" else subcat) },
                        shape = RoundedCornerShape(percent = 50),
                        color = if (isSelected) PrimaryBlue else ComponentBg
                    ) {
                        Text(
                            text = subcat,
                            style = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = if (isSelected) White else TextGray),
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                        )
                    }
                }

                if (isAddingSubcat) {
                    var newSub by remember { mutableStateOf("") }
                    BasicTextField(
                        value = newSub,
                        onValueChange = { newSub = it.uppercase() },
                        singleLine = true,
                        textStyle = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = TextPrimary),
                        modifier = Modifier.background(ComponentBg, RoundedCornerShape(percent = 50)).padding(horizontal = 16.dp, vertical = 8.dp).width(100.dp),
                        cursorBrush = SolidColor(TextPrimary),
                        decorationBox = { inner ->
                            if (newSub.isEmpty()) Text("NEW TAG...", style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 10.sp, color = TextGray))
                            inner()
                        }
                    )
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = "Save Tag",
                        tint = White,
                        modifier = Modifier.size(32.dp).background(PrimaryBlue, CircleShape).clickable {
                            if (newSub.isNotBlank()) onCustomSubcategoryAdded(newSub)
                            isAddingSubcat = false
                        }.padding(4.dp)
                    )
                } else {
                    Surface(
                        modifier = Modifier.clickable { isAddingSubcat = true },
                        shape = CircleShape,
                        color = ComponentBg
                    ) {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = "Add",
                            tint = TextGray,
                            modifier = Modifier.padding(8.dp).size(16.dp)
                        )
                    }
                }
            }
        }

        DateTimePickerRow(timestampInput = timestampInput, onTimestampChange = onTimestampChange)

        // Notes (Optional)
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = ComponentBg,
            shape = RoundedCornerShape(20.dp)
        ) {
            BasicTextField(
                value = notesInput ?: "",
                onValueChange = onNotesChange,
                singleLine = true,
                textStyle = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 14.sp, color = TextPrimary),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp).testTag("notes_input"),
                cursorBrush = SolidColor(TextPrimary),
                decorationBox = { innerTextField ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (notesInput.isNullOrEmpty()) {
                            Text("Notes (Optional)", style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 14.sp, color = TextSecondary))
                        }
                        innerTextField()
                    }
                }
            )
        }

        // SAVE BUTTON
        Button(
            onClick = onSave,
            modifier = Modifier.fillMaxWidth().height(44.dp).testTag("save_button"),
            colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue, contentColor = White),
            shape = CircleShape,
            contentPadding = PaddingValues(0.dp),
            enabled = amountInput.isNotBlank()
        ) {
            Text(if (editingTransactionId != null) "UPDATE" else "SUBMIT", style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold))
        }
    }
}

@Composable
fun DateTimePickerRow(timestampInput: String, onTimestampChange: (String) -> Unit) {
    val context = LocalContext.current
    val format = remember { SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT).apply { isLenient = false } }
    val label = timestampInput.ifBlank { format.format(Date(System.currentTimeMillis())) }

    Surface(
        modifier = Modifier.fillMaxWidth().clickable {
            val cal = Calendar.getInstance().apply {
                timeInMillis = runCatching { format.parse(label)?.time }.getOrNull() ?: System.currentTimeMillis()
            }
            DatePickerDialog(
                context,
                { _, year, month, day ->
                    cal.set(Calendar.YEAR, year)
                    cal.set(Calendar.MONTH, month)
                    cal.set(Calendar.DAY_OF_MONTH, day)
                    TimePickerDialog(
                        context,
                        { _, hour, minute ->
                            cal.set(Calendar.HOUR_OF_DAY, hour)
                            cal.set(Calendar.MINUTE, minute)
                            cal.set(Calendar.SECOND, 0)
                            onTimestampChange(format.format(cal.time))
                        },
                        cal.get(Calendar.HOUR_OF_DAY),
                        cal.get(Calendar.MINUTE),
                        true
                    ).show()
                },
                cal.get(Calendar.YEAR),
                cal.get(Calendar.MONTH),
                cal.get(Calendar.DAY_OF_MONTH)
            ).show()
        }.testTag("timestamp_input"),
        color = ComponentBg,
        shape = RoundedCornerShape(20.dp)
    ) {
        Text(
            text = label,
            style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = TextPrimary),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)
        )
    }
}

@Composable
fun QuickActionChip(text: String, isDynamic: Boolean = false, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(percent = 50),
        color = if (isDynamic) OpsColor.copy(alpha = 0.1f) else ComponentBg,
        border = if (isDynamic) BorderStroke(1.dp, OpsColor.copy(alpha = 0.5f)) else null
    ) {
        Text(
            text = text,
            style = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 11.sp, color = if (isDynamic) OpsColor else TextPrimary),
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
        )
    }
}

@Composable
fun CategoryGridButton(text: String, isSelected: Boolean, color: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(
        modifier = modifier
            .height(34.dp)
            .clickable(onClick = onClick),
        color = if (isSelected) White else ComponentBg,
        border = BorderStroke(if (isSelected) 2.dp else 1.dp, if (isSelected) color else color.copy(alpha = 0.2f)),
        shape = CircleShape
    ) {
        Row(
            modifier = Modifier.fillMaxSize(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(modifier = Modifier.size(12.dp), shape = CircleShape, color = color.copy(alpha = 0.1f)) {
                Box(modifier = Modifier.fillMaxSize().padding(3.dp).background(color, CircleShape))
            }
            Spacer(modifier = Modifier.width(3.dp))
            Text(text, style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = if (isSelected) TextPrimary else TextGray), maxLines = 1)
        }
    }
}

@Composable
fun BottomSection(
    transactions: List<Transaction>,
    deletedTransactions: List<Transaction>,
    onDelete: (Int) -> Unit,
    onRestore: (Int) -> Unit,
    onPermanentDelete: (Int) -> Unit,
    onEdit: (Transaction) -> Unit
) {
    var pendingDelete by remember { mutableStateOf<Transaction?>(null) }
    var pendingPermanentDelete by remember { mutableStateOf<Transaction?>(null) }
    var showTrash by remember { mutableStateOf(false) }

    pendingDelete?.let { tx ->
        ConfirmDialog(
            title = "Delete entry?",
            message = "Move ${formatCurrency(tx.amount)} to trash. You can restore it later.",
            confirmText = "DELETE",
            onConfirm = {
                onDelete(tx.id)
                pendingDelete = null
            },
            onDismiss = { pendingDelete = null }
        )
    }

    pendingPermanentDelete?.let { tx ->
        ConfirmDialog(
            title = "Delete forever?",
            message = "This permanently removes ${formatCurrency(tx.amount)} from trash.",
            confirmText = "DELETE FOREVER",
            onConfirm = {
                onPermanentDelete(tx.id)
                pendingPermanentDelete = null
            },
            onDismiss = { pendingPermanentDelete = null }
        )
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("LOG BOOK", style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = TextGray))
            Text(
                if (showTrash) "ACTIVE (${transactions.size})" else "TRASH (${deletedTransactions.size})",
                style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 9.sp, color = TextGray),
                modifier = Modifier.clickable { showTrash = !showTrash }
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        val list = if (showTrash) deletedTransactions else transactions
        LazyColumn(
            modifier = Modifier.fillMaxWidth(),
            contentPadding = PaddingValues(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(list, key = { it.id }) { tx ->
                TransactionRow(
                    tx = tx,
                    isTrash = showTrash,
                    onEdit = onEdit,
                    onDelete = { pendingDelete = tx },
                    onRestore = { onRestore(tx.id) },
                    onPermanentDelete = { pendingPermanentDelete = tx }
                )
            }
        }
    }
}

@Composable
fun TransactionRow(
    tx: Transaction,
    isTrash: Boolean,
    onEdit: (Transaction) -> Unit,
    onDelete: () -> Unit,
    onRestore: () -> Unit,
    onPermanentDelete: () -> Unit
) {
    val dateFormat = SimpleDateFormat("MM-dd HH:mm", Locale.ROOT)
    val timeStr = dateFormat.format(Date(tx.timestamp))
    val displayCategory = if (tx.category == "OPS") "OPER" else tx.category
    val color = when (displayCategory) {
        "CORE" -> CoreColor
        "OPER" -> OpsColor
        "HOBBY" -> HobbyColor
        "VAULT" -> VaultColor
        else -> TextPrimary
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = White,
        tonalElevation = 2.dp
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(timeStr, style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 10.sp, color = TextGray))
            Spacer(modifier = Modifier.width(12.dp))
            Surface(color = color.copy(alpha = 0.1f), shape = RoundedCornerShape(percent = 50)) {
                Text(displayCategory, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp), style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = color))
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                val subcatText = tx.subcategory.ifBlank { "NO SUBCATEGORY" }
                Text(subcatText, style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = TextPrimary), maxLines = 1)
                if (!tx.notes.isNullOrEmpty()) {
                    Text(tx.notes, style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 10.sp, color = TextGray), maxLines = 1)
                }
            }
            Text(
                text = formatCurrency(tx.amount),
                style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 14.sp, fontWeight = FontWeight.Black, color = if (tx.type == "IN") VaultColor else TextPrimary),
                textAlign = TextAlign.End
            )
            Spacer(modifier = Modifier.width(8.dp))
            if (isTrash) {
                Text("RESTORE", color = VaultColor, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clickable(onClick = onRestore).padding(6.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Icon(imageVector = Icons.Default.Delete, contentDescription = "Delete forever", tint = SoftRed, modifier = Modifier.size(28.dp).clickable(onClick = onPermanentDelete).padding(4.dp))
            } else {
                Text("EDIT", color = PrimaryBlue, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clickable { onEdit(tx) }.padding(6.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Icon(imageVector = Icons.Default.Delete, contentDescription = "Delete", tint = SoftRed, modifier = Modifier.size(28.dp).clickable(onClick = onDelete).padding(4.dp))
            }
        }
    }
}

@Composable
fun ConfirmDialog(title: String, message: String, confirmText: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text(confirmText, color = SoftRed) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("CANCEL") }
        }
    )
}

@Composable
fun ExportDialog(transactions: List<Transaction>, onDismiss: () -> Unit, context: Context, onImport: (List<Transaction>) -> Unit) {
    var selectedRange by remember { mutableStateOf("Current Month") }
    val ranges = listOf("This Week", "Current Month", "All Time")
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            val imported = context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { parseBackupJson(it.readText()) }.orEmpty()
            if (imported.isNotEmpty()) {
                onImport(imported)
                Toast.makeText(context, "Imported ${imported.size} entries", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(context, "No entries imported", Toast.LENGTH_SHORT).show()
            }
            onDismiss()
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = MediumGray,
            modifier = Modifier.padding(16.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("EXPORT FILTER", style = TextStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, color = White))
                
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ranges.forEach { range ->
                        Surface(
                            modifier = Modifier
                                .weight(1f)
                                .height(40.dp)
                                .clickable { selectedRange = range },
                            color = if (selectedRange == range) White else DarkGray,
                            shape = RoundedCornerShape(4.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(range, style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp, color = if (selectedRange == range) Black else TextPrimary))
                            }
                        }
                    }
                }

                HorizontalDivider(color = BorderGray)

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            val md = generateMarkdown(transactions, selectedRange)
                            copyToClipboard(context, md)
                            onDismiss()
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = DarkGray, contentColor = Black)
                    ) {
                        Text("Copy to Clipboard", style = TextStyle(fontFamily = FontFamily.Monospace, color = Black))
                    }
                    Button(
                        onClick = {
                            val md = generateMarkdown(transactions, selectedRange)
                            saveToFile(context, md, "MalasFinance_Export.md", "text/markdown")
                            onDismiss()
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = DarkGray, contentColor = Black)
                    ) {
                        Text("Save as Markdown (.md)", style = TextStyle(fontFamily = FontFamily.Monospace, color = Black))
                    }
                    Button(
                        onClick = {
                            val md = generateMarkdown(transactions, selectedRange)
                            saveToFile(context, md, "MalasFinance_Export.txt", "text/plain")
                            onDismiss()
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = DarkGray, contentColor = Black)
                    ) {
                        Text("Save as Text (.txt)", style = TextStyle(fontFamily = FontFamily.Monospace, color = Black))
                    }
                    Button(
                        onClick = {
                            val json = generateBackupJson(transactions)
                            saveToFile(context, json, "MalasFinance_Backup.json", "application/json")
                            onDismiss()
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = DarkGray, contentColor = Black)
                    ) {
                        Text("Save JSON Backup", style = TextStyle(fontFamily = FontFamily.Monospace, color = Black))
                    }
                    Button(
                        onClick = { importLauncher.launch("application/json") },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = DarkGray, contentColor = Black)
                    ) {
                        Text("Import JSON Backup", style = TextStyle(fontFamily = FontFamily.Monospace, color = Black))
                    }
                }
            }
        }
    }
}

@Composable
fun WalletDropdown(selectedWallet: String, wallets: List<String>, onSelect: (String) -> Unit, modifier: Modifier = Modifier) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier = modifier) {
        Surface(
            modifier = Modifier.fillMaxWidth().clickable { expanded = true },
            color = ComponentBg,
            shape = RoundedCornerShape(percent = 50)
        ) {
            Text(
                text = selectedWallet,
                style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 14.sp, color = TextPrimary, fontWeight = FontWeight.Bold),
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                textAlign = TextAlign.Center
            )
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            val list = if (wallets.isEmpty()) listOf("CASH") else wallets
            list.forEach { w ->
                DropdownMenuItem(
                    text = { Text(w, style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 14.sp, color = TextPrimary)) },
                    onClick = {
                        onSelect(w)
                        expanded = false
                    }
                )
            }
        }
    }
}

@Composable
fun WalletManagerDialog(wallets: List<String>, onAddWallet: (String) -> Unit, onDeleteWallet: (String) -> Unit, onDismiss: () -> Unit, deleteError: String?, onClearError: () -> Unit) {
    var newWalletName by remember { mutableStateOf("") }
    
    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(16.dp), color = MediumGray, modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("MANAGE WALLETS", style = TextStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, color = White))
                
                if (deleteError != null) {
                    Surface(color = SoftRed.copy(alpha = 0.15f), shape = RoundedCornerShape(8.dp)) {
                        Text(
                            deleteError,
                            style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 12.sp, color = SoftRed),
                            modifier = Modifier.padding(8.dp)
                        )
                    }
                    LaunchedEffect(deleteError) {
                        kotlinx.coroutines.delay(4000)
                        onClearError()
                    }
                }
                
                LazyColumn(modifier = Modifier.heightIn(max = 200.dp)) {
                    val list = if (wallets.isEmpty()) listOf("CASH") else wallets
                    items(list) { w ->
                        Row(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text(w, style = TextStyle(fontFamily = FontFamily.SansSerif, color = White))
                            if (w != "CASH") {
                                Icon(
                                    imageVector = Icons.Default.Delete,
                                    contentDescription = "Delete",
                                    tint = SoftRed,
                                    modifier = Modifier.clickable { onDeleteWallet(w) }.padding(8.dp)
                                )
                            }
                        }
                    }
                }
                
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BasicTextField(
                        value = newWalletName,
                        onValueChange = { newWalletName = it.uppercase() },
                        singleLine = true,
                        textStyle = TextStyle(fontFamily = FontFamily.SansSerif, color = TextPrimary, fontSize = 14.sp),
                        modifier = Modifier.weight(1f).background(ComponentBg, RoundedCornerShape(8.dp)).padding(12.dp),
                        cursorBrush = SolidColor(TextPrimary),
                        decorationBox = { inner ->
                            if (newWalletName.isEmpty()) Text("NEW WALLET", style = TextStyle(fontFamily = FontFamily.SansSerif, color = TextGray))
                            inner()
                        }
                    )
                    Button(
                        onClick = {
                            onAddWallet(newWalletName)
                            newWalletName = ""
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
                        enabled = newWalletName.isNotBlank()
                    ) {
                        Text("ADD")
                    }
                }
            }
        }
    }
}

