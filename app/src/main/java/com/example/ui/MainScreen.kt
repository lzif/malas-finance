package com.example.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
        containerColor = Black,
        contentWindowInsets = WindowInsets.systemBars,
        bottomBar = {
            NavigationBar(
                containerColor = Black,
                contentColor = TextWhite,
                tonalElevation = 0.dp,
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
                    label = { Text("ENTRY", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp)) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = Black,
                        selectedTextColor = White,
                        indicatorColor = White,
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
                    label = { Text("LOGS", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp)) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = Black,
                        selectedTextColor = White,
                        indicatorColor = White,
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
            Text("QUICK LOGS", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextGray))
            HorizontalDivider(color = MediumGray, thickness = 1.dp, modifier = Modifier.padding(vertical = 8.dp))
            transactions.take(4).forEach { tx ->
                val dateFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
                val timeStr = dateFormat.format(Date(tx.timestamp))
                
                val displayCategory = if (tx.category == "OPS") "OPER" else tx.category
                val color = when (displayCategory) {
                    "CORE" -> CoreColor
                    "OPER" -> OpsColor
                    "HOBBY" -> HobbyColor
                    "VAULT" -> VaultColor
                    else -> White
                }
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(timeStr, style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp, color = TextGray), modifier = Modifier.width(48.dp))
                    Text(displayCategory, style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = color), modifier = Modifier.width(56.dp))
                    Text(tx.notes.ifBlank { "NO NOTES" }, style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp, color = TextWhite), modifier = Modifier.weight(1f), maxLines = 1)
                    Text(
                        text = formatCurrency(tx.amount),
                        style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = if (tx.type == "IN") color else TextWhite),
                        textAlign = TextAlign.End
                    )
                }
            }
        }
        
        MidSection(
            modifier = Modifier.fillMaxWidth(),
            amountInput = amountInput,
            onAmountChange = viewModel::onAmountChange,
            notesInput = notesInput,
            onNotesChange = viewModel::onNotesChange,
            selectedCategory = selectedCategory,
            onCategorySelect = viewModel::onCategorySelect,
            transactionType = transactionType,
            onTypeSelect = viewModel::onTypeSelect,
            onSave = viewModel::saveTransaction
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
    Column(
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "MALAS_FINANCE_v1.0.4",
                style = TextStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 10.sp, letterSpacing = 2.sp, color = TextGray)
            )
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = "History",
                    tint = TextWhite,
                    modifier = Modifier.size(20.dp).clickable { /* Keep structure */ }
                )
                Icon(
                    imageVector = Icons.Default.Share,
                    contentDescription = "Export",
                    tint = TextWhite,
                    modifier = Modifier.size(20.dp).clickable { exportToClipboard(context, transactions) }
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
                Text("INFLOW", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 9.sp, color = TextGray))
                Text("+${formatCurrency(inflow)}", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 14.sp, color = VaultColor))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text("OUTFLOW", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 9.sp, color = TextGray))
                Text("-${formatCurrency(outflow)}", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 14.sp, color = CoreColor))
            }
            Column(modifier = Modifier.weight(1f), horizontalAlignment = Alignment.End) {
                Text("BALANCE", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 9.sp, color = TextGray))
                Text(formatCurrency(balance), style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = White))
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

@Composable
fun CategoryStatBox(name: String, percentage: Int, color: Color) {
    Box(
        modifier = Modifier
            .background(color = Color.Transparent)
    ) {
        Row(modifier = Modifier.padding(start = 4.dp)) {
            Box(modifier = Modifier.width(2.dp).height(24.dp).background(color))
            Spacer(modifier = Modifier.width(4.dp))
            Column {
                Text(name, style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 8.sp, color = TextGray))
                Text("$percentage%", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp, color = TextWhite))
            }
        }
    }
}

