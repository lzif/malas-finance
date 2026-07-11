package com.example.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.MonthlySummary
import com.example.data.formatCurrency
import com.example.ui.theme.*
import java.util.Locale

private const val MAX_VISIBLE_MONTHS = 6

@Composable
fun MonthlySummarySection(summaries: List<MonthlySummary>) {
    if (summaries.isEmpty()) return
    val visible = summaries.take(MAX_VISIBLE_MONTHS)
    val hidden = summaries.size - visible.size

    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            "MONTHLY OVERVIEW",
            style = TextStyle(
                fontFamily = FontFamily.SansSerif,
                fontSize = 11.sp,
                fontWeight = FontWeight.ExtraBold,
                color = TextGray
            )
        )
        visible.forEach { summary ->
            MonthlySummaryCard(summary)
        }
        if (hidden > 0) {
            Text(
                "+ $hidden older month${if (hidden == 1) "" else "s"} (use Export for full history)",
                style = TextStyle(
                    fontFamily = FontFamily.SansSerif,
                    fontSize = 10.sp,
                    color = TextGray
                ),
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 2.dp)
            )
        }
    }
}

@Composable
private fun MonthlySummaryCard(summary: MonthlySummary) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = White,
        tonalElevation = 2.dp
    ) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    summary.label.uppercase(Locale.ROOT),
                    style = TextStyle(
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                )
                Spacer(Modifier.weight(1f))
                Text(
                    "${summary.entryCount} entr${if (summary.entryCount == 1) "y" else "ies"}",
                    style = TextStyle(
                        fontFamily = FontFamily.SansSerif,
                        fontSize = 10.sp,
                        color = TextGray
                    )
                )
            }

            Spacer(Modifier.height(6.dp))

            Row(modifier = Modifier.fillMaxWidth()) {
                MonthlyStatColumn(
                    label = "IN",
                    sign = "+",
                    amount = summary.totalIn,
                    color = VaultColor,
                    modifier = Modifier.weight(1f)
                )
                MonthlyStatColumn(
                    label = "OUT",
                    sign = "-",
                    amount = summary.totalOut,
                    color = CoreColor,
                    modifier = Modifier.weight(1f),
                    textAlignEnd = true
                )
                MonthlyStatColumn(
                    label = "NET",
                    sign = if (summary.netBalance < 0) "-" else "+",
                    amount = kotlin.math.abs(summary.netBalance),
                    color = if (summary.netBalance < 0) SoftRed else VaultColor,
                    modifier = Modifier.weight(1f),
                    textAlignEnd = true
                )
            }
        }
    }
}

@Composable
private fun MonthlyStatColumn(
    label: String,
    sign: String,
    amount: Long,
    color: Color,
    modifier: Modifier = Modifier,
    textAlignEnd: Boolean = false
) {
    val align = if (textAlignEnd) TextAlign.End else TextAlign.Start
    Column(modifier = modifier) {
        Text(
            label,
            style = TextStyle(
                fontFamily = FontFamily.SansSerif,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                color = TextGray,
                textAlign = align
            ),
            modifier = Modifier.fillMaxWidth()
        )
        Text(
            "$sign${formatCurrency(amount)}",
            style = TextStyle(
                fontFamily = FontFamily.Monospace,
                fontSize = 13.sp,
                fontWeight = FontWeight.Black,
                color = color,
                textAlign = align
            ),
            modifier = Modifier.fillMaxWidth()
        )
    }
}
