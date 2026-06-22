package com.example.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
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
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import com.example.ui.theme.*
import java.text.NumberFormat
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
                LogsScreen(viewModel)
            }
        }
    }
}

@Composable
fun EntryScreen(viewModel: MainViewModel) {
    val transactions by viewModel.transactions.collectAsStateWithLifecycle()
    val amountInput by viewModel.amountInput.collectAsStateWithLifecycle()
    val notesInput by viewModel.notesInput.collectAsStateWithLifecycle()
    val selectedCategory by viewModel.selectedCategory.collectAsStateWithLifecycle()
    val transactionType by viewModel.transactionType.collectAsStateWithLifecycle()
    val frequentLogs by viewModel.frequentLogs.collectAsStateWithLifecycle()
    val subcategories by viewModel.subcategories.collectAsStateWithLifecycle()

    val subcategoryInput by viewModel.subcategoryInput.collectAsStateWithLifecycle()

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
            .padding(16.dp)
    ) {
        HeaderSection(totalInflow, totalOutflow, balance, transactions, context)
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Column(modifier = Modifier.weight(1f).fillMaxWidth()) {
            Text("QUICK LOGS", style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = TextGray))
            Spacer(modifier = Modifier.height(8.dp))
            LazyColumn(modifier = Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(transactions) { tx ->
                    val dateFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
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
                        shape = RoundedCornerShape(16.dp),
                        color = White,
                        tonalElevation = 2.dp,
                        modifier = Modifier.fillMaxWidth()
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
        
        MidSection(
            modifier = Modifier.fillMaxWidth(),
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
            onSave = viewModel::saveTransaction,
            frequentLogs = frequentLogs,
            subcategories = subcategories,
            onAppendZeros = viewModel::appendZeros,
            onApplyFrequent = viewModel::applyFrequent
        )
    }
}

@Composable
fun LogsScreen(viewModel: MainViewModel) {
    val transactions by viewModel.transactions.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        BottomSection(
            transactions = transactions,
            onDelete = viewModel::deleteTransaction
        )
    }
}

@Composable
fun HeaderSection(inflow: Long, outflow: Long, balance: Long, transactions: List<Transaction>, context: Context) {
    var showExportDialog by remember { mutableStateOf(false) }

    if (showExportDialog) {
        ExportDialog(
            transactions = transactions,
            onDismiss = { showExportDialog = false },
            context = context
        )
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = White,
        tonalElevation = 4.dp
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(20.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "MALAS_FINANCE_v1.1.1",
                    style = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp, letterSpacing = 1.sp, color = TextGray)
                )
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = "History",
                        tint = TextPrimary,
                        modifier = Modifier.size(20.dp).clickable { /* Keep structure */ }
                    )
                    Icon(
                        imageVector = Icons.Default.Share,
                        contentDescription = "Export",
                        tint = TextPrimary,
                        modifier = Modifier.size(20.dp).clickable { showExportDialog = true }
                    )
                }
            }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp),
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
        Spacer(modifier = Modifier.height(16.dp))

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
    onSave: () -> Unit,
    frequentLogs: List<Transaction>,
    subcategories: List<String>,
    onAppendZeros: () -> Unit,
    onApplyFrequent: (Long, String, String, String) -> Unit
) {
    var isAddingSubcat by remember { mutableStateOf(false) }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Quick Action Chips
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
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
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("AMOUNT: ", style = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 10.sp, color = TextGray, letterSpacing = 2.sp))
                val typeText = if (transactionType == "IN") "INCOME" else "EXPENSE"
                Text(
                    text = typeText,
                    color = if (transactionType == "IN") VaultColor else CoreColor,
                    style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.sp),
                    modifier = Modifier.clickable { onTypeSelect(if (transactionType == "IN") "OUT" else "IN") }
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val formattedAmount = amountInput.toLongOrNull()?.let { formatCurrency(it).replace("IDR ", "") } ?: ""
                BasicTextField(
                    value = formattedAmount,
                    onValueChange = { newVal ->
                        val plainDigits = newVal.replace(".", "").replace(",", "")
                        onAmountChange(plainDigits)
                    },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    textStyle = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 48.sp, fontWeight = FontWeight.Black, color = TextPrimary, textAlign = TextAlign.Center),
                    modifier = Modifier.weight(1f).testTag("amount_input"),
                    cursorBrush = SolidColor(TextPrimary),
                    decorationBox = { innerTextField ->
                        if (amountInput.isEmpty()) {
                            Text("0", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 48.sp, fontWeight = FontWeight.Black, color = MediumGray, textAlign = TextAlign.Center), modifier = Modifier.fillMaxWidth())
                        }
                        innerTextField()
                    }
                )
                
                Surface(
                    modifier = Modifier.clickable { onAppendZeros() },
                    shape = RoundedCornerShape(16.dp),
                    color = ComponentBg
                ) {
                    Text(
                        text = "000",
                        style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 24.sp, color = TextPrimary, fontWeight = FontWeight.Bold),
                        modifier = Modifier.padding(16.dp)
                    )
                }
            }
        }

        // Categories Grid (2x2)
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CategoryGridButton("CORE", selectedCategory == "CORE", CoreColor, modifier = Modifier.weight(1f)) { onCategorySelect("CORE") }
                CategoryGridButton("OPER", selectedCategory == "OPS", OpsColor, modifier = Modifier.weight(1f)) { onCategorySelect("OPS") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CategoryGridButton("HOBBY", selectedCategory == "HOBBY", HobbyColor, modifier = Modifier.weight(1f)) { onCategorySelect("HOBBY") }
                CategoryGridButton("VAULT", selectedCategory == "VAULT", VaultColor, modifier = Modifier.weight(1f)) { onCategorySelect("VAULT") }
            }
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
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
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

        // Notes (Optional)
        BasicTextField(
            value = notesInput ?: "",
            onValueChange = onNotesChange,
            singleLine = true,
            textStyle = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 12.sp, color = TextPrimary),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp).testTag("notes_input"),
            cursorBrush = SolidColor(TextPrimary),
            decorationBox = { innerTextField ->
                Box(contentAlignment = Alignment.BottomStart) {
                    if (notesInput.isNullOrEmpty()) {
                        Text("Notes (Optional)", style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 12.sp, color = TextGray))
                    }
                    innerTextField()
                    Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(MediumGray))
                }
            }
        )

        // SAVE BUTTON
        Button(
            onClick = onSave,
            modifier = Modifier.fillMaxWidth().height(56.dp).testTag("save_button"),
            colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue, contentColor = White),
            shape = RoundedCornerShape(16.dp),
            contentPadding = PaddingValues(0.dp),
            enabled = amountInput.isNotBlank()
        ) {
            Text("SUBMIT", style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold))
        }
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
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
        )
    }
}

