#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include "PluginProcessor.h"

namespace noctra::ui
{
namespace colours
{
const juce::Colour bg { 0xff090a0f };
const juce::Colour surface { 0xff12141c };
const juce::Colour surface2 { 0xff191c26 };
const juce::Colour line { 0xff262a36 };
const juce::Colour text { 0xfff2f6f4 };
const juce::Colour muted { 0xff95a19d };
const juce::Colour accent { 0xff70d9c2 };
const juce::Colour violet { 0xffaa91e8 };
const juce::Colour amber { 0xffe7b96e };
} // namespace colours

class LookAndFeel : public juce::LookAndFeel_V4
{
public:
    LookAndFeel();
    void drawRotarySlider (juce::Graphics&, int x, int y, int w, int h, float pos, float start, float end, juce::Slider&) override;
    void drawToggleButton (juce::Graphics&, juce::ToggleButton&, bool highlighted, bool down) override;
    void drawButtonBackground (juce::Graphics&, juce::Button&, const juce::Colour&, bool highlighted, bool down) override;
    void drawComboBox (juce::Graphics&, int w, int h, bool down, int bx, int by, int bw, int bh, juce::ComboBox&) override;
};

/** Courbes : résonance de la pièce apprise (remplie) et réduction appliquée en direct (trait). */
class RoomDisplay : public juce::Component, private juce::Timer
{
public:
    explicit RoomDisplay (NoctraDeRoomProcessor&);
    void paint (juce::Graphics&) override;

private:
    void timerCallback() override;
    float xForHz (float hz) const;

    NoctraDeRoomProcessor& proc;
    std::array<float, NoctraDeRoomProcessor::displayBands> reduction {}, room {};
    bool musicOn = false;
    float musicDb = 0.0f, musicDelay = 0.0f, latency = 0.0f;
};

class Knob : public juce::Component
{
public:
    Knob (juce::AudioProcessorValueTreeState&, const juce::String& paramId, const juce::String& label,
          const juce::String& hint, bool large);
    void resized() override;
    void paint (juce::Graphics&) override;

    juce::Slider slider;

private:
    juce::String label;
    bool large;
    std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> attachment;
};
} // namespace noctra::ui

class NoctraDeRoomEditor : public juce::AudioProcessorEditor
{
public:
    explicit NoctraDeRoomEditor (NoctraDeRoomProcessor&);
    ~NoctraDeRoomEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    NoctraDeRoomProcessor& proc;
    noctra::ui::LookAndFeel lnf;

    noctra::ui::RoomDisplay display;
    noctra::ui::Knob reduction, resonance, protect, music, finish, floorKnob, mix, output;

    juce::ToggleButton learn { "Apprentissage" }, listen { fr ("Écouter le retiré") }, lowLatency { "Faible latence" },
        bypass { "Bypass" };
    juce::TextButton relearn { fr ("Réapprendre") };
    juce::ComboBox mic;

    using ButtonAttachment = juce::AudioProcessorValueTreeState::ButtonAttachment;
    std::unique_ptr<ButtonAttachment> learnAtt, listenAtt, lowLatencyAtt, bypassAtt;
    std::unique_ptr<juce::AudioProcessorValueTreeState::ComboBoxAttachment> micAtt;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (NoctraDeRoomEditor)
};
