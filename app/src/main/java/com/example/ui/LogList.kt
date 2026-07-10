package com.example.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.List
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.BIG_DELETE_THRESHOLD
import com.example.data.Category
import com.example.data.Transaction
import com.example.data.TxType
import com.example.data.formatCurrency
import com.example.ui.theme.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

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
        val needsTypedConfirm = tx.amount >= BIG_DELETE_THRESHOLD
        val typedTarget = if (needsTypedConfirm) tx.amount.toString() else null
        val typedMessage = if (needsTypedConfirm) {
            "This permanently removes ${formatCurrency(tx.amount)} from trash.\n\nType the amount below to confirm."
        } else {
            "This permanently removes ${formatCurrency(tx.amount)} from trash."
        }
        ConfirmDialog(
            title = "Delete forever?",
            message = typedMessage,
            confirmText = "DELETE FOREVER",
            onConfirm = {
                onPermanentDelete(tx.id)
                pendingPermanentDelete = null
            },
            onDismiss = { pendingPermanentDelete = null },
            typedConfirmText = typedTarget
        )
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("LOG BOOK", style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = TextGray))
            // Trash toggle — styled as a chip for better visual affordance
            val trashCount = deletedTransactions.size
            val activeCount = transactions.size
            Surface(
                modifier = Modifier.clickable { showTrash = !showTrash },
                shape = CircleShape,
                color = if (showTrash) SoftRed.copy(alpha = 0.15f) else ComponentBg
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    if (showTrash) {
                        Icon(
                            imageVector = Icons.Default.Delete,
                            contentDescription = null,
                            tint = SoftRed,
                            modifier = Modifier.size(14.dp)
                        )
                    }
                    Text(
                        if (showTrash) "TRASH ($trashCount)" else "ACTIVE ($activeCount)",
                        style = TextStyle(
                            fontFamily = FontFamily.Monospace,
                            fontSize = 9.sp,
                            color = if (showTrash) SoftRed else TextGray,
                            fontWeight = FontWeight.Bold
                        )
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        val list = if (showTrash) deletedTransactions else transactions
        if (list.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxWidth().weight(1f, fill = false),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = if (showTrash) Icons.Default.Delete else Icons.Default.List,
                        contentDescription = null,
                        tint = TextGray.copy(alpha = 0.5f),
                        modifier = Modifier.size(32.dp)
                    )
                    Text(
                        if (showTrash) "Trash is empty" else "No transactions yet",
                        style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 13.sp, color = TextSecondary, fontWeight = FontWeight.Medium)
                    )
                    if (!showTrash) {
                        Text(
                            "Use the ENTRY tab to log your first transaction",
                            style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 11.sp, color = TextGray)
                        )
                    }
                }
            }
        } else {
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
    val displayCategory = if (tx.category == Category.OPS) Category.OPER else tx.category
    val color = when (displayCategory) {
        Category.CORE -> CoreColor
        Category.OPER -> OpsColor
        Category.HOBBY -> HobbyColor
        Category.VAULT -> VaultColor
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
                style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 14.sp, fontWeight = FontWeight.Black, color = if (tx.type == TxType.IN) VaultColor else TextPrimary),
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
