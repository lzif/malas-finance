package com.example.ui

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.BuildConfig
import com.example.data.Category
import com.example.data.Transaction
import com.example.data.TxType
import com.example.data.formatCurrency
import com.example.ui.theme.*

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
                    "MALAS_FINANCE_v${BuildConfig.VERSION_NAME}",
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

            // Category percentages — null when there's no OUT data so we don't divide by zero.
            // The DB stores "OPS" (Category.OPS); only the display label is "OPER".
            val outTxs = transactions.filter { it.type == TxType.OUT }
            val outTotal = outTxs.sumOf { it.amount }
            val hasOut = outTotal > 0L
            val corePct  = if (hasOut) (outTxs.filter { it.category == Category.CORE  }.sumOf { it.amount } * 100 / outTotal).toInt() else null
            val opsPct   = if (hasOut) (outTxs.filter { it.category == Category.OPS   }.sumOf { it.amount } * 100 / outTotal).toInt() else null
            val hobbyPct = if (hasOut) (outTxs.filter { it.category == Category.HOBBY }.sumOf { it.amount } * 100 / outTotal).toInt() else null
            val vaultPct = if (hasOut) (outTxs.filter { it.category == Category.VAULT }.sumOf { it.amount } * 100 / outTotal).toInt() else null

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                CategoryStatBox(Category.CORE, corePct, CoreColor)
                CategoryStatBox(Category.OPER, opsPct, OpsColor)
                CategoryStatBox(Category.HOBBY, hobbyPct, HobbyColor)
                CategoryStatBox(Category.VAULT, vaultPct, VaultColor)
            }
        }
    }
}

@Composable
fun CategoryStatBox(name: String, percentage: Int?, color: Color) {
    val pctText = percentage?.let { "$it%" } ?: "—"
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
                Text(pctText, style = TextStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 11.sp, color = TextPrimary))
            }
        }
    }
}
