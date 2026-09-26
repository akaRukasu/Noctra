plugins {
    id("com.android.application")
}

// Signature de publication : variables d'environnement (GitHub Actions) ou
// ~/.gradle/gradle.properties. Sans clé, l'APK est signé avec la clé de débogage.
fun secret(name: String): String? =
    (System.getenv(name) ?: project.findProperty(name) as String?)?.takeIf { it.isNotBlank() }

android {
    namespace = "com.noctra.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.noctra.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        create("release") {
            val store = secret("NOCTRA_KEYSTORE_FILE")
            if (store != null && file(store).exists()) {
                storeFile = file(store)
                storePassword = secret("NOCTRA_KEYSTORE_PASSWORD")
                keyAlias = secret("NOCTRA_KEY_ALIAS")
                keyPassword = secret("NOCTRA_KEY_PASSWORD") ?: secret("NOCTRA_KEYSTORE_PASSWORD")
            } else {
                initWith(getByName("debug"))
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    sourceSets {
        // L'écran de connexion est partagé avec les applis TV et iOS.
        getByName("main").assets.srcDir("../../shared")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    buildFeatures {
        buildConfig = true
    }
}

// Aucune dépendance : uniquement les classes du système Android, pour que l'APK
// puisse aussi être construit hors ligne (apps/scripts/build-android.mjs).
