package com.example.ui.theme

import androidx.compose.ui.graphics.Color

val SoftBackground = Color(0xFFE5D9E5) // Soft purplish background
val White = Color(0xFFFFFFFF)
val ComponentBg = Color(0xFFF4F5F7) // Light gray component background
val PrimaryBlue = Color(0xFF4285F4) // Blue button
val TextPrimary = Color(0xFF333333)
val TextSecondary = Color(0xFF888888)
val ProgressOrange = Color(0xFFFF8A00)
val ProgressYellow = Color(0xFFFFB800)
val ProgressRed = Color(0xFFFF5252)
val BadgePurple = Color(0xFFB18AFF)

// Finance Categories mapping for the soft theme
val CoreColor = ProgressRed
val OpsColor = PrimaryBlue
val HobbyColor = ProgressYellow
val VaultColor = ProgressOrange
val TextGray = TextSecondary
val TextWhite = TextPrimary // For dark text on light bg in most places, wait, let's keep it named TextWhite for minimal diff or change to TextPrimary
val DarkGray = ComponentBg // Inversion: DarkGray is now light gray component bg
val MediumGray = Color(0xFFE0E0E0)
val BorderGray = Color(0xFFE2E2E2)
val Black = TextPrimary // Used as main text

