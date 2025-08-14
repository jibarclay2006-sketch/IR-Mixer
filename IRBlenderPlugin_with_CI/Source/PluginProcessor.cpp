#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "IRUtils.h"

IRBlenderAudioProcessor::IRBlenderAudioProcessor()
: AudioProcessor (BusesProperties()
                    .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
                    .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
  apvts (*this, nullptr, "PARAMS", createLayout())
{}

juce::AudioProcessorValueTreeState::ParameterLayout IRBlenderAudioProcessor::createLayout()
{
    using namespace juce;
    std::vector<std::unique_ptr<RangedAudioParameter>> params;

    auto dB = [](float min, float max){ return NormalisableRange<float>(min, max); };
    auto Hz = [](float min, float max){ return NormalisableRange<float>(min, max); };

    // A
    params.push_back (std::make_unique<AudioParameterFloat>("aGain", "A Gain (dB)", dB(-24, 24), 0));
    params.push_back (std::make_unique<AudioParameterFloat>("aHP",   "A HighPass (Hz)", Hz(10, 400), 60));
    params.push_back (std::make_unique<AudioParameterFloat>("aLP",   "A LowPass (Hz)", Hz(2000, 20000), 12000));
    params.push_back (std::make_unique<AudioParameterFloat>("aRes",  "A Resonance (dB)", dB(-12, 12), 0));
    params.push_back (std::make_unique<AudioParameterFloat>("aOff",  "A Offset (ms)", NormalisableRange<float>(-50, 50), 0));
    params.push_back (std::make_unique<AudioParameterBool>("aFlip",  "A Polarity", false));

    // B
    params.push_back (std::make_unique<AudioParameterFloat>("bGain", "B Gain (dB)", dB(-24, 24), 0));
    params.push_back (std::make_unique<AudioParameterFloat>("bHP",   "B HighPass (Hz)", Hz(10, 400), 60));
    params.push_back (std::make_unique<AudioParameterFloat>("bLP",   "B LowPass (Hz)", Hz(2000, 20000), 12000));
    params.push_back (std::make_unique<AudioParameterFloat>("bRes",  "B Resonance (dB)", dB(-12, 12), 0));
    params.push_back (std::make_unique<AudioParameterFloat>("bOff",  "B Offset (ms)", NormalisableRange<float>(-50, 50), 0));
    params.push_back (std::make_unique<AudioParameterBool>("bFlip",  "B Polarity", false));

    // Global
    params.push_back (std::make_unique<AudioParameterFloat>("blend","Blend B %", NormalisableRange<float>(0, 100), 50));
    params.push_back (std::make_unique<AudioParameterFloat>("outGain","Output Gain (dB)", dB(-24, 12), 0));

    return { params.begin(), params.end() };
}

bool IRBlenderAudioProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    // Mono or Stereo in/out
    auto mainIn  = layouts.getChannelSet (true,  0);
    auto mainOut = layouts.getChannelSet (false, 0);
    if (mainOut != juce::AudioChannelSet::mono()  &&
        mainOut != juce::AudioChannelSet::stereo()) return false;
    if (mainIn.isDisabled()) return false;
    return mainIn == mainOut || (mainIn == juce::AudioChannelSet::mono() && mainOut == juce::AudioChannelSet::stereo());
}

void IRBlenderAudioProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    lastSR = (float) sampleRate;

    auto spec = juce::dsp::ProcessSpec{ sampleRate, (juce::uint32) samplesPerBlock, (juce::uint32) getTotalNumOutputChannels() };

    auto setupPath = [&spec](Path& p)
    {
        p.hp.reset(); p.lp.reset(); p.peak.reset(); p.convolver.reset();
        p.hp.prepare(spec);
        p.lp.prepare(spec);
        p.peak.prepare(spec);
        p.convolver.prepare(spec);
        p.gain.prepare(spec);
        p.delay.reset();
        p.delay.setMaximumDelayInSamples ((int) (spec.sampleRate * 0.1)); // 100 ms max
        p.delay.setDelay (0.0f);
        p.gain.setGainLinear (1.0f);
    };

    setupPath (pathA);
    setupPath (pathB);

    updateFilters();
    updateDelays();
    updateGainsAndPolarity();
}

void IRBlenderAudioProcessor::updateFilters()
{
    auto aHP  = apvts.getRawParameterValue("aHP")->load();
    auto aLP  = apvts.getRawParameterValue("aLP")->load();
    auto aRes = apvts.getRawParameterValue("aRes")->load();

    auto bHP  = apvts.getRawParameterValue("bHP")->load();
    auto bLP  = apvts.getRawParameterValue("bLP")->load();
    auto bRes = apvts.getRawParameterValue("bRes")->load();

    *pathA.hp.state  = *juce::dsp::IIR::Coefficients<float>::makeHighPass (lastSR, juce::jlimit(10.0f, 400.0f, aHP));
    *pathA.lp.state  = *juce::dsp::IIR::Coefficients<float>::makeLowPass  (lastSR, juce::jlimit(2000.0f, 20000.0f, aLP));
    *pathA.peak.state= *juce::dsp::IIR::Coefficients<float>::makePeakFilter(lastSR, 100.0f, 1.1f, juce::Decibels::decibelsToGain(aRes));

    *pathB.hp.state  = *juce::dsp::IIR::Coefficients<float>::makeHighPass (lastSR, juce::jlimit(10.0f, 400.0f, bHP));
    *pathB.lp.state  = *juce::dsp::IIR::Coefficients<float>::makeLowPass  (lastSR, juce::jlimit(2000.0f, 20000.0f, bLP));
    *pathB.peak.state= *juce::dsp::IIR::Coefficients<float>::makePeakFilter(lastSR, 100.0f, 1.1f, juce::Decibels::decibelsToGain(bRes));
}

