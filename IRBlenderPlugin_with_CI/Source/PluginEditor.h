#pragma once
#include <JuceHeader.h>

class IRBlenderAudioProcessor;

class IRBlenderAudioProcessorEditor : public juce::AudioProcessorEditor,
                                      public juce::FileDragAndDropTarget
{
public:
    IRBlenderAudioProcessorEditor (IRBlenderAudioProcessor&);
    ~IRBlenderAudioProcessorEditor() override = default;

    void paint (juce::Graphics&) override;
    void resized() override;

    bool isInterestedInFileDrag (const juce::StringArray& files) override { return true; }
    void filesDropped (const juce::StringArray& files, int, int) override;

private:
    IRBlenderAudioProcessor& processor;

    // Controls
    juce::TextButton loadA { "Load IR A" }, loadB { "Load IR B" };

    juce::Slider aGain, aHP, aLP, aRes, aOff;
    juce::ToggleButton aFlip { "A Polarity" };

    juce::Slider bGain, bHP, bLP, bRes, bOff;
    juce::ToggleButton bFlip { "B Polarity" };

    juce::Slider blend, outGain;

    using Att = juce::AudioProcessorValueTreeState::SliderAttachment;
    using AttB = juce::AudioProcessorValueTreeState::ButtonAttachment;
    std::unique_ptr<Att> aGainA, aHPA, aLPA, aResA, aOffA;
    std::unique_ptr<AttB> aFlipA;
    std::unique_ptr<Att> bGainA, bHPA, bLPA, bResA, bOffA;
    std::unique_ptr<AttB> bFlipA;
    std::unique_ptr<Att> blendA, outGainA;

    void chooseAndLoad (bool isA);
    void layoutKnob (juce::Slider& s, juce::Rectangle<int>& area, const juce::String& name);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (IRBlenderAudioProcessorEditor)
};
