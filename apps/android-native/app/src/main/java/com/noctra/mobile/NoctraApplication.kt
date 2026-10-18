package com.noctra.mobile

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import com.noctra.mobile.core.Net
import com.noctra.mobile.core.Prefs
import com.noctra.mobile.core.Session
import com.noctra.mobile.offline.OfflineStore

/** Noctra pour Android : réglages, session et cache d'images (affiches et fonds gardés, défilement fluide). */
class NoctraApplication : Application(), ImageLoaderFactory {
    override fun onCreate() {
        super.onCreate()
        instance = this
        Prefs.init(this)
        Session.init(this)
        OfflineStore.init(this)
    }

    override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
        .okHttpClient(Net.client)
        .memoryCache { MemoryCache.Builder(this).maxSizePercent(0.22).build() }
        .diskCache { DiskCache.Builder().directory(cacheDir.resolve("images")).maxSizeBytes(512L shl 20).build() }
        .crossfade(true)
        .respectCacheHeaders(false)
        .build()

    companion object {
        lateinit var instance: NoctraApplication
            private set
    }
}
