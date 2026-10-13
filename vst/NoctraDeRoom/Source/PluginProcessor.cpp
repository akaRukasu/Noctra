#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace ids
{
static const juce::String reduction = "reduction";
static const juce::String resonance = "resonance";
static const juce::String protect = "voiceProtect";
static const juce::String floorDb = "floor";
static const juce::String mix = "mix";
static const juce::String output = "output";
static const juce::String learn = "learn";
static const juce::String listen = "listen";
static const juce::String mic = "mic";
static const juce::String bypass = "bypass";
static const juce::String music = "musicRemoval";
static const juce::String finish = "finish";
static const juce::String lowLatency = "lowLatency";
} // namespace ids

//==============================================================================
NoctraDeRoomProcessor::NoctraDeRoomProcessor()
    : AudioProcessor (BusesProperties()
                          .withInput (fr ("Entrée"), juce::AudioChannelSet::stereo(), true)
                          .withOutput ("Sortie", juce::AudioChannelSet::stereo(), true)
                          .withInput ("Musique (sidechain)", juce::AudioChannelSet::stereo(), true)),
      apvts (*this, nullptr, "NoctraDeRoom", createLayout())
{
    pReduction = apvts.getRawParameterValue (ids::reduction);
    pResonance = apvts.getRawParameterValue (ids::resonance);
    pProtect = apvts.getRawParameterValue (ids::protect);
    pFloor = apvts.getRawParameterValue (ids::floorDb);
    pMix = apvts.getRawParameterValue (ids::mix);
    pOutput = apvts.getRawParameterValue (ids::output);
    pLearn = apvts.getRawParameterValue (ids::learn);
    pListen = apvts.getRawParameterValue (ids::listen);
    pMic = apvts.getRawParameterValue (ids::mic);
    pBypass = apvts.getRawParameterValue (ids::bypass);
    pMusic = apvts.getRawParameterValue (ids::music);
    pFinish = apvts.getRawParameterValue (ids::finish);
    pLowLatency = apvts.getRawParameterValue (ids::lowLatency);
    bypassParam = apvts.getParameter (ids::bypass);

    for (auto& v : displayReductionDb)
        v.store (0.0f);
    for (auto& v : displayRoomDb)
        v.store (-60.0f);

    apvts.addParameterListener (ids::lowLatency, this);
}

NoctraDeRoomProcessor::~NoctraDeRoomProcessor()
{
    apvts.removeParameterListener (ids::lowLatency, this);
    cancelPendingUpdate();
}

juce::AudioProcessorValueTreeState::ParameterLayout NoctraDeRoomProcessor::createLayout()
{
    using namespace juce;
    AudioProcessorValueTreeState::ParameterLayout layout;

    auto percent = AudioParameterFloatAttributes().withLabel ("%").withStringFromValueFunction (
        [] (float v, int) { return String (juce::roundToInt (v)) + " %"; });
    auto decibels = AudioParameterFloatAttributes().withLabel ("dB").withStringFromValueFunction (
        [] (float v, int) { return String (v, 1) + " dB"; });

    auto pct = [&] (const String& id, const char* name, float def) {
        return std::make_unique<AudioParameterFloat> (ParameterID { id, 1 }, fr (name), NormalisableRange<float> (0.0f, 100.0f, 0.1f), def, percent);
    };

    layout.add (pct (ids::reduction, "Réduction", 70.0f));
    layout.add (pct (ids::resonance, "Résonances", 60.0f));
    layout.add (pct (ids::protect, "Protection voix", 60.0f));
    layout.add (std::make_unique<AudioParameterFloat> (ParameterID { ids::floorDb, 1 }, "Plancher",
                                                       NormalisableRange<float> (-40.0f, 0.0f, 0.1f), -18.0f, decibels));
    layout.add (pct (ids::music, "Anti-musique", 80.0f));
    layout.add (pct (ids::finish, "Finition radio", 60.0f));
    layout.add (pct (ids::mix, "Mix", 100.0f));
    layout.add (std::make_unique<AudioParameterFloat> (ParameterID { ids::output, 1 }, "Sortie",
                                                       NormalisableRange<float> (-12.0f, 12.0f, 0.1f), 0.0f, decibels));
    layout.add (std::make_unique<AudioParameterBool> (ParameterID { ids::learn, 1 }, "Apprentissage", true));
    layout.add (std::make_unique<AudioParameterBool> (ParameterID { ids::listen, 1 }, fr ("Écouter le retiré"), false));
    layout.add (std::make_unique<AudioParameterChoice> (ParameterID { ids::mic, 1 }, "Micro",
                                                        StringArray { fr ("Générique"), fr ("RØDE NT-USB (USB-B)") }, 1));
    layout.add (std::make_unique<AudioParameterBool> (ParameterID { ids::lowLatency, 1 }, "Faible latence", false,
                                                      AudioParameterBoolAttributes().withAutomatable (false)));
    layout.add (std::make_unique<AudioParameterBool> (ParameterID { ids::bypass, 1 }, "Bypass", false));
    return layout;
}

