package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.example.ui.theme.*


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
