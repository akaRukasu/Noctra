cmake_minimum_required (VERSION 3.22)

project (NoctraDeRoom VERSION 1.0.0 LANGUAGES C CXX)

set (CMAKE_CXX_STANDARD 17)
set (CMAKE_CXX_STANDARD_REQUIRED ON)

# Les sources (textes de l'interface) sont en UTF-8.
if (MSVC)
    add_compile_options (/utf-8)
endif ()

if (APPLE)
    set (CMAKE_OSX_DEPLOYMENT_TARGET "10.13" CACHE STRING "")
    set (CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "")
endif ()

# JUCE : copie locale (-DJUCE_DIR=...) ou téléchargement automatique d'une version figée.
set (JUCE_DIR "" CACHE PATH "Dossier JUCE local (optionnel)")
if (JUCE_DIR)
    add_subdirectory ("${JUCE_DIR}" juce)
else ()
    include (FetchContent)
    FetchContent_Declare (JUCE
        GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
        GIT_TAG 8.0.4
        GIT_SHALLOW ON)
    FetchContent_MakeAvailable (JUCE)
endif ()

juce_add_plugin (NoctraDeRoom
    COMPANY_NAME "Noctra"
    BUNDLE_ID "com.noctra.deroom"
    PLUGIN_MANUFACTURER_CODE Noct
    PLUGIN_CODE NdRm
    FORMATS VST3 AU Standalone
    PRODUCT_NAME "Noctra DeRoom"
    DESCRIPTION "Suppression de la résonance de pièce pour la voix"
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    VST3_CATEGORIES Fx Restoration
    AU_MAIN_TYPE kAudioUnitType_Effect
    COPY_PLUGIN_AFTER_BUILD FALSE)

target_sources (NoctraDeRoom PRIVATE
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp)

target_include_directories (NoctraDeRoom PRIVATE Source)

target_compile_definitions (NoctraDeRoom PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_DISPLAY_SPLASH_SCREEN=0)

target_link_libraries (NoctraDeRoom
    PRIVATE
        juce::juce_audio_utils
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags)

# Banc d'essai du moteur (sans JUCE).
option (NOCTRA_BUILD_TESTS "Construire le banc d'essai du moteur" ON)
if (NOCTRA_BUILD_TESTS)
    enable_testing ()
    add_executable (deroom_engine_test tests/engine_test.cpp)
    target_include_directories (deroom_engine_test PRIVATE Source)
    if (NOT MSVC)
        target_compile_options (deroom_engine_test PRIVATE -O3)
    endif ()
    add_test (NAME deroom_engine_test COMMAND deroom_engine_test)
endif ()
