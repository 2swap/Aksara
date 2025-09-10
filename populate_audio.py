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
        return "తెలుగులో రెండు వాక్యాలు మాట్లాడండి."
    if lang.lower() == "hindi":
        return "हिंदी में बोलो।"
    if lang.lower() == "georgian":
        return "ქართული ენა."
    if lang.lower() == "japanese":
        return "日本語で話してください。"
    if lang.lower() == "korean":
        return "한국어로 말하세요."
    if lang.lower() == "tamil":
        return "தமிழில் பேசுங்கள்."
    else:
        exit(f"Unsupported language: {lang}")

def safe_filename(name: str, fallback: str = "audio") -> str:
    s = re.sub(r'[^A-Za-z0-9._-]', '_', name)
    return s or fallback

# Call OpenAI to make a simple sentence using the word
def make_sentence(word: str, lang: str) -> str:
    prompt = f"Make a simple sentence using the word '{word}' in {lang}, 5 words or less. Only return the sentence, no extra text."
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that makes simple sentences."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=50,
        )
        return word + ". " + response.choices[0].message.content.strip() + ". " + word + "."
    except Exception as e:
        print(f"[ERROR] Failed to generate sentence for '{word}': {e}")
        return word

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
    words_dir = Path("./words")
    if not words_dir.exists() or not words_dir.is_dir():
        print(f"words directory not found at {words_dir.resolve()}")
        return

    base_out_dir = Path("./public/audio")
    base_out_dir.mkdir(parents=True, exist_ok=True)

    json_files = sorted(words_dir.glob("*.json"))
    if not json_files:
        print(f"No .json files found in {words_dir.resolve()}")
        return

    for lang_file in json_files:
        language = lang_file.stem  # e.g., 'telugu' from 'telugu.json'
        try:
            instructions = lang_tts_prompt(language)
        except Exception as e:
            print(f"[WARN] Skipping unsupported language file {lang_file.name}: {e}")
            continue

        out_dir = base_out_dir / language.lower()
        out_dir.mkdir(parents=True, exist_ok=True)

        with lang_file.open("r", encoding="utf-8") as f:
            try:
                items = json.load(f)
            except Exception as e:
                print(f"[ERROR] Failed to load {lang_file}: {e}")
                continue

        for item in items:
            word = item.get("word")
            audio_name = item.get("audio")
            if not word:
                print("[WARN] Skipping item without 'word':", item)
                continue

            if not audio_name or not isinstance(audio_name, str):
                audio_name = safe_filename(word) + ".mp3"

            target_path = out_dir / audio_name

            if target_path.exists():
                print(f"[SKIP] {language}/{audio_name} already exists")
                continue

            print(f"[GEN] Generating audio for '{word}' ({language}) -> {target_path}")
            generate_tts(make_sentence(word, language), instructions, str(target_path))

    print("Done.")

if __name__ == "__main__":
    main()
