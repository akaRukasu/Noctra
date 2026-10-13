#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include "DeRoomEngine.h"

#include <array>
#include <atomic>

/** Les chaînes du code sont en UTF-8 : juce::String les lit comme telles. */
inline juce::String fr (const char* text) { return juce::String::fromUTF8 (text); }

class NoctraDeRoomProcessor : public juce::AudioProcessor,
                              private juce::AudioProcessorValueTreeState::Listener,
                              private juce::AsyncUpdater
{
public:
    static constexpr int displayBands = 128;
    static constexpr float displayLoHz = 40.0f;
    static constexpr float displayHiHz = 16000.0f;

    NoctraDeRoomProcessor();
    ~NoctraDeRoomProcessor() override;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    void reset() override;

    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;

    using AudioProcessor::processBlock;
    using AudioProcessor::processBlockBypassed;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    void processBlockBypassed (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return JucePlugin_Name; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    juce::AudioProcessorParameter* getBypassParameter() const override { return bypassParam; }

    /** Demande (depuis l'interface) d'oublier le profil de pièce et le trajet enceintes → micro appris. */
    void requestRelearn() { relearnRequested.store (true); }

    juce::AudioProcessorValueTreeState apvts;

    // Courbes pour l'affichage (écrites par le thread audio, lues par l'interface).
    std::array<std::atomic<float>, displayBands> displayReductionDb {};
    std::array<std::atomic<float>, displayBands> displayRoomDb {};
    std::atomic<float> inputLevelDb { -100.0f };
    std::atomic<bool> musicConnected { false };   // une musique arrive sur le sidechain
    std::atomic<float> musicReductionDb { 0.0f };
    std::atomic<float> musicDelayMs { 0.0f };
    std::atomic<float> latencyMs { 0.0f };

    static float bandFrequency (int band);

private:
    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();

    void parameterChanged (const juce::String& parameterID, float newValue) override;
    void handleAsyncUpdate() override;
    void prepareEngine (bool lowLatency);

    void runEngine (juce::AudioBuffer<float>&, bool bypassed);
    void applyPendingProfile();
    void publishDisplay();
    noctra::DeRoomParams readParams (bool bypassed) const;

    noctra::DeRoomEngine engine;
    bool prepared = false;

    std::atomic<float>* pReduction = nullptr;
    std::atomic<float>* pResonance = nullptr;
    std::atomic<float>* pProtect = nullptr;
    std::atomic<float>* pFloor = nullptr;
    std::atomic<float>* pMix = nullptr;
    std::atomic<float>* pOutput = nullptr;
    std::atomic<float>* pLearn = nullptr;
    std::atomic<float>* pListen = nullptr;
    std::atomic<float>* pMic = nullptr;
    std::atomic<float>* pBypass = nullptr;
    std::atomic<float>* pMusic = nullptr;
    std::atomic<float>* pFinish = nullptr;
    std::atomic<float>* pLowLatency = nullptr;
    double currentSampleRate = 0.0;
    juce::AudioProcessorParameter* bypassParam = nullptr;

    std::atomic<bool> relearnRequested { false };

    // Profil appris : instantané pour la sauvegarde du projet, et profil en attente au chargement.
    juce::SpinLock profileLock;
    std::vector<float> savedRt, savedC;
    double savedFs = 0.0;
    std::vector<float> pendingRt, pendingC;
    double pendingFs = 0.0;
    std::atomic<bool> profilePending { false };
    int samplesSinceSnapshot = 0;
    int samplesSinceDisplay = 0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (NoctraDeRoomProcessor)
};
