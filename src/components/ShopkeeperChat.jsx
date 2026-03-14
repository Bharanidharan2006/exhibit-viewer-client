import React, { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import api from "../api.js";

/**
 * ShopkeeperChat — floating voice interaction panel
 *
 * Props:
 * - exhibitionId: string
 * - visible: boolean (proximity trigger)
 * - onClose: function
 */
export default function ShopkeeperChat({ exhibitionId, visible, onClose }) {
  const [state, setState] = useState("idle"); // idle | listening | processing | speaking
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const audioRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
      synthRef.current.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const startListening = useCallback(() => {
    setError("");
    setReply("");
    setTranscript("");

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    setState("listening");

    let finalTranscript = "";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t;
        } else {
          interim += t;
        }
      }
      setTranscript(finalTranscript + interim);
    };

    recognition.onend = () => {
      const text = finalTranscript.trim();
      if (text) {
        setTranscript(text);
        sendToLLM(text);
      } else {
        setState("idle");
      }
    };

    recognition.onerror = (e) => {
      console.error("Speech recognition error:", e.error);
      if (e.error !== "aborted") {
        setError(`Mic error: ${e.error}`);
      }
      setState("idle");
    };

    recognition.start();
  }, [exhibitionId]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const sendToLLM = useCallback(async (text) => {
    setState("processing");
    try {
      const { data } = await api.post(`/chat/${exhibitionId}`, { 
        message: text,
        history: history.slice(-10) // Keep the last 10 messages for context
      });
      setReply(data.reply);
      
      // Save the conversational turn instantly
      setHistory(prev => [...prev, { role: "user", content: text }, { role: "assistant", content: data.reply }]);

      // Play response
      setState("speaking");

      if (data.ttsProvider === "elevenlabs" && data.audioUrl) {
        // Play ElevenLabs audio
        const audio = new Audio(data.audioUrl);
        audioRef.current = audio;
        audio.onended = () => {
          setState("idle");
          audioRef.current = null;
        };
        audio.onerror = () => {
          // Fallback to browser TTS on audio error
          playBrowserTTS(data.reply);
        };
        audio.play();
      } else {
        // Browser TTS
        playBrowserTTS(data.reply);
      }
    } catch (err) {
      console.error("Chat error:", err);
      // Try to extract the exact server error message if available
      const serverDetails = err.response?.data?.errorInfo || err.response?.data?.message || err.message;
      setError(`Failed: ${serverDetails}`);
      setState("idle");
    }
  }, [exhibitionId]);

  const playBrowserTTS = useCallback((text) => {
    const synth = synthRef.current;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    // Try to find a good English voice
    const voices = synth.getVoices();
    const englishVoice = voices.find(
      (v) => v.lang.startsWith("en") && v.name.includes("Google")
    ) || voices.find((v) => v.lang.startsWith("en"));
    if (englishVoice) utterance.voice = englishVoice;

    utterance.onend = () => setState("idle");
    utterance.onerror = () => setState("idle");
    synth.speak(utterance);
  }, []);

  // Render entirely outside the Viewer DOM hierarchy using a React Portal
  return createPortal(
    <div
      style={{
        display: visible ? "block" : "none",
        position: "fixed",
        bottom: "2rem",
        right: "2rem",
        zIndex: 9999,
        width: 320,
        background: "rgba(10,8,5,0.92)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(196,162,101,0.3)",
        borderRadius: "12px",
        padding: "1.5rem",
        animation: visible ? "shopkeeperSlideIn 0.3s ease" : "none",
        fontFamily: "'Cormorant Garamond', serif",
        color: "#f5f0e8",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <div
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.7rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#c4a265",
              marginBottom: "0.2rem",
            }}
          >
            Gallery Assistant
          </div>
          <div style={{ fontSize: "1.1rem", fontWeight: 300, fontStyle: "italic" }}>
            Ask me anything
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "#8a7f72",
            fontSize: "1.2rem",
            cursor: "pointer",
            padding: "0.25rem",
          }}
        >
          ✕
        </button>
      </div>

      {/* Transcript / Reply area */}
      <div
        style={{
          minHeight: 60,
          marginBottom: "1rem",
          padding: "0.8rem",
          background: "rgba(255,255,255,0.06)",
          borderRadius: "8px",
          border: "1px solid rgba(196,162,101,0.15)",
          fontSize: "0.9rem",
          fontWeight: 300,
          lineHeight: 1.6,
        }}
      >
        {state === "idle" && !reply && !error && (
          <span style={{ color: "#8a7f72", fontStyle: "italic" }}>
            Tap the mic and speak…
          </span>
        )}
        {state === "listening" && (
          <div>
            <div
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.65rem",
                color: "#c4a265",
                letterSpacing: "0.15em",
                marginBottom: "0.4rem",
              }}
            >
              🎙 LISTENING…
            </div>
            <div>{transcript || <span style={{ color: "#8a7f72" }}>Speak now…</span>}</div>
          </div>
        )}
        {state === "processing" && (
          <div style={{ textAlign: "center", padding: "0.5rem 0" }}>
            <div className="shopkeeper-dots" style={{ marginBottom: "0.4rem" }}>
              <span style={dotStyle(0)}>●</span>
              <span style={dotStyle(1)}>●</span>
              <span style={dotStyle(2)}>●</span>
            </div>
            <div
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.65rem",
                color: "#c4a265",
                letterSpacing: "0.15em",
              }}
            >
              THINKING…
            </div>
          </div>
        )}
        {state === "speaking" && reply && (
          <div>
            <div
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.65rem",
                color: "#4a8c5c",
                letterSpacing: "0.15em",
                marginBottom: "0.4rem",
              }}
            >
              🔊 SPEAKING…
            </div>
            <div>{reply}</div>
          </div>
        )}
        {state === "idle" && reply && (
          <div>{reply}</div>
        )}
        {error && (
          <div style={{ color: "#b94040", fontFamily: "'DM Mono', monospace", fontSize: "0.7rem" }}>
            {error}
          </div>
        )}
      </div>

      {/* You said (transcript when reply is shown) */}
      {reply && transcript && state !== "listening" && (
        <div
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: "0.65rem",
            color: "#8a7f72",
            marginBottom: "1rem",
            letterSpacing: "0.05em",
          }}
        >
          You: "{transcript}"
        </div>
      )}

      {/* Mic button */}
      <div style={{ textAlign: "center" }}>
        {state === "listening" ? (
          <button onClick={stopListening} style={micBtnStyle(true)}>
            <span style={{ fontSize: "1.3rem" }}>⬛</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.65rem", letterSpacing: "0.1em" }}>
              STOP
            </span>
          </button>
        ) : (
          <button
            onClick={startListening}
            disabled={state === "processing" || state === "speaking"}
            style={micBtnStyle(false, state === "processing" || state === "speaking")}
          >
            <span style={{ fontSize: "1.3rem" }}>🎙</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.65rem", letterSpacing: "0.1em" }}>
              {state === "processing" ? "WAIT…" : state === "speaking" ? "SPEAKING…" : "SPEAK"}
            </span>
          </button>
        )}
      </div>

      <style>{`
        @keyframes shopkeeperSlideIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>,
    document.body
  );
}

function dotStyle(idx) {
  return {
    display: "inline-block",
    color: "#c4a265",
    fontSize: "1.2rem",
    margin: "0 0.2rem",
    animation: `dotPulse 1.4s infinite ease-in-out ${idx * 0.2}s`,
  };
}

function micBtnStyle(isActive, disabled = false) {
  return {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.4rem",
    padding: "1rem 2rem",
    borderRadius: "50px",
    border: `2px solid ${isActive ? "#b94040" : "rgba(196,162,101,0.5)"}`,
    background: isActive
      ? "rgba(185,64,64,0.15)"
      : "rgba(196,162,101,0.1)",
    color: isActive ? "#e87070" : "#c4a265",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "all 0.2s",
  };
}
