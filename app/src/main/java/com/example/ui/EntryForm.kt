package com.example.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.Spring
import androidx.compose.ui.draw.scale
import com.example.data.Category
import com.example.data.Transaction
import com.example.data.TxType
import com.example.data.formatCurrency
import com.example.ui.theme.*
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import android.app.DatePickerDialog
import android.app.TimePickerDialog

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
                val catDisp = if (tx.category == Category.OPS) Category.OPER else tx.category
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
                val types = listOf(TxType.OUT to "EXPENSE", TxType.IN to "INCOME", TxType.TRANSFER to "TRANSFER")
                types.forEach { (typeKey, textLabel) ->
                    val isSelected = transactionType == typeKey
                    val color = if (isSelected) (if (typeKey == TxType.IN) VaultColor else if (typeKey == TxType.OUT) CoreColor else PrimaryBlue) else TextGray
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

        if (transactionType == TxType.TRANSFER) {
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
        if (transactionType != TxType.TRANSFER) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                // cat2 = display label (OPER), cat2Value = stored value (OPS). DB-preserving.
                val cat1 = if (transactionType == TxType.IN) Category.GAJI else Category.CORE
                val cat2 = if (transactionType == TxType.IN) Category.KEBUN else Category.OPER
                val cat2Value = if (transactionType == TxType.IN) Category.KEBUN else Category.OPS
                val cat3 = if (transactionType == TxType.IN) Category.BONUS else Category.HOBBY
                val cat4 = if (transactionType == TxType.IN) Category.LAINNYA else Category.VAULT

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

        // SAVE BUTTON — subtle scale-down on press for tactile feedback
        val saveInteractionSource = remember { MutableInteractionSource() }
        val isPressed by saveInteractionSource.collectIsPressedAsState()
        val saveScale by animateFloatAsState(
            targetValue = if (isPressed) 0.96f else 1f,
            animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessHigh),
            label = "saveButtonScale"
        )
        Button(
            onClick = onSave,
            modifier = Modifier
                .fillMaxWidth()
                .height(44.dp)
                .scale(saveScale)
                .testTag("save_button"),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (isPressed) PrimaryBlue.copy(alpha = 0.85f) else PrimaryBlue,
                contentColor = White
            ),
            shape = CircleShape,
            contentPadding = PaddingValues(0.dp),
            enabled = amountInput.isNotBlank(),
            interactionSource = saveInteractionSource
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
