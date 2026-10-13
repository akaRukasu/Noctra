#include "PluginEditor.h"

namespace noctra::ui
{
using namespace juce;

//==============================================================================
LookAndFeel::LookAndFeel()
{
    setColour (ResizableWindow::backgroundColourId, colours::bg);
    setColour (Slider::textBoxTextColourId, colours::text);
    setColour (Slider::textBoxOutlineColourId, Colours::transparentBlack);
    setColour (Slider::textBoxBackgroundColourId, Colours::transparentBlack);
    setColour (Label::textColourId, colours::text);
    setColour (ComboBox::textColourId, colours::text);
    setColour (ComboBox::arrowColourId, colours::muted);
    setColour (PopupMenu::backgroundColourId, colours::surface2);
    setColour (PopupMenu::textColourId, colours::text);
    setColour (PopupMenu::highlightedBackgroundColourId, colours::accent.withAlpha (0.25f));
    setColour (PopupMenu::highlightedTextColourId, colours::text);
    setColour (TextButton::textColourOffId, colours::text);
    setColour (TextButton::textColourOnId, colours::text);
    setColour (ToggleButton::textColourId, colours::text);
    setColour (TooltipWindow::backgroundColourId, colours::surface2);
    setColour (TooltipWindow::textColourId, colours::text);
}

void LookAndFeel::drawRotarySlider (Graphics& g, int x, int y, int w, int h, float pos, float start, float end, Slider&)
{
    const auto bounds = Rectangle<float> ((float) x, (float) y, (float) w, (float) h).reduced (4.0f);
    const float radius = jmin (bounds.getWidth(), bounds.getHeight()) * 0.5f;
    const auto centre = bounds.getCentre();
    const float thickness = jmax (3.0f, radius * 0.12f);
    const float angle = start + pos * (end - start);

    g.setColour (colours::surface2);
    g.fillEllipse (Rectangle<float> (radius * 2, radius * 2).withCentre (centre).reduced (thickness * 1.6f));

    Path track;
    track.addCentredArc (centre.x, centre.y, radius - thickness, radius - thickness, 0.0f, start, end, true);
    g.setColour (colours::line);
    g.strokePath (track, PathStrokeType (thickness, PathStrokeType::curved, PathStrokeType::rounded));

    Path value;
    value.addCentredArc (centre.x, centre.y, radius - thickness, radius - thickness, 0.0f, start, angle, true);
    g.setGradientFill (ColourGradient (colours::accent, centre.x - radius, centre.y + radius,
                                       colours::violet, centre.x + radius, centre.y - radius, false));
    g.strokePath (value, PathStrokeType (thickness, PathStrokeType::curved, PathStrokeType::rounded));

    const float inner = radius - thickness * 2.6f;
    const Point<float> tip (centre.x + inner * std::sin (angle), centre.y - inner * std::cos (angle));
    const Point<float> base (centre.x + inner * 0.45f * std::sin (angle), centre.y - inner * 0.45f * std::cos (angle));
    g.setColour (colours::text);
    g.drawLine ({ base, tip }, jmax (2.0f, thickness * 0.55f));
}

void LookAndFeel::drawToggleButton (Graphics& g, ToggleButton& b, bool highlighted, bool)
{
    auto r = b.getLocalBounds().toFloat().reduced (1.0f);
    const bool on = b.getToggleState();
    g.setColour (on ? colours::accent.withAlpha (0.16f) : colours::surface2);
    g.fillRoundedRectangle (r, r.getHeight() * 0.5f);
    g.setColour (on ? colours::accent : (highlighted ? colours::muted : colours::line));
    g.drawRoundedRectangle (r, r.getHeight() * 0.5f, 1.2f);

    const float d = r.getHeight() * 0.36f;
    const auto dot = Rectangle<float> (d, d).withCentre ({ r.getX() + r.getHeight() * 0.5f, r.getCentreY() });
    g.setColour (on ? colours::accent : colours::muted.withAlpha (0.5f));
    g.fillEllipse (dot);

    g.setColour (on ? colours::text : colours::muted);
    g.setFont (FontOptions (13.0f));
    g.drawText (b.getButtonText(), r.withTrimmedLeft (r.getHeight()).withTrimmedRight (8.0f), Justification::centredLeft);
}

void LookAndFeel::drawButtonBackground (Graphics& g, Button& b, const Colour&, bool highlighted, bool down)
{
    auto r = b.getLocalBounds().toFloat().reduced (1.0f);
    g.setColour (down ? colours::violet.withAlpha (0.3f) : colours::surface2);
    g.fillRoundedRectangle (r, r.getHeight() * 0.5f);
    g.setColour (highlighted ? colours::violet : colours::line);
    g.drawRoundedRectangle (r, r.getHeight() * 0.5f, 1.2f);
}

void LookAndFeel::drawComboBox (Graphics& g, int w, int h, bool, int, int, int, int, ComboBox& box)
{
    auto r = Rectangle<float> ((float) w, (float) h).reduced (1.0f);
    g.setColour (colours::surface2);
    g.fillRoundedRectangle (r, 8.0f);
    g.setColour (box.hasKeyboardFocus (false) ? colours::accent : colours::line);
    g.drawRoundedRectangle (r, 8.0f, 1.2f);

    Path arrow;
    const float ax = r.getRight() - 16.0f, ay = r.getCentreY();
    arrow.addTriangle (ax - 4.0f, ay - 2.0f, ax + 4.0f, ay - 2.0f, ax, ay + 3.0f);
    g.setColour (colours::muted);
    g.fillPath (arrow);
}

//==============================================================================
RoomDisplay::RoomDisplay (NoctraDeRoomProcessor& p) : proc (p)
{
    reduction.fill (0.0f);
    room.fill (-60.0f);
    startTimerHz (30);
}

void RoomDisplay::timerCallback()
{
    for (int b = 0; b < NoctraDeRoomProcessor::displayBands; ++b)
    {
        reduction[(size_t) b] = proc.displayReductionDb[(size_t) b].load();
        room[(size_t) b] = proc.displayRoomDb[(size_t) b].load();
    }
    musicOn = proc.musicConnected.load();
    musicDb = proc.musicReductionDb.load();
    musicDelay = proc.musicDelayMs.load();
    latency = proc.latencyMs.load();
    repaint();
}

float RoomDisplay::xForHz (float hz) const
{
    const float lo = NoctraDeRoomProcessor::displayLoHz, hi = NoctraDeRoomProcessor::displayHiHz;
    return (float) getWidth() * std::log (hz / lo) / std::log (hi / lo);
}

void RoomDisplay::paint (Graphics& g)
{
    const auto r = getLocalBounds().toFloat();
    g.setColour (colours::surface);
    g.fillRoundedRectangle (r, 14.0f);

    const float top = 26.0f, bottom = r.getHeight() - 22.0f;
    const float mid = top + (bottom - top) * 0.42f; // ligne 0 dB de réduction

    // Grille en fréquence.
    g.setFont (FontOptions (11.0f));
    for (float hz : { 50.0f, 100.0f, 200.0f, 500.0f, 1000.0f, 2000.0f, 5000.0f, 10000.0f })
    {
        const float x = xForHz (hz);
        g.setColour (colours::line.withAlpha (0.7f));
        g.drawVerticalLine ((int) x, top, bottom);
        g.setColour (colours::muted);
        g.drawText (hz >= 1000.0f ? String (hz / 1000.0f, 0) + " k" : String ((int) hz), (int) x - 20, (int) bottom + 3, 40, 14,
                    Justification::centred);
    }
    g.setColour (colours::line);
    g.drawHorizontalLine ((int) mid, 0.0f, r.getWidth());

    const int n = NoctraDeRoomProcessor::displayBands;

    // Résonance de la pièce : rapport réverbe / voix directe appris (-30..+10 dB), au-dessus de la ligne.
    Path roomPath;
    roomPath.startNewSubPath (0.0f, mid);
    for (int b = 0; b < n; ++b)
    {
        const float x = xForHz (NoctraDeRoomProcessor::bandFrequency (b));
        const float v = jlimit (0.0f, 1.0f, (room[(size_t) b] + 30.0f) / 40.0f);
        roomPath.lineTo (x, mid - v * (mid - top));
    }
    roomPath.lineTo (r.getWidth(), mid);
    roomPath.closeSubPath();
    g.setGradientFill (ColourGradient (colours::amber.withAlpha (0.55f), 0.0f, top, colours::amber.withAlpha (0.05f), 0.0f, mid, false));
    g.fillPath (roomPath);

    // Réduction en cours (0..-24 dB), sous la ligne.
    Path redPath;
    for (int b = 0; b < n; ++b)
    {
        const float x = xForHz (NoctraDeRoomProcessor::bandFrequency (b));
        const float v = jlimit (0.0f, 1.0f, -reduction[(size_t) b] / 24.0f);
        const float y = mid + v * (bottom - mid);
        if (b == 0)
            redPath.startNewSubPath (x, y);
        else
            redPath.lineTo (x, y);
    }
    g.setColour (colours::accent);
    g.strokePath (redPath, PathStrokeType (2.0f, PathStrokeType::curved, PathStrokeType::rounded));

    g.setFont (FontOptions (12.0f));
    g.setColour (colours::amber);
    g.drawText (fr ("Résonance de la pièce (apprise)"), 14, 6, 230, 16, Justification::centredLeft);
    g.setColour (colours::accent);
    g.drawText (fr ("Réduction en cours"), 244, 6, 160, 16, Justification::centredLeft);

    // État : musique en sidechain et latence.
    String status = musicOn ? fr ("Musique : −") + String (jmax (0, roundToInt (musicDb))) + fr (" dB · trajet ")
                                  + String (roundToInt (musicDelay)) + " ms"
                            : fr ("Musique : sidechain non branché");
    status << fr ("   ·   Latence ") << String (latency, 1) << " ms";
    g.setColour (musicOn ? colours::violet : colours::muted);
    g.drawText (status, (int) r.getWidth() - 434, 6, 420, 16, Justification::centredRight);
}

//==============================================================================
Knob::Knob (AudioProcessorValueTreeState& state, const String& paramId, const String& text, const String& hint, bool big)
    : label (text), large (big)
{
    slider.setSliderStyle (Slider::RotaryHorizontalVerticalDrag);
    slider.setTextBoxStyle (Slider::TextBoxBelow, false, 90, 18);
    slider.setTooltip (hint);
    slider.setDoubleClickReturnValue (true, state.getParameterRange (paramId).convertFrom0to1 (state.getParameter (paramId)->getDefaultValue()));
    addAndMakeVisible (slider);
    attachment = std::make_unique<AudioProcessorValueTreeState::SliderAttachment> (state, paramId, slider);
}

void Knob::resized()
{
    slider.setBounds (getLocalBounds().withTrimmedTop (20));
}

void Knob::paint (Graphics& g)
{
    g.setColour (large ? colours::text : colours::muted);
    g.setFont (FontOptions (large ? 14.0f : 12.5f, Font::bold));
    g.drawText (label, getLocalBounds().removeFromTop (18), Justification::centred);
}
} // namespace noctra::ui