void IRBlenderAudioProcessor::updateDelays()
{
    auto aOff = apvts.getRawParameterValue("aOff")->load(); // ms
    auto bOff = apvts.getRawParameterValue("bOff")->load(); // ms

    // make both non-negative by subtracting the min offset (relative alignment)
    float minMs = std::min (aOff, bOff);
    aOff -= minMs; bOff -= minMs;

    pathA.delay.setDelay (aOff * 0.001f * lastSR);
    pathB.delay.setDelay (bOff * 0.001f * lastSR);
}

void IRBlenderAudioProcessor::updateGainsAndPolarity()
{
    auto aG = apvts.getRawParameterValue("aGain")->load();
    auto bG = apvts.getRawParameterValue("bGain")->load();
    auto aFlip = apvts.getRawParameterValue("aFlip")->load() > 0.5f ? -1.0f : 1.0f;
    auto bFlip = apvts.getRawParameterValue("bFlip")->load() > 0.5f ? -1.0f : 1.0f;

    pathA.gain.setGainLinear (juce::Decibels::decibelsToGain(aG) * aFlip);
    pathB.gain.setGainLinear (juce::Decibels::decibelsToGain(bG) * bFlip);
}

void IRBlenderAudioProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    juce::ScopedNoDenormals noDenormals;
    auto totalCh = getTotalNumOutputChannels();
    auto numSamples = buffer.getNumSamples();

    updateFilters();
    updateDelays();
    updateGainsAndPolarity();

    juce::AudioBuffer<float> aBuf (totalCh, numSamples);
    juce::AudioBuffer<float> bBuf (totalCh, numSamples);
    aBuf.makeCopyOf (buffer);
    bBuf.makeCopyOf (buffer);

    juce::dsp::AudioBlock<float> blockA (aBuf), blockB (bBuf);

    // per-path: HP -> LP -> PEAK -> CONV -> DELAY -> GAIN
    pathA.hp.process   (juce::dsp::ProcessContextReplacing<float> (blockA));
    pathA.lp.process   (juce::dsp::ProcessContextReplacing<float> (blockA));
    pathA.peak.process (juce::dsp::ProcessContextReplacing<float> (blockA));
    if (pathA.loaded)  pathA.convolver.process (juce::dsp::ProcessContextReplacing<float> (blockA));
    pathA.delay.process(juce::dsp::ProcessContextReplacing<float> (blockA));
    pathA.gain .process(juce::dsp::ProcessContextReplacing<float> (blockA));

    pathB.hp.process   (juce::dsp::ProcessContextReplacing<float> (blockB));
    pathB.lp.process   (juce::dsp::ProcessContextReplacing<float> (blockB));
    pathB.peak.process (juce::dsp::ProcessContextReplacing<float> (blockB));
    if (pathB.loaded)  pathB.convolver.process (juce::dsp::ProcessContextReplacing<float> (blockB));
    pathB.delay.process(juce::dsp::ProcessContextReplacing<float> (blockB));
    pathB.gain .process(juce::dsp::ProcessContextReplacing<float> (blockB));

    auto blendB = apvts.getRawParameterValue("blend")->load() / 100.0f;
    auto outGain = apvts.getRawParameterValue("outGain")->load();

    for (int ch = 0; ch < totalCh; ++ch)
    {
        auto* dst = buffer.getWritePointer (ch);
        auto* a   = aBuf.getReadPointer   (ch);
        auto* b   = bBuf.getReadPointer   (ch);
        for (int n = 0; n < numSamples; ++n)
            dst[n] = (1.0f - blendB) * a[n] + blendB * b[n];
    }

    buffer.applyGain (juce::Decibels::decibelsToGain (outGain));
}

void IRBlenderAudioProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    juce::MemoryOutputStream mos (destData, true);
    state.writeToStream (mos);
}

void IRBlenderAudioProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    auto state = juce::ValueTree::readFromData (data, sizeInBytes);
    if (state.isValid())
        apvts.replaceState (state);
}

void IRBlenderAudioProcessor::loadIR (bool isA, const juce::File& file)
{
    auto& p = isA ? pathA : pathB;
    p.convolver.loadImpulseResponse (file,
        juce::dsp::Convolution::Stereo::no,      // mono IR by default (left)
        juce::dsp::Convolution::Trim::yes,
        0, juce::dsp::Convolution::Normalise::yes);
    p.loaded = true;
}

void IRBlenderAudioProcessor::setIRFromBuffer (bool isA, juce::AudioBuffer<float>& buffer, double fileSR)
{
    auto& p = isA ? pathA : pathB;
    p.convolver.loadImpulseResponse (buffer, fileSR,
        juce::dsp::Convolution::Stereo::no,
        juce::dsp::Convolution::Trim::yes,
        juce::dsp::Convolution::Normalise::yes);
    p.loaded = true;
}

juce::AudioProcessorEditor* IRBlenderAudioProcessor::createEditor()
{
    return new IRBlenderAudioProcessorEditor (*this);
}
