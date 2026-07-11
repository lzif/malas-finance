package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.data.BIG_DELETE_THRESHOLD
import com.example.data.Goal
import com.example.data.computeGoalProgress
import com.example.data.formatCurrency
import com.example.ui.theme.*

private const val QUICK_STEP = 50_000L

@Composable
fun GoalsScreen(viewModel: MainViewModel) {
    val activeGoals by viewModel.activeGoals.collectAsStateWithLifecycle()
    val deletedGoals by viewModel.deletedGoals.collectAsStateWithLifecycle()
    var showTrash by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Goal?>(null) }
    var creating by remember { mutableStateOf(false) }
    var pendingSoftDelete by remember { mutableStateOf<Goal?>(null) }
    var pendingPermanentDelete by remember { mutableStateOf<Goal?>(null) }

    // Soft-delete confirmation (active goal → trash)
    pendingSoftDelete?.let { g ->
        ConfirmDialog(
            title = "Archive goal?",
            message = "Move '${g.name}' to trash. You can restore it later.",
            confirmText = "ARCHIVE",
            onConfirm = {
                viewModel.softDeleteGoal(g.id)
                pendingSoftDelete = null
            },
            onDismiss = { pendingSoftDelete = null }
        )
    }

    // Permanent delete confirmation with typed-confirm at-or-above BIG_DELETE_THRESHOLD
    pendingPermanentDelete?.let { g ->
        val needsTypedConfirm = g.targetAmount >= BIG_DELETE_THRESHOLD
        val typedTarget = if (needsTypedConfirm) g.targetAmount.toString() else null
        val typedMessage = if (needsTypedConfirm) {
            "This permanently removes '${g.name}' (target ${formatCurrency(g.targetAmount)}) from trash.\n\nType the target amount below to confirm."
        } else {
            "This permanently removes '${g.name}' from trash."
        }
        ConfirmDialog(
            title = "Delete goal forever?",
            message = typedMessage,
            confirmText = "DELETE FOREVER",
            onConfirm = {
                viewModel.deleteGoal(g.id)
                pendingPermanentDelete = null
            },
            onDismiss = { pendingPermanentDelete = null },
            typedConfirmText = typedTarget
        )
    }

    if (creating) {
        EditGoalDialog(
            initial = null,
            onSave = { name, target, current ->
                viewModel.addGoal(name, target, current)
                creating = false
            },
            onDismiss = { creating = false }
        )
    }
    editing?.let { g ->
        EditGoalDialog(
            initial = g,
            onSave = { name, target, current ->
                viewModel.updateGoal(g.copy(name = name, targetAmount = target, currentAmount = current))
                editing = null
            },
            onDismiss = { editing = null }
        )
    }

    val list = if (showTrash) deletedGoals else activeGoals

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "GOALS",
                style = TextStyle(
                    fontFamily = FontFamily.SansSerif,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = TextGray
                )
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val trashCount = deletedGoals.size
                val activeCount = activeGoals.size
                Surface(
                    modifier = Modifier.clickable { showTrash = !showTrash },
                    shape = CircleShape,
                    color = if (showTrash) SoftRed.copy(alpha = 0.15f) else ComponentBg
                ) {
                    Text(
                        if (showTrash) "TRASH ($trashCount)" else "ACTIVE ($activeCount)",
                        style = TextStyle(
                            fontFamily = FontFamily.Monospace,
                            fontSize = 9.sp,
                            color = if (showTrash) SoftRed else TextGray,
                            fontWeight = FontWeight.Bold
                        ),
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                    )
                }
                Surface(
                    modifier = Modifier.clickable { creating = true }.size(32.dp),
                    shape = CircleShape,
                    color = PrimaryBlue
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = "Add Goal",
                            tint = White,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

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
                        imageVector = if (showTrash) Icons.Default.Delete else Icons.Default.Add,
                        contentDescription = null,
                        tint = TextGray.copy(alpha = 0.5f),
                        modifier = Modifier.size(32.dp)
                    )
                    Text(
                        if (showTrash) "Trash is empty" else "No goals yet",
                        style = TextStyle(
                            fontFamily = FontFamily.SansSerif,
                            fontSize = 13.sp,
                            color = TextSecondary,
                            fontWeight = FontWeight.Medium
                        )
                    )
                    if (!showTrash) {
                        Text(
                            "Tap + to set a savings target",
                            style = TextStyle(
                                fontFamily = FontFamily.SansSerif,
                                fontSize = 11.sp,
                                color = TextGray
                            )
                        )
                    }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(bottom = 16.dp)
            ) {
                items(list, key = { it.id }) { goal ->
                    GoalCard(
                        goal = goal,
                        isTrash = showTrash,
                        onIncrement = { viewModel.incrementGoal(goal.id, QUICK_STEP) },
                        onDecrement = { viewModel.decrementGoal(goal.id, QUICK_STEP) },
                        // In active mode, onEdit opens the editor; in trash
                        // mode, the same tap is restore (single-affordance).
                        onEdit = { if (showTrash) viewModel.restoreGoal(goal.id) else editing = goal },
                        onDelete = {
                            if (showTrash) pendingPermanentDelete = goal
                            else pendingSoftDelete = goal
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun GoalCard(
    goal: Goal,
    isTrash: Boolean,
    onIncrement: () -> Unit,
    onDecrement: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    val progress = computeGoalProgress(goal.currentAmount, goal.targetAmount)
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = White,
        tonalElevation = 2.dp
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    goal.name,
                    style = TextStyle(
                        fontFamily = FontFamily.SansSerif,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    ),
                    modifier = Modifier.weight(1f),
                    maxLines = 1
                )
                Text(
                    "${progress.percent}%",
                    style = TextStyle(
                        fontFamily = FontFamily.Monospace,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Black,
                        color = if (progress.isCompleted) VaultColor else PrimaryBlue
                    )
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Custom progress bar keeps the visual tone consistent with the
            // rest of the Compose UI (rounded pill, ComponentBg background).
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .background(ComponentBg, RoundedCornerShape(50))
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(fraction = (progress.percent / 100f).coerceIn(0f, 1f))
                        .background(
                            if (progress.isCompleted) VaultColor else PrimaryBlue,
                            RoundedCornerShape(50)
                        )
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(
                        "SAVED",
                        style = TextStyle(
                            fontFamily = FontFamily.SansSerif,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextGray
                        )
                    )
                    Text(
                        formatCurrency(goal.currentAmount),
                        style = TextStyle(
                            fontFamily = FontFamily.Monospace,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Black,
                            color = TextPrimary
                        )
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        "TARGET",
                        style = TextStyle(
                            fontFamily = FontFamily.SansSerif,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextGray,
                            textAlign = TextAlign.End
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text(
                        formatCurrency(goal.targetAmount),
                        style = TextStyle(
                            fontFamily = FontFamily.Monospace,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Black,
                            color = TextPrimary,
                            textAlign = TextAlign.End
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }

            if (!isTrash) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    QuickStepChip(label = "-50k", onClick = onDecrement)
                    QuickStepChip(label = "+50k", onClick = onIncrement)
                    Spacer(modifier = Modifier.weight(1f))
                    Icon(
                        imageVector = Icons.Default.Edit,
                        contentDescription = "Edit",
                        tint = PrimaryBlue,
                        modifier = Modifier
                            .size(20.dp)
                            .clickable(onClick = onEdit)
                            .padding(2.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = "Archive",
                        tint = SoftRed,
                        modifier = Modifier
                            .size(20.dp)
                            .clickable(onClick = onDelete)
                            .padding(2.dp)
                    )
                }
            } else {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        "RESTORE",
                        color = VaultColor,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.clickable(onClick = onEdit).padding(6.dp)
                    )
                    Text(
                        "DELETE FOREVER",
                        color = SoftRed,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.clickable(onClick = onDelete).padding(6.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun QuickStepChip(label: String, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.clickable(onClick = onClick),
        shape = CircleShape,
        color = ComponentBg
    ) {
        Text(
            label,
            style = TextStyle(
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = TextPrimary
            ),
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
        )
    }
}

@Composable
private fun EditGoalDialog(
    initial: Goal?,
    onSave: (String, Long, Long) -> Unit,
    onDismiss: () -> Unit
) {
    var name by remember { mutableStateOf(initial?.name ?: "") }
    var targetText by remember { mutableStateOf((initial?.targetAmount ?: 1_000_000L).toString()) }
    var currentText by remember { mutableStateOf((initial?.currentAmount ?: 0L).toString()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                if (initial == null) "NEW GOAL" else "EDIT GOAL",
                style = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                LabeledField(label = "NAME", value = name, onChange = { name = it })
                LabeledNumericField(label = "TARGET", value = targetText, onChange = { targetText = it.filter { c -> c.isDigit() } })
                LabeledNumericField(label = "SAVED SO FAR", value = currentText, onChange = { currentText = it.filter { c -> c.isDigit() } })
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val target = targetText.toLongOrNull() ?: 0L
                    val current = currentText.toLongOrNull() ?: 0L
                    onSave(name, target, current)
                },
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue, contentColor = White),
                enabled = name.isNotBlank() && (targetText.toLongOrNull() ?: 0L) > 0L
            ) { Text("SAVE", style = TextStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)) }
        },
        dismissButton = {
            OutlinedButton(onClick = onDismiss) { Text("CANCEL") }
        }
    )
}

@Composable
private fun LabeledField(label: String, value: String, onChange: (String) -> Unit) {
    Column {
        Text(
            label,
            style = TextStyle(
                fontFamily = FontFamily.SansSerif,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                color = TextGray
            )
        )
        Surface(color = ComponentBg, shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth()) {
            BasicTextField(
                value = value,
                onValueChange = onChange,
                singleLine = true,
                textStyle = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 14.sp, color = TextPrimary),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                cursorBrush = SolidColor(TextPrimary)
            )
        }
    }
}

@Composable
private fun LabeledNumericField(label: String, value: String, onChange: (String) -> Unit) {
    Column {
        Text(
            label,
            style = TextStyle(
                fontFamily = FontFamily.SansSerif,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                color = TextGray
            )
        )
        Surface(color = ComponentBg, shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth()) {
            BasicTextField(
                value = value,
                onValueChange = onChange,
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                textStyle = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = TextPrimary),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                cursorBrush = SolidColor(TextPrimary)
            )
        }
    }
}
