cmake_minimum_required(VERSION 3.22)
project(IRBlender VERSION 0.1.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if (NOT DEFINED JUCE_DIR)
  message(FATAL_ERROR "Please configure with -DJUCE_DIR=/path/to/JUCE")
endif()

# VST3 SDK path for JUCE's VST3 wrapper
if (DEFINED VST3_SDK_DIR)
  set(VST3_SDK_PATH ${VST3_SDK_DIR})
endif()

add_subdirectory(${JUCE_DIR} JUCE)

juce_add_plugin(IRBlender
    COMPANY_NAME "ChatGPT"
    BUNDLE_ID com.chatgpt.irblender
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    COPY_PLUGIN_AFTER_BUILD TRUE
    PLUGIN_MANUFACTURER_CODE Chat
    PLUGIN_CODE IRBd
    FORMATS VST3 Standalone
    PRODUCT_NAME "IRBlender")

target_sources(IRBlender PRIVATE
    Source/PluginProcessor.cpp
    Source/PluginProcessor.h
    Source/PluginEditor.cpp
    Source/PluginEditor.h
    Source/IRUtils.h)

target_compile_definitions(IRBlender PRIVATE
    JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_DISPLAY_SPLASH_SCREEN=0)

target_link_libraries(IRBlender PRIVATE
    juce::juce_audio_utils
    juce::juce_dsp)
