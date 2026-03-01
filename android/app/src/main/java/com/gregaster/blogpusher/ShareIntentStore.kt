package com.gregaster.blogpusher

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns

data class SharedFilePayload(
  val uri: String = "",
  val text: String = "",
  val mimeType: String = "",
  val name: String = ""
)

object ShareIntentStore {
  @Volatile
  private var pendingSharedFile: SharedFilePayload? = null

  fun updateFromIntent(context: Context, intent: Intent?) {
    val payload = extractPayload(context, intent) ?: return
    synchronized(this) {
      pendingSharedFile = payload
    }
  }

  fun consume(): SharedFilePayload? {
    synchronized(this) {
      val payload = pendingSharedFile
      pendingSharedFile = null
      return payload
    }
  }

  private fun extractPayload(context: Context, intent: Intent?): SharedFilePayload? {
    if (intent == null) return null

    return when (intent.action) {
      Intent.ACTION_SEND -> extractSingle(context, intent)
      Intent.ACTION_SEND_MULTIPLE -> extractMultiple(context, intent)
      else -> null
    }
  }

  private fun extractSingle(context: Context, intent: Intent): SharedFilePayload? {
    val mimeType = intent.type ?: ""
    val streamUri = readParcelableUri(intent, Intent.EXTRA_STREAM)
    if (streamUri != null) {
      return buildUriPayload(context, streamUri, mimeType)
    }

    val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()
    if (!sharedText.isNullOrEmpty()) {
      return SharedFilePayload(
        text = sharedText,
        mimeType = mimeType.ifEmpty { "text/plain" },
        name = normalizeTextShareName(intent.getStringExtra(Intent.EXTRA_SUBJECT))
      )
    }

    return null
  }

  private fun extractMultiple(context: Context, intent: Intent): SharedFilePayload? {
    val mimeType = intent.type ?: ""
    val uris = readParcelableUriList(intent, Intent.EXTRA_STREAM)
    val firstUri = uris?.firstOrNull() ?: return null
    return buildUriPayload(context, firstUri, mimeType)
  }

  private fun buildUriPayload(
    context: Context,
    uri: Uri,
    mimeType: String
  ): SharedFilePayload {
    return SharedFilePayload(
      uri = uri.toString(),
      mimeType = mimeType,
      name = resolveDisplayName(context, uri)
    )
  }

  private fun resolveDisplayName(context: Context, uri: Uri): String {
    var name: String? = null
    context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
      val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
      if (nameIndex >= 0 && cursor.moveToFirst()) {
        name = cursor.getString(nameIndex)
      }
    }

    val fallback = uri.lastPathSegment
      ?.substringAfterLast('/')
      ?.substringAfterLast(':')
      ?.takeIf { it.isNotBlank() }
      ?: "shared-note.md"

    return name?.takeIf { it.isNotBlank() } ?: fallback
  }

  private fun normalizeTextShareName(subject: String?): String {
    val trimmed = subject?.trim().orEmpty()
    if (trimmed.isEmpty()) return "shared-note.md"
    return if (trimmed.contains('.')) trimmed else "$trimmed.md"
  }

  @Suppress("DEPRECATION")
  private fun readParcelableUri(intent: Intent, key: String): Uri? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(key, Uri::class.java)
    } else {
      intent.getParcelableExtra(key)
    }
  }

  @Suppress("DEPRECATION")
  private fun readParcelableUriList(intent: Intent, key: String): ArrayList<Uri>? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableArrayListExtra(key, Uri::class.java)
    } else {
      intent.getParcelableArrayListExtra(key)
    }
  }
}
