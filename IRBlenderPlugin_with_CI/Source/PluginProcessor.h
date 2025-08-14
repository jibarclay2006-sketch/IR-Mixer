#pragma once
#include <JuceHeader.h>

class IRBlenderAudioProcessor : public juce::AudioProcessor
{
public:
    IRBlenderAudioProcessor();
    ~IRBlenderAudioProcessor() override = default;

    //==============================================================================
    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    //==============================================================================
    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    //==============================================================================
    const juce::String getName() const override { return "IRBlender"; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    //==============================================================================
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    //==============================================================================
    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    //==============================================================================
    juce::AudioProcessorValueTreeState apvts;

    void loadIR (bool isA, const juce::File& file);
    void setIRFromBuffer (bool isA, juce::AudioBuffer<float>& buffer, double fileSR);

private:
    // parameter helpers
    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();

    // per-path DSP
    struct Path
    {
        juce::dsp::ProcessorDuplicator<juce::dsp::IIR::Filter<float>, juce::dsp::IIR::Coefficients<float>> hp;
        juce::dsp::ProcessorDuplicator<juce::dsp::IIR::Filter<float>, juce::dsp::IIR::Coefficients<float>> lp;
        juce::dsp::ProcessorDuplicator<juce::dsp::IIR::Filter<float>, juce::dsp::IIR::Coefficients<float>> peak; // resonance @100 Hz
        juce::dsp::Convolution convolver;
        juce::dsp::DelayLine<float, juce::dsp::DelayLineInterpolationTypes::Linear> delay { 48000 }; // will resize
        juce::dsp::Gain<float> gain;
        bool loaded = false;
    };

    Path pathA, pathB;

    float lastSR = 48000.0f;

    void updateFilters();
    void updateDelays();
    void updateGainsAndPolarity();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (IRBlenderAudioProcessor)
};
