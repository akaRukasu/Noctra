// Noctra pour Android (téléphone, tablette, pliable, Chromebook, Android TV) :
// appli native Kotlin + Jetpack Compose, reprise de l'appli iOS 26 native.
// Construite par GitHub Actions (.github/workflows/noctra-android-native.yml).
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "NoctraAndroid"
include(":app")
