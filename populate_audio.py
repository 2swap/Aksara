#!/usr/bin/env python3
import json
import re
import os
from pathlib import Path
from openai import OpenAI

def get_openai_key():
    key_path = Path.home() / "openaikey"
    if not key_path.exists():
        raise RuntimeError(f"OpenAI key file not found at {key_path}")
    return key_path.read_text(encoding="utf-8").strip()

client = OpenAI(api_key=get_openai_key())

def lang_tts_prompt(lang: str) -> str:
    if lang.lower() == "telugu":
        return "తెలుగులో మాట్లాడు."  # Speak in Telugu (native)
    return f"Speak in {lang}."

def safe_filename(name: str, fallback: str = "audio") -> str:
    s = re.sub(r'[^A-Za-z0-9._-]', '_', name)
    return s or fallback

def generate_tts(text: str, instructions: str, audio_filepath: str):
    try:
        with client.audio.speech.with_streaming_response.create(
            model="gpt-4o-mini-tts",
            voice="nova",
            input=text,
            instructions=instructions
        ) as response:
            response.stream_to_file(audio_filepath)
    except Exception as e:
        print(f"[ERROR] Failed to generate TTS for '{text}': {e}")

def main():
    words_path = Path("./words.json")
    if not words_path.exists():
        print(f"words.json not found at {words_path.resolve()}")
        return

    out_dir = Path("./public/audio")
    out_dir.mkdir(parents=True, exist_ok=True)

    with words_path.open("r", encoding="utf-8") as f:
        items = json.load(f)

    for item in items:
        word = item.get("word")
        audio_name = item.get("audio")
        if not word:
            print("[WARN] Skipping item without 'word':", item)
            continue

        if not audio_name or not isinstance(audio_name, str):
            # create a safe filename from the word
            audio_name = safe_filename(word) + ".mp3"

        target_path = out_dir / audio_name

        if target_path.exists():
            print(f"[SKIP] {audio_name} already exists")
            continue

        instructions = lang_tts_prompt("Telugu")
        print(f"[GEN] Generating audio for '{word}' -> {target_path}")
        generate_tts(word, instructions, str(target_path))

    print("Done.")

if __name__ == "__main__":
    main()