//==============================================================================
NoctraDeRoomEditor::NoctraDeRoomEditor (NoctraDeRoomProcessor& p)
    : AudioProcessorEditor (&p), proc (p), display (p),
      reduction (p.apvts, "reduction", fr ("RÉDUCTION"), fr ("Force du retrait de la réverbe et des résonances de la pièce."), true),
      resonance (p.apvts, "resonance", fr ("RÉSONANCES"), fr ("Priorité donnée aux modes de la pièce (ondes stationnaires, son « boîte »)."), true),
      protect (p.apvts, "voiceProtect", "PROTECTION VOIX", fr ("Laisse intactes les composantes où la voix directe domine."), true),
      music (p.apvts, "musicRemoval", "Anti-musique",
             fr ("Retire la musique des enceintes captée par le micro. Envoyez la musique sur l'entrée sidechain du plugin."), false),
      finish (p.apvts, "finish", "Finition radio",
              fr ("Finition studio / radio : coupe-bas, chaleur, air, de-esser, nivellement, compression, limiteur."), false),
      floorKnob (p.apvts, "floor", "Plancher", fr ("Atténuation maximale autorisée par bande."), false),
      mix (p.apvts, "mix", "Mix", fr ("Dosage entre l'original et le traité."), false),
      output (p.apvts, "output", "Sortie", fr ("Gain de sortie."), false)
{
    setLookAndFeel (&lnf);

    addAndMakeVisible (display);
    for (auto* k : { &reduction, &resonance, &protect, &music, &finish, &floorKnob, &mix, &output })
        addAndMakeVisible (*k);

    learn.setTooltip (fr ("Le profil de la pièce continue de s'adapter. Désactivez-le pour le figer une fois appris."));
    listen.setTooltip (fr ("Écoute uniquement ce que le plugin retire : il ne doit y avoir que de la pièce (et la musique), pas de voix."));
    lowLatency.setTooltip (fr ("Latence divisée par deux (~11 ms au lieu de ~21 ms à 48 kHz) pour le temps réel. Résolution un peu moindre dans le grave."));
    relearn.setTooltip (fr ("Oublie la pièce et le trajet enceintes → micro appris (après un changement de pièce ou de placement)."));
    mic.setTooltip (fr ("Réglage adapté au micro utilisé."));

    for (auto* b : { (juce::Component*) &learn, (juce::Component*) &listen, (juce::Component*) &lowLatency, (juce::Component*) &bypass,
                     (juce::Component*) &relearn, (juce::Component*) &mic })
        addAndMakeVisible (*b);

    mic.addItemList ({ fr ("Générique"), fr ("RØDE NT-USB (USB-B)") }, 1);

    learnAtt = std::make_unique<ButtonAttachment> (p.apvts, "learn", learn);
    listenAtt = std::make_unique<ButtonAttachment> (p.apvts, "listen", listen);
    lowLatencyAtt = std::make_unique<ButtonAttachment> (p.apvts, "lowLatency", lowLatency);
    bypassAtt = std::make_unique<ButtonAttachment> (p.apvts, "bypass", bypass);
    micAtt = std::make_unique<juce::AudioProcessorValueTreeState::ComboBoxAttachment> (p.apvts, "mic", mic);

    relearn.onClick = [this] { proc.requestRelearn(); };

    setSize (920, 540);
}