//==============================================================================
bool NoctraDeRoomProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto out = layouts.getMainOutputChannelSet();
    if (out != juce::AudioChannelSet::mono() && out != juce::AudioChannelSet::stereo())
        return false;
    if (layouts.getMainInputChannelSet() != out)
        return false;

    if (layouts.inputBuses.size() > 1)
    {
        const auto sc = layouts.getChannelSet (true, 1);
        if (! sc.isDisabled() && sc != juce::AudioChannelSet::mono() && sc != juce::AudioChannelSet::stereo())
            return false;
    }
    return true;
}

void NoctraDeRoomProcessor::prepareEngine (bool lowLatency)
{
    // Garde le profil de pièce appris d'une préparation à l'autre.
    std::vector<float> rt, c;
    double fsOld = 0.0;
    if (prepared)
    {
        engine.getProfile (rt, c);
        fsOld = engine.getSampleRate();
    }

    engine.setParams (readParams (false));
    engine.prepare (currentSampleRate, 2, lowLatency);
    if (rt.size() >= 2)
        engine.setProfile (rt.data(), c.data(), (int) rt.size(), fsOld);

    setLatencySamples (engine.getLatencySamples());
    latencyMs.store ((float) (1000.0 * engine.getLatencySamples() / currentSampleRate));

    const juce::SpinLock::ScopedLockType lock (profileLock);
    // Réserve la place de l'instantané : aucune allocation ensuite dans le thread audio.
    savedRt.assign ((size_t) engine.getNumBins(), 0.0f);
    savedC.assign ((size_t) engine.getNumBins(), 0.0f);
    engine.getProfile (savedRt, savedC);
    savedFs = currentSampleRate;
}

void NoctraDeRoomProcessor::prepareToPlay (double sampleRate, int)
{
    currentSampleRate = sampleRate;
    prepareEngine (pLowLatency->load() > 0.5f);
    prepared = true;
    applyPendingProfile();
}

void NoctraDeRoomProcessor::parameterChanged (const juce::String& parameterID, float)
{
    if (parameterID == ids::lowLatency)
        triggerAsyncUpdate();
}

void NoctraDeRoomProcessor::handleAsyncUpdate()
{
    const bool wanted = pLowLatency->load() > 0.5f;
    if (! prepared || wanted == engine.isLowLatency())
        return;

    // Changement de taille de FFT : traitement suspendu le temps de réallouer (hors thread audio).
    suspendProcessing (true);
    prepareEngine (wanted);
    suspendProcessing (false);
}

void NoctraDeRoomProcessor::reset()
{
    if (prepared)
        engine.resetStreaming();
}

noctra::DeRoomParams NoctraDeRoomProcessor::readParams (bool bypassed) const
{
    noctra::DeRoomParams p;
    p.reduction = pReduction->load() * 0.01f;
    p.resonance = pResonance->load() * 0.01f;
    p.voiceProtect = pProtect->load() * 0.01f;
    p.floorDb = pFloor->load();
    p.mix = pMix->load() * 0.01f;
    p.outputDb = pOutput->load();
    p.learn = pLearn->load() > 0.5f;
    p.listenRemoved = pListen->load() > 0.5f;
    p.mic = pMic->load() > 0.5f ? noctra::MicProfile::rodeNtUsb : noctra::MicProfile::generic;
    p.bypass = bypassed || pBypass->load() > 0.5f;
    p.musicRemoval = pMusic->load() * 0.01f;
    p.finish = pFinish->load() * 0.01f;
    return p;
}

void NoctraDeRoomProcessor::applyPendingProfile()
{
    if (! prepared || ! profilePending.load())
        return;

    const juce::SpinLock::ScopedTryLockType lock (profileLock);
    if (! lock.isLocked())
        return; // on réessaiera au bloc suivant

    if (pendingRt.size() >= 2 && pendingRt.size() == pendingC.size())
        engine.setProfile (pendingRt.data(), pendingC.data(), (int) pendingRt.size(), pendingFs);
    profilePending.store (false);
}

void NoctraDeRoomProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    runEngine (buffer, false);
}

void NoctraDeRoomProcessor::processBlockBypassed (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    // L'original reste retardé de la latence annoncée : pas de décalage au bypass.
    runEngine (buffer, true);
}