@Composable
fun CategoryGridButton(text: String, isSelected: Boolean, color: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(
        modifier = modifier
            .height(56.dp)
            .clickable(onClick = onClick),
        color = if (isSelected) White else ComponentBg,
        border = BorderStroke(if (isSelected) 2.dp else 1.dp, if (isSelected) color else color.copy(alpha = 0.2f)),
        shape = RoundedCornerShape(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxSize(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(modifier = Modifier.size(24.dp), shape = CircleShape, color = color.copy(alpha = 0.1f)) {
                Box(modifier = Modifier.fillMaxSize().padding(6.dp).background(color, CircleShape))
            }
            Spacer(modifier = Modifier.width(8.dp))
            Text(text, style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = if (isSelected) TextPrimary else TextGray))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BottomSection(transactions: List<Transaction>, onDelete: (Int) -> Unit) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("LOG BOOK", style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = TextGray))
            Text("LIFO_SORTED", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 9.sp, color = TextGray))
        }
        
        Spacer(modifier = Modifier.height(8.dp))

        LazyColumn(
            modifier = Modifier.fillMaxWidth(),
            contentPadding = PaddingValues(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(transactions, key = { it.id }) { tx ->
                val dateFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
                val timeStr = dateFormat.format(Date(tx.timestamp))
                
                val displayCategory = if (tx.category == "OPS") "OPER" else tx.category
                val color = when (displayCategory) {
                    "CORE" -> CoreColor
                    "OPER" -> OpsColor
                    "HOBBY" -> HobbyColor
                    "VAULT" -> VaultColor
                    else -> TextPrimary
                }

                SwipeToDismissBox(
                    state = rememberSwipeToDismissBoxState(
                        confirmValueChange = {
                            if (it == SwipeToDismissBoxValue.EndToStart) {
                                onDelete(tx.id)
                                true
                            } else false
                        }
                    ),
                    backgroundContent = {
                        Surface(
                            modifier = Modifier.fillMaxSize(),
                            shape = RoundedCornerShape(16.dp),
                            color = ProgressRed
                        ) {
                            Box(
                                modifier = Modifier.fillMaxSize().padding(end = 16.dp),
                                contentAlignment = Alignment.CenterEnd
                            ) {
                                Icon(imageVector = Icons.Default.Delete, contentDescription = "Delete", tint = White)
                            }
                        }
                    },
                    enableDismissFromStartToEnd = false
                ) {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
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
                        }
                    }
                }
            }
        }
    }
}

fun formatCurrency(amount: Long): String {
    val formatter = NumberFormat.getNumberInstance(Locale("id", "ID"))
    return formatter.format(amount)
}

