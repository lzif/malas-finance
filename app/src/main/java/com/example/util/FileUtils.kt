package com.example.util

import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import java.io.IOException

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
    if (uri == null) {
        Toast.makeText(context, "Failed to save file", Toast.LENGTH_SHORT).show()
        return
    }
    val wrote = try {
        resolver.openOutputStream(uri)?.use { stream ->
            stream.write(text.toByteArray())
            true
        } ?: false
    } catch (e: Exception) {
        false
    }

    if (wrote) {
        Toast.makeText(context, "Saved to Downloads", Toast.LENGTH_SHORT).show()
    } else {
        Toast.makeText(context, "Failed to save file", Toast.LENGTH_SHORT).show()
        // Best-effort cleanup of the partial/empty entry so the user isn't
        // left with a broken file in Downloads.
        try {
            resolver.delete(uri, null, null)
        } catch (_: Exception) {
            // Ignore cleanup failures; the original error was already reported.
        }
    }
}