void NoctraDeRoomProcessor::runEngine (juce::AudioBuffer<float>& buffer, bool bypassed)
{
    juce::ScopedNoDenormals noDenormals;

    auto mainIn = getBusBuffer (buffer, true, 0);
    const int numSamples = buffer.getNumSamples();

    // Canaux de sortie sans entrée correspondante (au-delà du bus principal) : silence.
    for (int ch = mainIn.getNumChannels(); ch < getMainBusNumOutputChannels(); ++ch)
        buffer.clear (ch, 0, numSamples);

    if (! prepared)
        return;

    if (relearnRequested.exchange (false))
    {
        engine.resetLearning();
        engine.resetMusicPath();
    }
    applyPendingProfile();

    // Musique envoyée aux enceintes (sidechain), si l'hôte la fournit.
    const float* refs[2] = { nullptr, nullptr };
    int numRefs = 0;
    if (getBusCount (true) > 1)
        if (auto* bus = getBus (true, 1); bus != nullptr && bus->isEnabled())
        {
            auto sc = getBusBuffer (buffer, true, 1);
            numRefs = juce::jmin (2, sc.getNumChannels());
            for (int r = 0; r < numRefs; ++r)
                refs[r] = sc.getReadPointer (r); // silence : le moteur le détecte et ne calcule rien
        }

    const int numCh = juce::jmin (2, mainIn.getNumChannels());
    if (numCh > 0)
    {
        inputLevelDb.store (juce::Decibels::gainToDecibels (mainIn.getMagnitude (0, numSamples), -100.0f));
        engine.setParams (readParams (bypassed));
        engine.process (mainIn.getArrayOfWritePointers(), numCh, numRefs > 0 ? refs : nullptr, numRefs, numSamples);
    }

    // Instantané du profil pour la sauvegarde (~2 fois par seconde, sans jamais bloquer).
    samplesSinceSnapshot += numSamples;
    if (samplesSinceSnapshot > (int) (0.5 * getSampleRate()))
    {
        const juce::SpinLock::ScopedTryLockType lock (profileLock);
        if (lock.isLocked() && savedRt.size() == (size_t) engine.getNumBins())
        {
            engine.getProfile (savedRt, savedC);
            savedFs = engine.getSampleRate();
            samplesSinceSnapshot = 0;
        }
    }

    samplesSinceDisplay += numSamples;
    if (samplesSinceDisplay > (int) (getSampleRate() / 60.0))
    {
        samplesSinceDisplay = 0;
        publishDisplay();
    }
}

float NoctraDeRoomProcessor::bandFrequency (int band)
{
    return displayLoHz * std::pow (displayHiHz / displayLoHz, (float) band / (float) (displayBands - 1));
}

void NoctraDeRoomProcessor::publishDisplay()
{
    const float* g = engine.getGainDisplay();
    const float* q = engine.getRoomDisplay();
    const double hzPerBin = engine.getSampleRate() / engine.getFftSize();
    const int last = engine.getNumBins() - 1;

    for (int b = 0; b < displayBands; ++b)
    {
        const double x = bandFrequency (b) / hzPerBin;
        const int k0 = juce::jlimit (0, last - 1, (int) x);
        const float t = (float) juce::jlimit (0.0, 1.0, x - k0);
        const float gain = g[k0] + t * (g[k0 + 1] - g[k0]);
        const float room = q[k0] + t * (q[k0 + 1] - q[k0]);
        displayReductionDb[(size_t) b].store (juce::Decibels::gainToDecibels (gain, -60.0f));
        displayRoomDb[(size_t) b].store (room);
    }

    musicConnected.store (engine.isMusicActive());
    musicReductionDb.store (engine.getMusicReductionDb());
    musicDelayMs.store (engine.getMusicDelayMs());
}

//==============================================================================
void NoctraDeRoomProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    std::unique_ptr<juce::XmlElement> xml (state.createXml());

    {
        const juce::SpinLock::ScopedLockType lock (profileLock);
        if (savedRt.size() >= 2 && savedRt.size() == savedC.size())
        {
            auto* prof = xml->createNewChildElement ("RoomProfile");
            prof->setAttribute ("sampleRate", savedFs);
            prof->setAttribute ("bins", (int) savedRt.size());
            juce::MemoryBlock mb;
            mb.append (savedRt.data(), savedRt.size() * sizeof (float));
            mb.append (savedC.data(), savedC.size() * sizeof (float));
            prof->setAttribute ("data", mb.toBase64Encoding());
        }
    }

    copyXmlToBinary (*xml, destData);
}

void NoctraDeRoomProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    std::unique_ptr<juce::XmlElement> xml (getXmlFromBinary (data, sizeInBytes));
    if (xml == nullptr || ! xml->hasTagName (apvts.state.getType()))
        return;

    if (auto* prof = xml->getChildByName ("RoomProfile"))
    {
        const int bins = prof->getIntAttribute ("bins");
        const double fs = prof->getDoubleAttribute ("sampleRate");
        juce::MemoryBlock mb;
        if (bins >= 2 && fs > 0.0 && mb.fromBase64Encoding (prof->getStringAttribute ("data"))
            && mb.getSize() == (size_t) bins * 2 * sizeof (float))
        {
            const juce::SpinLock::ScopedLockType lock (profileLock);
            const auto* f = static_cast<const float*> (mb.getData());
            pendingRt.assign (f, f + bins);
            pendingC.assign (f + bins, f + 2 * bins);
            pendingFs = fs;
            profilePending.store (true);
        }
        xml->removeChildElement (prof, true);
    }

    apvts.replaceState (juce::ValueTree::fromXml (*xml));
}

//==============================================================================
juce::AudioProcessorEditor* NoctraDeRoomProcessor::createEditor()
{
    return new NoctraDeRoomEditor (*this);
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new NoctraDeRoomProcessor();
}
