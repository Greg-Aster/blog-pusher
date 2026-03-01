package com.gregaster.blogpusher

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ShareIntentModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ShareIntentModule"

  @ReactMethod
  fun consumeSharedFile(promise: Promise) {
    val payload = ShareIntentStore.consume()
    if (payload == null) {
      promise.resolve(null)
      return
    }

    val map = Arguments.createMap().apply {
      putString("uri", payload.uri)
      putString("text", payload.text)
      putString("mimeType", payload.mimeType)
      putString("name", payload.name)
    }

    promise.resolve(map)
  }
}