@Composable
fun ExportDialog(transactions: List<Transaction>, onDismiss: () -> Unit, context: Context) {
    var selectedRange by remember { mutableStateOf("Current Month") }
    val ranges = listOf("This Week", "Current Month", "All Time")

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
                                Text(range, style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp, color = if (selectedRange == range) Black else TextGray))
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
                        colors = ButtonDefaults.buttonColors(containerColor = DarkGray)
                    ) {
                        Text("Copy to Clipboard", style = TextStyle(fontFamily = FontFamily.Monospace, color = White))
                    }
                    Button(
                        onClick = {
                            val md = generateMarkdown(transactions, selectedRange)
                            saveToFile(context, md, "MalasFinance_Export.md", "text/markdown")
                            onDismiss()
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = DarkGray)
                    ) {
                        Text("Save as Markdown (.md)", style = TextStyle(fontFamily = FontFamily.Monospace, color = White))
                    }
                    Button(
                        onClick = {
                            val md = generateMarkdown(transactions, selectedRange)
                            saveToFile(context, md, "MalasFinance_Export.txt", "text/plain")
                            onDismiss()
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = DarkGray)
                    ) {
                        Text("Save as Text (.txt)", style = TextStyle(fontFamily = FontFamily.Monospace, color = White))
                    }
                }
            }
        }
    }
}

fun copyToClipboard(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    val clip = ClipData.newPlainText("MalasFinance Export", text)
    clipboard.setPrimaryClip(clip)
    Toast.makeText(context, "Exported to Clipboard", Toast.LENGTH_SHORT).show()
}

fun saveToFile(context: Context, text: String, filename: String, mimeType: String) {
    val resolver = context.contentResolver
    val contentValues = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
        put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
    }

    val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
    if (uri != null) {
        resolver.openOutputStream(uri)?.use { outputStream ->
            outputStream.write(text.toByteArray())
        }
        Toast.makeText(context, "Saved to Downloads", Toast.LENGTH_SHORT).show()
    } else {
        Toast.makeText(context, "Failed to save file", Toast.LENGTH_SHORT).show()
    }
}

fun generateMarkdown(transactions: List<Transaction>, range: String): String {
    val filtered = filterByRange(transactions, range)
    val totalIn = filtered.filter { it.type == "IN" }.sumOf { it.amount }
    val totalOut = filtered.filter { it.type == "OUT" }.sumOf { it.amount }
    val balance = totalIn - totalOut

    val outCore = filtered.filter { it.type == "OUT" && it.category == "CORE" }.sumOf { it.amount }
    val outOper = filtered.filter { it.type == "OUT" && (it.category == "OPER" || it.category == "OPS") }.sumOf { it.amount }
    val outHobby = filtered.filter { it.type == "OUT" && it.category == "HOBBY" }.sumOf { it.amount }
    val outVault = filtered.filter { it.type == "OUT" && it.category == "VAULT" }.sumOf { it.amount }

    val builder = StringBuilder()
    builder.appendLine("# SUMMARY ($range)")
    builder.appendLine("- Current Balance: $balance")
    builder.appendLine("- Total IN: $totalIn")
    builder.appendLine("- Total OUT: $totalOut")
    builder.appendLine()
    builder.appendLine("## OUT BY CATEGORY")
    builder.appendLine("- CORE: $outCore")
    builder.appendLine("- OPERASIONAL: $outOper")
    builder.appendLine("- HOBBY: $outHobby")
    builder.appendLine("- VAULT: $outVault")
    builder.appendLine()
    builder.appendLine("## LEDGER LOG")
    builder.appendLine("| Date | Type (IN/OUT) | Category | Subcategory | Amount |")
    builder.appendLine("|---|---|---|---|---|")

    val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
    filtered.forEach { tx ->
        val dStr = dateFormat.format(Date(tx.timestamp))
        val dispCat = if (tx.category == "OPS") "OPERASIONAL" else tx.category
        val combinedNotes = if (!tx.notes.isNullOrBlank()) "${tx.subcategory} (${tx.notes})" else tx.subcategory
        val subcat = combinedNotes.ifBlank { "-" }
        builder.appendLine("| $dStr | ${tx.type} | $dispCat | $subcat | ${tx.amount} |")
    }

    return builder.toString()
}

fun filterByRange(transactions: List<Transaction>, range: String): List<Transaction> {
    if (range == "All Time") return transactions
    val now = Calendar.getInstance()
    return transactions.filter { tx ->
        val cal = Calendar.getInstance().apply { timeInMillis = tx.timestamp }
        when (range) {
            "This Week" -> cal.get(Calendar.WEEK_OF_YEAR) == now.get(Calendar.WEEK_OF_YEAR) && cal.get(Calendar.YEAR) == now.get(Calendar.YEAR)
            "Current Month" -> cal.get(Calendar.MONTH) == now.get(Calendar.MONTH) && cal.get(Calendar.YEAR) == now.get(Calendar.YEAR)
            else -> true
        }
    }
}

