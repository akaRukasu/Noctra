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
        versionCode = 2
        versionName = "1.0.1"
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
        // L'écran de connexion est partagé avec les applis TV et iOS ; le pont
        // web du serveur est embarqué pour les serveurs Noctra plus anciens.
        getByName("main").assets.srcDir("../../shared")
        getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/noctra-bridge"))
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    buildFeatures {
        buildConfig = true
    }
}

val copyNoctraBridge by tasks.registering(Copy::class) {
    from(rootDir.resolve("../../public/noctra-app-bridge.js"))
    into(layout.buildDirectory.dir("generated/noctra-bridge/bridge"))
}
tasks.named("preBuild") { dependsOn(copyNoctraBridge) }

// Aucune dépendance : uniquement les classes du système Android, pour que l'APK
// puisse aussi être construit hors ligne (apps/scripts/build-android.mjs).