@Composable
fun MidSection(
    modifier: Modifier = Modifier,
    amountInput: String,
    onAmountChange: (String) -> Unit,
    notesInput: String,
    onNotesChange: (String) -> Unit,
    selectedCategory: String,
    onCategorySelect: (String) -> Unit,
    transactionType: String,
    onTypeSelect: (String) -> Unit,
    onSave: () -> Unit
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("ENTER AMOUNT: ", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp, color = TextGray, letterSpacing = 2.sp))
                Text(
                    text = transactionType,
                    color = if (transactionType == "IN") VaultColor else CoreColor,
                    style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp),
                    modifier = Modifier.clickable { onTypeSelect(if (transactionType == "IN") "OUT" else "IN") }
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            BasicTextField(
                value = amountInput,
                onValueChange = onAmountChange,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                textStyle = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 48.sp, fontWeight = FontWeight.Light, color = White, textAlign = TextAlign.Center),
                modifier = Modifier.fillMaxWidth().testTag("amount_input"),
                cursorBrush = SolidColor(White),
                decorationBox = { innerTextField ->
                    if (amountInput.isEmpty()) {
                        Text("0", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 48.sp, fontWeight = FontWeight.Light, color = TextGray, textAlign = TextAlign.Center), modifier = Modifier.fillMaxWidth())
                    }
                    innerTextField()
                }
            )
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

        // Notes
        BasicTextField(
            value = notesInput,
            onValueChange = { onNotesChange(it.uppercase()) },
            singleLine = true,
            textStyle = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = White),
            modifier = Modifier.fillMaxWidth().background(DarkGray).padding(12.dp).testTag("notes_input"),
            cursorBrush = SolidColor(White),
            decorationBox = { innerTextField ->
                Box(modifier = Modifier.fillMaxWidth()) {
                    if (notesInput.isEmpty()) {
                        Text("NOTES: BENSIN MOTOR", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = BorderGray))
                    }
                    innerTextField()
                    Box(modifier = Modifier.matchParentSize().padding(top = 24.dp).background(BorderGray).height(1.dp) )
                }
            }
        )

        // SAVE BUTTON
        Button(
            onClick = onSave,
            modifier = Modifier.fillMaxWidth().height(56.dp).testTag("save_button"),
            colors = ButtonDefaults.buttonColors(containerColor = White, contentColor = Black),
            shape = RoundedCornerShape(4.dp),
            contentPadding = PaddingValues(0.dp),
            enabled = amountInput.isNotBlank()
        ) {
            Text("EXECUTE ENTER", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 18.sp, fontWeight = FontWeight.Black))
        }
    }
}

@Composable
fun CategoryGridButton(text: String, isSelected: Boolean, color: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(
        modifier = modifier
            .height(48.dp)
            .clickable(onClick = onClick),
        color = if (isSelected) MediumGray else Color.Transparent,
        border = BorderStroke(1.dp, if (isSelected) White else BorderGray),
        shape = RoundedCornerShape(4.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxSize(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(modifier = Modifier.size(8.dp).background(color, CircleShape))
            Spacer(modifier = Modifier.width(8.dp))
            Text(text, style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = if (isSelected) color else TextWhite))
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
            Text("RECENT_LOGS", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextGray))
            Text("LIFO_SORTED", style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 9.sp, color = BorderGray))
        }
        
        HorizontalDivider(color = MediumGray, thickness = 1.dp)

        LazyColumn(
            modifier = Modifier.fillMaxWidth(),
            contentPadding = PaddingValues(bottom = 16.dp)
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
                    else -> White
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
                        Box(
                            Modifier
                                .fillMaxSize()
                                .background(CoreColor)
                                .padding(end = 16.dp),
                            contentAlignment = Alignment.CenterEnd
                        ) {
                            Icon(imageVector = Icons.Default.Delete, contentDescription = "Delete", tint = Black)
                        }
                    },
                    enableDismissFromStartToEnd = false
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Black)
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(timeStr, style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp, color = TextGray), modifier = Modifier.width(48.dp))
                        Text(displayCategory, style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = color), modifier = Modifier.width(56.dp))
                        Text(tx.notes.ifBlank { "NO NOTES" }, style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp, color = TextWhite), modifier = Modifier.weight(1f))
                        Text(
                            text = formatCurrency(tx.amount),
                            style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = if (tx.type == "IN") color else TextWhite),
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = TextAlign.End
                        )
                    }
                }
                HorizontalDivider(color = DarkGray, thickness = 1.dp)
            }
        }
    }
}

fun formatCurrency(amount: Long): String {
    val formatter = NumberFormat.getNumberInstance(Locale("id", "ID"))
    return formatter.format(amount)
}

fun exportToClipboard(context: Context, transactions: List<Transaction>) {
    val builder = java.lang.StringBuilder()
    val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
    
    builder.append("ID|Date|Type|Category|Amount|Notes\n")
    transactions.forEach { tx ->
        val dateStr = dateFormat.format(Date(tx.timestamp))
        builder.append("${tx.id}|$dateStr|${tx.type}|${tx.category}|${tx.amount}|${tx.notes}\n")
    }

    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    val clip = ClipData.newPlainText("MalasFinance Export", builder.toString())
    clipboard.setPrimaryClip(clip)

    Toast.makeText(context, "Exported to Clipboard", Toast.LENGTH_SHORT).show()
}
