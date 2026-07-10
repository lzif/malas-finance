package com.example.ui

import android.content.Context
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.example.data.Transaction
import com.example.data.TxType
import com.example.data.formatCurrency
import com.example.data.generateBackupJson
import com.example.data.generateMarkdown
import com.example.data.parseBackupJson
import com.example.ui.theme.*
import com.example.util.copyToClipboard
import com.example.util.saveToFile
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun ConfirmDialog(
    title: String,
    message: String,
    confirmText: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    typedConfirmText: String? = null
) {
    var typedInput by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                Text(message)
                if (typedConfirmText != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = ComponentBg,
                        shape = RoundedCornerShape(20.dp)
                    ) {
                        BasicTextField(
                            value = typedInput,
                            onValueChange = { typedInput = it },
                            singleLine = true,
                            textStyle = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 14.sp, color = TextPrimary),
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                            cursorBrush = SolidColor(TextPrimary),
                            decorationBox = { inner ->
                                if (typedInput.isEmpty()) Text(
                                    "Type: $typedConfirmText",
                                    style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = TextGray)
                                )
                                inner()
                            }
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                enabled = typedConfirmText == null || typedInput == typedConfirmText
            ) { Text(confirmText, color = SoftRed) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("CANCEL") }
        }
    )
}

@Composable
fun ExportDialog(transactions: List<Transaction>, onDismiss: () -> Unit, context: Context, onImport: (List<Transaction>) -> Unit) {
    var selectedRange by remember { mutableStateOf("Current Month") }
    var pendingImport by remember { mutableStateOf<List<Transaction>?>(null) }
    val ranges = listOf("This Week", "Current Month", "All Time")
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            val imported = context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { parseBackupJson(it.readText()) }.orEmpty()
            if (imported.isNotEmpty()) {
                pendingImport = imported
            } else {
                Toast.makeText(context, "No valid entries — backup may be corrupt", Toast.LENGTH_SHORT).show()
            }
        }
    }

    val previewList = pendingImport
    if (previewList != null) {
        ImportPreviewDialog(
            transactions = previewList,
            onConfirm = {
                onImport(previewList)
                Toast.makeText(context, "Imported ${previewList.size} entries", Toast.LENGTH_SHORT).show()
                pendingImport = null
                onDismiss()
            },
            onCancel = { pendingImport = null }
        )
        return
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
fun ImportPreviewDialog(
    transactions: List<Transaction>,
    onConfirm: () -> Unit,
    onCancel: () -> Unit
) {
    val count = transactions.size
    val minTs = transactions.minOf { it.timestamp }
    val maxTs = transactions.maxOf { it.timestamp }
    val totalIn = transactions.filter { it.type == TxType.IN }.sumOf { it.amount }
    val totalOut = transactions.filter { it.type == TxType.OUT }.sumOf { it.amount }
    val balance = totalIn - totalOut
    val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT)

    Dialog(onDismissRequest = onCancel) {
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = MediumGray,
            modifier = Modifier.padding(16.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    "IMPORT PREVIEW",
                    style = TextStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, color = White)
                )
                HorizontalDivider(color = BorderGray)

                PreviewStatRow("$count", "ENTRIES")

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("EARLIEST", style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextGray))
                        Text(dateFormat.format(Date(minTs)), style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = White))
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text("LATEST", style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TextGray))
                        Text(dateFormat.format(Date(maxTs)), style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = White))
                    }
                }

                HorizontalDivider(color = BorderGray)

                PreviewStatRow(formatCurrency(totalIn), "TOTAL IN", VaultColor)
                PreviewStatRow(formatCurrency(totalOut), "TOTAL OUT", CoreColor)
                PreviewStatRow(formatCurrency(balance), "NET BALANCE", TextPrimary)

                HorizontalDivider(color = BorderGray)

                Text(
                    "This will append $count entries to your log. No duplicates will be detected \u2014 double-importing the same backup WILL duplicate your data.",
                    style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 11.sp, color = TextSecondary)
                )

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = onCancel,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = DarkGray, contentColor = Black)
                    ) {
                        Text("CANCEL", style = TextStyle(fontFamily = FontFamily.Monospace, color = Black))
                    }
                    Button(
                        onClick = onConfirm,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue, contentColor = White)
                    ) {
                        Text("IMPORT $count", style = TextStyle(fontFamily = FontFamily.Monospace, color = White))
                    }
                }
            }
        }
    }
}

@Composable
private fun PreviewStatRow(value: String, label: String, accent: Color = White) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, style = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = TextGray))
        Text(
            value,
            style = TextStyle(
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Black,
                fontSize = 14.sp,
                color = accent
            )
        )
    }
}