NoctraDeRoomEditor::~NoctraDeRoomEditor()
{
    setLookAndFeel (nullptr);
}

void NoctraDeRoomEditor::paint (juce::Graphics& g)
{
    using namespace noctra::ui;
    g.fillAll (colours::bg);

    auto header = getLocalBounds().removeFromTop (54).reduced (20, 0);
    g.setColour (colours::text);
    g.setFont (juce::FontOptions (22.0f, juce::Font::bold));
    g.drawText ("NOCTRA", header.removeFromLeft (110), juce::Justification::centredLeft);
    g.setColour (colours::accent);
    g.setFont (juce::FontOptions (22.0f));
    g.drawText ("DeRoom", header.removeFromLeft (100), juce::Justification::centredLeft);
    g.setColour (colours::muted);
    g.setFont (juce::FontOptions (12.0f));
    g.drawText (fr ("Pièce, musique et finition radio — voix intacte"), header.removeFromLeft (320), juce::Justification::centredLeft);

    g.setColour (colours::muted);
    g.drawText ("Micro", getWidth() - 310, 18, 50, 18, juce::Justification::centredRight);
}

void NoctraDeRoomEditor::resized()
{
    auto area = getLocalBounds().reduced (20, 0);
    auto header = area.removeFromTop (54);
    mic.setBounds (header.removeFromRight (230).withSizeKeepingCentre (230, 28));

    display.setBounds (area.removeFromTop (200));
    area.removeFromTop (12);

    auto bottom = area.removeFromBottom (50);
    auto controls = area;

    auto big = controls.removeFromLeft ((int) (controls.getWidth() * 0.48f));
    const int bw = big.getWidth() / 3;
    reduction.setBounds (big.removeFromLeft (bw).reduced (4));
    resonance.setBounds (big.removeFromLeft (bw).reduced (4));
    protect.setBounds (big.reduced (4));

    auto small = controls.reduced (4, 0);
    auto row1 = small.removeFromTop (small.getHeight() / 2);
    const int w1 = row1.getWidth() / 2;
    music.setBounds (row1.removeFromLeft (w1).reduced (8, 2));
    finish.setBounds (row1.reduced (8, 2));
    const int w2 = small.getWidth() / 3;
    floorKnob.setBounds (small.removeFromLeft (w2).reduced (4, 2));
    mix.setBounds (small.removeFromLeft (w2).reduced (4, 2));
    output.setBounds (small.reduced (4, 2));

    bottom = bottom.withSizeKeepingCentre (bottom.getWidth(), 30);
    learn.setBounds (bottom.removeFromLeft (150));
    bottom.removeFromLeft (8);
    listen.setBounds (bottom.removeFromLeft (175));
    bottom.removeFromLeft (8);
    lowLatency.setBounds (bottom.removeFromLeft (160));
    bottom.removeFromLeft (8);
    bypass.setBounds (bottom.removeFromLeft (100));
    relearn.setBounds (bottom.removeFromRight (140));
}
