#include "PluginEditor.h"
#include "PluginProcessor.h"

static void configKnob (juce::Slider& s)
{
    s.setSliderStyle (juce::Slider::RotaryHorizontalVerticalDrag);
    s.setTextBoxStyle (juce::Slider::TextBoxBelow, false, 70, 18);
}

IRBlenderAudioProcessorEditor::IRBlenderAudioProcessorEditor (IRBlenderAudioProcessor& p)
    : AudioProcessorEditor (&p), processor (p)
{
    setSize (780, 420);

    // Buttons
    addAndMakeVisible (loadA);
    addAndMakeVisible (loadB);
    loadA.onClick = [this]{ chooseAndLoad (true); };
    loadB.onClick = [this]{ chooseAndLoad (false); };

    // Sliders
    for (auto* s : { &aGain, &aHP, &aLP, &aRes, &aOff,
                     &bGain, &bHP, &bLP, &bRes, &bOff,
                     &blend, &outGain })
        { addAndMakeVisible (*s); configKnob (*s); }

    addAndMakeVisible (aFlip);
    addAndMakeVisible (bFlip);

    auto& apvts = processor.apvts;
    aGainA  = std::make_unique<Att> (apvts, "aGain", aGain);
    aHPA    = std::make_unique<Att> (apvts, "aHP",   aHP);
    aLPA    = std::make_unique<Att> (apvts, "aLP",   aLP);
    aResA   = std::make_unique<Att> (apvts, "aRes",  aRes);
    aOffA   = std::make_unique<Att> (apvts, "aOff",  aOff);
    aFlipA  = std::make_unique<AttB>(apvts, "aFlip", aFlip);

    bGainA  = std::make_unique<Att> (apvts, "bGain", bGain);
    bHPA    = std::make_unique<Att> (apvts, "bHP",   bHP);
    bLPA    = std::make_unique<Att> (apvts, "bLP",   bLP);
    bResA   = std::make_unique<Att> (apvts, "bRes",  bRes);
    bOffA   = std::make_unique<Att> (apvts, "bOff",  bOff);
    bFlipA  = std::make_unique<AttB>(apvts, "bFlip", bFlip);

    blendA    = std::make_unique<Att> (apvts, "blend",   blend);
    outGainA  = std::make_unique<Att> (apvts, "outGain", outGain);
}

void IRBlenderAudioProcessorEditor::paint (juce::Graphics& g)
{
    g.fillAll (juce::Colour::fromRGB (15, 19, 26));
    g.setColour (juce::Colours::white.withAlpha (0.1f));
    g.fillRoundedRectangle (getLocalBounds().toFloat().reduced (8), 12.0f);
    g.setColour (juce::Colours::white);
    g.setFont (18.0f);
    g.drawFittedText ("IR Blender", 12, 8, 200, 24, juce::Justification::left, 1);
}

void IRBlenderAudioProcessorEditor::resized()
{
    auto area = getLocalBounds().reduced (14);
    auto top = area.removeFromTop (30);
    loadA.setBounds (top.removeFromLeft (120));
    top.removeFromLeft (10);
    loadB.setBounds (top.removeFromLeft (120));

    // Layout knobs in 3 rows
    auto row = area.removeFromTop (150);
    layoutKnob (aGain, row, "A Gain");   layoutKnob (aHP, row, "A HP");    layoutKnob (aLP, row, "A LP");
    layoutKnob (aRes, row, "A Res");     layoutKnob (aOff, row, "A Off");  aFlip.setBounds (row.removeFromLeft (120).reduced (10));

    row = area.removeFromTop (150);
    layoutKnob (bGain, row, "B Gain");   layoutKnob (bHP, row, "B HP");    layoutKnob (bLP, row, "B LP");
    layoutKnob (bRes, row, "B Res");     layoutKnob (bOff, row, "B Off");  bFlip.setBounds (row.removeFromLeft (120).reduced (10));

    row = area;
    layoutKnob (blend, row, "Blend B%");
    layoutKnob (outGain, row, "Out Gain");
}

void IRBlenderAudioProcessorEditor::layoutKnob (juce::Slider& s, juce::Rectangle<int>& area, const juce::String& name)
{
    auto cell = area.removeFromLeft (120).reduced (8);
    s.setBounds (cell);
    s.setName (name);
}

void IRBlenderAudioProcessorEditor::chooseAndLoad (bool isA)
{
    juce::FileChooser fc ("Select IR file", {}, "*.wav;*.aif;*.aiff;*.mp3");
    if (fc.browseForFileToOpen())
        processor.loadIR (isA, fc.getResult());
}

void IRBlenderAudioProcessorEditor::filesDropped (const juce::StringArray& files, int, int)
{
    if (files.isEmpty()) return;
    // Load first file to A, second to B if present
    processor.loadIR (true, juce::File (files[0]));
    if (files.size() > 1)
        processor.loadIR (false, juce::File (files[1]));
}
